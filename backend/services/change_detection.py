"""Compare two dates and build the report."""
from __future__ import annotations

import numpy as np


def pair_problems(a: dict, b: dict) -> list[str]:
    """Reasons we can't compare these two. Empty list means ok."""
    problems = []
    if a["id"] == b["id"]:
        return ["Date A and Date B are the same granule."]
    if a["product"] != "GCOV" or b["product"] != "GCOV":
        problems.append("Only GCOV (backscatter) granules can be compared.")
    pa, pb = a["pairing"], b["pairing"]
    for key, label in (("track", "track"), ("frame", "frame"), ("direction", "orbit direction")):
        if pa.get(key) is None or pb.get(key) is None:
            problems.append(f"The {label} is missing from the metadata, so the pair cannot be checked.")
        elif pa[key] != pb[key]:
            problems.append(f"Different {label}: A={pa[key]}, B={pb[key]}.")
    if not common_pol(a, b):
        problems.append(f"No shared co-polarisation: A={pa.get('polarizations')}, B={pb.get('polarizations')}.")
    if (a.get("start") or "")[:10] == (b.get("start") or "")[:10]:
        problems.append("Both observations are from the same day.")
    return problems


def pair_cautions(a: dict, b: dict) -> list[str]:
    """Warnings shown with the result."""
    notes = []
    if a.get("maturity") != b.get("maturity"):
        notes.append(f"Mixed data releases: Date A is {a.get('maturity')}, Date B is {b.get('maturity')}. "
                     "Calibration may differ between releases, so part of the change can be processing, not the ground.")
    if "BETA" in (a.get("maturity"), b.get("maturity")):
        notes.append("BETA products are an early NISAR release (older processing version). Treat the result with extra caution.")
    return notes


def common_pol(a: dict, b: dict) -> str | None:
    """Use HH if both have it, else VV."""
    pa, pb = set(a["pairing"].get("polarizations") or []), set(b["pairing"].get("polarizations") or [])
    for p in ("HH", "VV"):
        if p in pa and p in pb:
            return p + p
    return None


def grid_problems(wa: dict, wb: dict) -> list[str]:
    """Both windows must be on the same grid."""
    if wa["epsg"] != wb["epsg"]:
        return [f"Different map projections: EPSG {wa['epsg']} vs {wb['epsg']}."]
    if not np.allclose(wa["spacing"], wb["spacing"]):
        return [f"Different pixel spacing: {wa['spacing']} vs {wb['spacing']}."]
    if wa["x"].shape != wb["x"].shape or wa["y"].shape != wb["y"].shape \
            or not np.allclose(wa["x"], wb["x"]) or not np.allclose(wa["y"], wb["y"]):
        return ["The two windows are not on the same pixel grid, so a pixel-by-pixel difference would be wrong."]
    return []


def _box_mean(values: np.ndarray, valid: np.ndarray, size: int) -> np.ndarray:
    """Average of valid pixels in a box, to reduce noise."""
    v = np.where(valid, values, 0.0).astype(np.float64)
    n = valid.astype(np.float64)
    pad = size // 2

    def box_sum(arr):
        c = np.pad(arr, pad, mode="constant").cumsum(0).cumsum(1)
        c = np.pad(c, ((1, 0), (1, 0)))
        return c[size:, size:] - c[:-size, size:] - c[size:, :-size] + c[:-size, :-size]

    total, count = box_sum(v), box_sum(n)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(count > 0, total / count, np.nan)


def difference_db(wa: dict, wb: dict, smooth_px: int = 5) -> tuple[np.ndarray, dict]:
    """B minus A in dB, with a little smoothing."""
    valid = np.isfinite(wa["db"]) & np.isfinite(wb["db"])
    diff = (wb["db"] - wa["db"]).astype(np.float32)
    if smooth_px > 1:
        diff = _box_mean(diff, valid, smooth_px).astype(np.float32)
    diff[~valid] = np.nan
    d = diff[valid]
    stats = {
        "valid_pixels": int(valid.sum()), "total_pixels": int(valid.size),
        "smoothing": f"{smooth_px}x{smooth_px} box mean" if smooth_px > 1 else "none",
    }
    if d.size:
        stats.update({
            "median_db": round(float(np.median(d)), 2),
            "p05_db": round(float(np.percentile(d, 5)), 2), "p95_db": round(float(np.percentile(d, 95)), 2),
            "pct_increase_gt3db": round(100 * float((d > 3).mean()), 2),
            "pct_decrease_gt3db": round(100 * float((d < -3).mean()), 2),
        })
    return diff, stats


STRONG_DB = 3.0      # clear change
DARK_DB = -20.0      # darker than this is usually water
BLOCK_PX = 20        # 20 px = 200 m
COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]


def _bearing_name(dx: float, dy: float) -> str:
    angle = (np.degrees(np.arctan2(dx, dy)) + 360) % 360  # 0 = north
    return COMPASS[int((angle + 22.5) // 45) % 8]


def _hotspots(diff, x, y, epsg, centre_xy, spacing_m, max_spots=5):
    """Find blocks where most pixels changed the same way."""
    from pyproj import Transformer
    h, w = diff.shape
    hb, wb = h // BLOCK_PX, w // BLOCK_PX
    d = diff[:hb * BLOCK_PX, :wb * BLOCK_PX].reshape(hb, BLOCK_PX, wb, BLOCK_PX)
    valid = np.isfinite(d)
    n_valid = valid.sum(axis=(1, 3))
    up = (valid & (np.nan_to_num(d) > STRONG_DB)).sum(axis=(1, 3))
    down = (valid & (np.nan_to_num(d) < -STRONG_DB)).sum(axis=(1, 3))
    with np.errstate(invalid="ignore", divide="ignore"):
        frac = np.where(n_valid > BLOCK_PX * BLOCK_PX // 2, np.maximum(up, down) / np.maximum(n_valid, 1), 0)
    to_ll = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    pixel_ha = spacing_m * spacing_m / 10000
    spots, taken = [], np.zeros(frac.shape, dtype=bool)
    for idx in np.argsort(frac, axis=None)[::-1]:
        r, c = divmod(int(idx), wb)
        if frac[r, c] < 0.3 or len(spots) >= max_spots:
            break
        if taken[max(0, r - 2):r + 3, max(0, c - 2):c + 3].any():
            continue  # too close to another one
        taken[r, c] = True
        block = d[r, :, c, :]
        brighter = up[r, c] >= down[r, c]
        cy, cx = (r + 0.5) * BLOCK_PX, (c + 0.5) * BLOCK_PX
        px, py = float(x[0] + cx * (x[1] - x[0])), float(y[0] + cy * (y[1] - y[0]))
        lon, lat = to_ll.transform(px, py)
        dx, dy = px - centre_xy[0], py - centre_xy[1]
        spots.append({
            "lat": round(lat, 6), "lon": round(lon, 6),
            "direction": "brighter" if brighter else "darker",
            "mean_db": round(float(np.nanmean(block)), 1),
            "share_changed_pct": int(round(100 * float(frac[r, c]))),
            "area_ha": round(float(max(up[r, c], down[r, c])) * pixel_ha, 1),
            "distance_km": round(float(np.hypot(dx, dy)) / 1000, 1),
            "bearing": _bearing_name(dx, dy),
        })
    return spots


def build_report(wa: dict, wb: dict, diff: np.ndarray, stats: dict, a: dict, b: dict, lat: float, lon: float) -> dict:
    """Build a simple report from the result."""
    from datetime import datetime
    from pyproj import Transformer
    valid = np.isfinite(diff)
    if not valid.any():
        return {}
    spacing_m = abs(float(wa["spacing"][0]))
    pixel_ha = spacing_m * spacing_m / 10000
    up_pct, down_pct = stats["pct_increase_gt3db"], stats["pct_decrease_gt3db"]
    changed_pct = round(up_pct + down_pct, 2)
    total_ha = float(valid.sum()) * pixel_ha
    centre = Transformer.from_crs("EPSG:4326", f"EPSG:{wa['epsg']}", always_xy=True).transform(lon, lat)

    # how much is water-like before and after
    both = np.isfinite(wa["db"]) & np.isfinite(wb["db"])
    dark_a = 100 * float((wa["db"][both] < DARK_DB).mean())
    dark_b = 100 * float((wb["db"][both] < DARK_DB).mean())

    # split into 3x3 zones (row 0 = north)
    h, w = diff.shape
    names = [["north-west", "north", "north-east"], ["west", "centre", "east"], ["south-west", "south", "south-east"]]
    zones = []
    for i in range(3):
        for j in range(3):
            zv = diff[i * h // 3:(i + 1) * h // 3, j * w // 3:(j + 1) * w // 3]
            zv = zv[np.isfinite(zv)]
            zones.append({"name": names[i][j],
                          "changed_pct": round(100 * float((np.abs(zv) > STRONG_DB).mean()), 2) if zv.size else None,
                          "brighter_pct": round(100 * float((zv > STRONG_DB).mean()), 2) if zv.size else None,
                          "darker_pct": round(100 * float((zv < -STRONG_DB).mean()), 2) if zv.size else None})
    ranked = sorted([z for z in zones if z["changed_pct"] is not None], key=lambda z: -z["changed_pct"])
    spread = ranked[0]["changed_pct"] - ranked[-1]["changed_pct"] if ranked else 0

    # if the whole area changed together (eg rain), remove that first
    shift = float(np.median(diff[valid]))
    has_shift = abs(shift) >= 1.5
    local = diff - shift if has_shift else diff
    lv = local[valid]
    local_pct = round(100 * float((np.abs(lv) > STRONG_DB).mean()), 2)
    local_up = 100 * float((lv > STRONG_DB).mean())
    local_down = 100 * float((lv < -STRONG_DB).mean())
    spots = _hotspots(local, wa["x"], wa["y"], wa["epsg"], centre, spacing_m)
    for spot in spots:
        spot["relative"] = has_shift

    ta = datetime.fromisoformat(a["start"].replace("Z", "+00:00"))
    tb = datetime.fromisoformat(b["start"].replace("Z", "+00:00"))
    days = (tb - ta).days
    month_gap = min((tb.month - ta.month) % 12, (ta.month - tb.month) % 12)
    mixed = a.get("maturity") and b.get("maturity") and a.get("maturity") != b.get("maturity")

    if has_shift:
        level = "shift"
        headline = f"Whole area got {'brighter' if shift > 0 else 'darker'} ({shift:+.1f} dB)"
    elif changed_pct < 2:
        level, headline = "low", "Mostly unchanged"
    elif changed_pct < 10:
        level, headline = "medium", "Some patches changed"
    else:
        level, headline = "high", "Large areas changed"
    if up_pct > down_pct * 1.5:
        trend = "more of it got brighter than darker"
    elif down_pct > up_pct * 1.5:
        trend = "more of it got darker than brighter"
    else:
        trend = "brighter and darker changes are roughly balanced"

    period = f"Between {ta:%d %b %Y} and {tb:%d %b %Y} ({days} days)"
    if has_shift:
        summary = (f"{period}, the radar signal over the whole {total_ha / 100:.0f} km² area moved together by about "
                   f"{shift:+.1f} dB. A shift this even is usually caused by something area-wide: a difference in data "
                   f"processing between releases{' (these dates come from different releases)' if mixed else ''}, "
                   f"or weather such as rain-wet or very dry ground. It is not good evidence of many separate local changes. "
                   f"After removing this shift, {local_pct}% of the area still changed clearly on its own.")
    else:
        summary = (f"{period}, the radar signal in this {total_ha / 100:.0f} km² area "
                   f"{'stayed mostly the same' if level == 'low' else 'changed in places'}. "
                   f"About {changed_pct}% of the area changed clearly (by more than {STRONG_DB:.0f} dB), and {trend}.")
    if spots:
        s = spots[0]
        summary += (f" The strongest {'local ' if has_shift else ''}cluster is about {s['distance_km']} km {s['bearing']} "
                    f"of the search point, where the signal got {s['direction']}.")

    # possible reasons
    causes = []
    if local_up > 0.2:
        causes.append({"pattern": "Brighter areas could be", "examples": [
            "new buildings, walls or other structures", "denser or taller vegetation, crops growing",
            "wetter soil after rain", "rougher ground (ploughing, debris)"]})
    if local_down > 0.2:
        causes.append({"pattern": "Darker areas could be", "examples": [
            "standing water or flooding (calm water reflects radar away)", "harvested fields or cleared vegetation",
            "drier soil", "smoother surfaces (new paving, levelled ground)"]})
    if abs(dark_b - dark_a) >= 0.5:
        causes.append({"pattern": f"Very dark (water-like) area went from {dark_a:.1f}% to {dark_b:.1f}%. This could be", "examples": [
            "more open water (flooding, a fuller reservoir)" if dark_b > dark_a else "less open water (water receding, drying)",
            "or a change in very smooth surfaces such as paving"]})

    notes = []
    if has_shift:
        notes.append(f"Hotspots below are measured relative to the overall {shift:+.1f} dB shift, so they show places "
                     "that changed differently from their surroundings.")
    if mixed:
        notes.append(f"Before is {a['maturity'].lower()} data and After is {b['maturity'].lower()} data. Processing can differ "
                     "between releases; for the most reliable result compare two dates from the same release.")
    if month_gap >= 3:
        notes.append(f"The two dates are in different seasons ({ta:%B} vs {tb:%B}). Rain, crops and vegetation "
                     "change with the seasons, which alone can explain broad, scattered changes.")
    if spread > 1.5:
        notes.append(f"Change is uneven: most in the {ranked[0]['name']} part ({ranked[0]['changed_pct']}% changed), "
                     f"least in the {ranked[-1]['name']} ({ranked[-1]['changed_pct']}%).")
    notes.append("In hilly areas, steep slopes can show changes caused by small differences in how the radar "
                 "viewed them, not by changes on the ground.")
    notes.append("Thin lines or speckled single pixels are usually radar noise; compact clusters are more meaningful.")

    return {
        "level": level, "headline": headline, "summary": summary,
        "period": {"from": a["start"], "to": b["start"], "days": days},
        "area_km2": round(total_ha / 100, 1),
        "overall_shift_db": round(shift, 2), "local_changed_pct": local_pct,
        "changed": {"total_pct": changed_pct, "brighter_pct": up_pct, "darker_pct": down_pct,
                    "brighter_ha": round(up_pct / 100 * total_ha, 1), "darker_ha": round(down_pct / 100 * total_ha, 1)},
        "before_after": {"median_db_before": round(float(np.median(wa["db"][both])), 1),
                         "median_db_after": round(float(np.median(wb["db"][both])), 1),
                         "very_dark_pct_before": round(dark_a, 2), "very_dark_pct_after": round(dark_b, 2)},
        "zones": zones,
        "hotspots": spots,
        "possible_causes": causes,
        "notes": notes,
        "next_steps": [
            "Click the numbered hotspots to zoom in, then compare with a recent satellite photo or street map of the same spot.",
            "Check local news or weather records for the period (heavy rain, floods, construction, fires).",
            "Try the 'Latest two' dates: if the same spots change again, the change is more likely real and ongoing.",
        ],
    }
