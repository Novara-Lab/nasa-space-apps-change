"""Search NISAR data in NASA CMR. No login needed."""
from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

import httpx

CMR_URL = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
# BETA: Oct 2025 - Jan 2026, PROVISIONAL: Jun - Oct 2026, VALIDATED: from Oct 2026
COLLECTIONS = [  # (product, maturity, short name)
    ("GCOV", "BETA", "NISAR_L2_GCOV_BETA_V1"),
    ("GCOV", "PROVISIONAL", "NISAR_L2_GCOV_PROVISIONAL_V1"),
    ("GCOV", "VALIDATED", "NISAR_L2_GCOV_V1"),
    ("GUNW", "BETA", "NISAR_L2_GUNW_BETA_V1"),
    ("GUNW", "PROVISIONAL", "NISAR_L2_GUNW_PROVISIONAL_V1"),
    ("GUNW", "VALIDATED", "NISAR_L2_GUNW_V1"),
]
PRODUCTS = {"GCOV": "Geocoded backscatter (used for change)", "GUNW": "Interferogram (Phase 3)"}
HEADERS = {
    "Accept": "application/vnd.nasa.cmr.umm_results+json",
    "User-Agent": "NISAR-Change-Explorer/0.1 (NASA Space Apps Challenge educational prototype)",
}


def _geometry(umm: dict[str, Any]) -> dict[str, Any] | None:
    """Footprint as GeoJSON, or None."""
    gpolygons = (
        umm.get("SpatialExtent", {}).get("HorizontalSpatialDomain", {})
        .get("Geometry", {}).get("GPolygons", []) or []
    )
    rings = []
    for polygon in gpolygons:
        ring = []
        for p in polygon.get("Boundary", {}).get("Points", []) or []:
            try:
                lon, lat = float(p["Longitude"]), float(p["Latitude"])
            except (KeyError, TypeError, ValueError):
                continue
            if -180 <= lon <= 180 and -90 <= lat <= 90:
                ring.append([lon, lat])
        if len(ring) >= 3:
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            rings.append(ring)
    if not rings:
        return None
    if len(rings) == 1:
        return {"type": "Polygon", "coordinates": rings}
    return {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}


def pairing_info(umm: dict[str, Any]) -> dict[str, Any]:
    """Track, frame and direction used to pair dates."""
    attrs = {a.get("Name"): a.get("Values") or [] for a in umm.get("AdditionalAttributes", []) or []}
    first = lambda name: attrs.get(name, [None])[0]
    return {
        "track": first("TRACK_NUMBER"),
        "frame": first("FRAME_NUMBER"),
        "direction": first("ASCENDING_DESCENDING"),
        "polarizations": attrs.get("FREQUENCY_A_POLARIZATION", []),  # eg ["HH", "HV"]
        "stack_id": first("STACK_ID"),  # eg "084_A_005"
        "full_frame": first("FULL_FRAME"),
    }


def _summary(item: dict[str, Any], product: str, maturity: str, short_name: str) -> dict[str, Any]:
    umm = item.get("umm", {}) or {}
    temporal = umm.get("TemporalExtent", {}).get("RangeDateTime", {}) or {}
    links = [
        {"url": r["URL"], "type": str(r.get("Type", "")), "subtype": str(r.get("Subtype", ""))}
        for r in umm.get("RelatedUrls", []) or []
        if r.get("URL") and r.get("Type") in {"GET DATA", "GET RELATED VISUALIZATION", "VIEW RELATED INFORMATION"}
    ]
    geometry = _geometry(umm)
    return {
        "id": umm.get("GranuleUR") or item.get("meta", {}).get("concept-id") or "NISAR granule",
        "product": product,
        "maturity": maturity,
        "collection": short_name,
        "start": temporal.get("BeginningDateTime"),
        "end": temporal.get("EndingDateTime"),
        "geometry": geometry,
        "hasFootprint": geometry is not None,
        "pairing": pairing_info(umm),
        "links": links[:8],
    }


_granule_cache: dict[str, dict[str, Any]] = {}


def get_granule(granule_id: str) -> dict[str, Any] | None:
    """Get one granule by its id (cached)."""
    if granule_id in _granule_cache:
        return _granule_cache[granule_id]
    r = httpx.get(CMR_URL, params={"provider": "ASF", "granule_ur": granule_id}, headers=HEADERS, timeout=30)
    r.raise_for_status()
    for item in r.json().get("items", []):
        short_name = (item.get("umm", {}).get("CollectionReference") or {}).get("ShortName")
        for product, maturity, sn in COLLECTIONS:
            if sn == short_name:
                _granule_cache[granule_id] = _summary(item, product, maturity, sn)
                return _granule_cache[granule_id]
    return None


async def _search_collection(client, product, maturity, short_name, lat, lon, radius_km, start, end, limit):
    params = {
        "short_name": short_name,
        "temporal": f"{start.isoformat()}T00:00:00Z,{end.isoformat()}T23:59:59Z",
        "page_size": str(limit),
        "sort_key": "-start_date",
    }
    if radius_km:
        params["circle"] = f"{lon},{lat},{radius_km * 1000:.0f}"
    else:
        params["point"] = f"{lon},{lat}"
    response = await client.get(CMR_URL, params=params)
    response.raise_for_status()
    items = [_summary(item, product, maturity, short_name) for item in response.json().get("items", []) or []]
    total = int(response.headers.get("CMR-Hits", len(items)))  # total matches
    return items, total


async def search_observations(lat: float, lon: float, radius_km: float,
                              start: date, end: date, limit: int) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Search all collections, newest first."""
    timeout = httpx.Timeout(25.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, headers=HEADERS) as client:
        results = await asyncio.gather(*[
            _search_collection(client, prod, mat, sn, lat, lon, radius_km, start, end, limit)
            for prod, mat, sn in COLLECTIONS
        ])
    observations = [o for items, _ in results for o in items]
    observations.sort(key=lambda o: o.get("start") or "", reverse=True)
    totals: dict[str, int] = {}
    for (prod, _, _), (_, total) in zip(COLLECTIONS, results):
        totals[prod] = totals.get(prod, 0) + total
    return observations, totals


MATURITY_RANK = {"VALIDATED": 3, "PROVISIONAL": 2, "BETA": 1}


def group_stacks(observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group dates with same track, frame and direction. Duplicates keep the best release."""
    stacks: dict[str, dict[str, Any]] = {}
    for o in observations:
        p = o["pairing"]
        if o["product"] != "GCOV" or not p.get("track") or not p.get("frame") or not p.get("direction"):
            continue
        key = p.get("stack_id") or f"{p['track']}_{p['direction'][0]}_{p['frame']}"
        s = stacks.setdefault(key, {"stack_id": key, "track": p["track"], "frame": p["frame"],
                                    "direction": p["direction"], "polarizations": p["polarizations"],
                                    "by_time": {}})
        when = (o["start"] or "")[:19]
        old = s["by_time"].get(when)
        if not old or MATURITY_RANK.get(o["maturity"], 0) > MATURITY_RANK.get(old["maturity"], 0):
            s["by_time"][when] = {"id": o["id"], "start": o["start"], "maturity": o["maturity"],
                                  "full_frame": p.get("full_frame") != "FALSE"}
    out = []
    for s in stacks.values():
        dates = sorted(s.pop("by_time").values(), key=lambda d: d["start"])
        s.update(dates=dates, count=len(dates), first=dates[0]["start"], last=dates[-1]["start"])
        out.append(s)
    return sorted(out, key=lambda s: -s["count"])
