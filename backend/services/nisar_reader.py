"""Read a small part of a NISAR file around a point without downloading it. Needs earthdata login."""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np

CACHE_DIR = Path(__file__).resolve().parents[1] / "cache" / "windows"
GRID = "/science/LSAR/GCOV/grids/frequencyA"
WINDOW_PX = 1024  # about 10 km
READER_VERSION = "r2"  # change this to ignore old cache


class ReaderError(RuntimeError):
    """Error shown to the user."""


_logged_in = False


def _login():
    global _logged_in
    if _logged_in:
        return
    import earthaccess
    # remove empty values
    for key in ("EARTHDATA_TOKEN", "EARTHDATA_USERNAME", "EARTHDATA_PASSWORD"):
        if not os.environ.get(key):
            os.environ.pop(key, None)
    if not (os.environ.get("EARTHDATA_TOKEN") or
            (os.environ.get("EARTHDATA_USERNAME") and os.environ.get("EARTHDATA_PASSWORD"))):
        raise ReaderError("No Earthdata login configured. Copy backend/.env.example to backend/.env, "
                          "fill in EARTHDATA_TOKEN (or username + password) and restart the server.")
    auth = earthaccess.login(strategy="environment")
    if not auth or not auth.authenticated:
        raise ReaderError("Earthdata login failed. Check the credentials in backend/.env.")
    _logged_in = True


def _data_url(granule: dict) -> str:
    for link in granule["links"]:
        if link["type"] == "GET DATA" and link["url"].startswith("https") and link["url"].endswith(".h5"):
            return link["url"]
    raise ReaderError(f"No HTTPS .h5 data link in the metadata for {granule['id']}.")


def read_gcov_window(granule: dict, lat: float, lon: float, pol: str = "HHHH") -> dict:
    """Read a square around lat/lon. Saved in cache/windows."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{READER_VERSION}_{granule['id']}_{pol}_{lat:.4f}_{lon:.4f}.npz"
    if cache.exists():
        z = np.load(cache)
        return {"db": z["db"], "x": z["x"], "y": z["y"], "epsg": int(z["epsg"]),
                "spacing": tuple(z["spacing"]), "stats": dict(zip(z["stat_keys"], z["stat_vals"].tolist())),
                "cached": True}

    _login()
    import earthaccess
    import h5py
    from pyproj import Transformer

    fs = earthaccess.get_fsspec_https_session()
    with fs.open(_data_url(granule), mode="rb", cache_type="blockcache", block_size=8 * 1024 * 1024) as remote:
        with h5py.File(remote, "r") as h5:
            if f"{GRID}/{pol}" not in h5:
                have = [k for k in h5[GRID].keys() if len(k) == 4 and k.isupper()]
                raise ReaderError(f"{pol} is not in this granule (has {have}).")
            x_all = h5[f"{GRID}/xCoordinates"][:]
            y_all = h5[f"{GRID}/yCoordinates"][:]
            epsg = int(h5[f"{GRID}/projection"][()])

            # find the pixel for our point
            px, py = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True).transform(lon, lat)
            dx, dy = float(x_all[1] - x_all[0]), float(y_all[1] - y_all[0])
            col = int(round((px - x_all[0]) / dx))
            row = int(round((py - y_all[0]) / dy))
            if not (0 <= col < len(x_all) and 0 <= row < len(y_all)):
                raise ReaderError("The chosen place is outside this granule's raster grid. "
                                  "Pick observations whose footprint covers the place.")
            half = WINDOW_PX // 2
            c0, c1 = max(0, col - half), min(len(x_all), col + half)
            r0, r1 = max(0, row - half), min(len(y_all), row + half)
            win = np.s_[r0:r1, c0:c1]

            raw = h5[f"{GRID}/{pol}"][win]
            mask = h5[f"{GRID}/mask"][win]
            # BETA files don't have this mask
            has_exception = f"{GRID}/inputDataExceptionMask" in h5
            if has_exception:
                ds = h5[f"{GRID}/inputDataExceptionMask"]
                exception_raw = ds[win].astype(np.uint16)
                desc = ds.attrs.get("description", b"")
                desc = desc.decode() if isinstance(desc, bytes) else str(desc)
            else:
                exception_raw, desc = np.zeros(mask.shape, np.uint16), ""

    # low byte = problems, 65535 = no data
    # newer files also have a bit per polarisation (256 = HH, 2048 = VV)
    exception = exception_raw & 0x00FF
    usable = (exception == 0) & (exception_raw != 65535)
    pol_bits = {"HHHH": 256, "VVVV": 2048}
    if "256:HH" in desc and pol in pol_bits:
        usable &= (exception_raw & pol_bits[pol]) != 0

    # mask: 0 = bad, 255 = outside
    valid = np.isfinite(raw) & (raw > 0) & (mask > 0) & (mask != 255) & usable
    db = np.full(raw.shape, np.nan, dtype=np.float32)
    db[valid] = 10.0 * np.log10(raw[valid])
    x, y = x_all[c0:c1], y_all[r0:r1]
    stats = {"pixels": int(raw.size), "valid": int(valid.sum()),
             "invalid_mask": int(((mask == 0) | (mask == 255)).sum()), "input_exception": int((~usable).sum()),
             "exception_mask_available": int(has_exception)}
    np.savez_compressed(cache, db=db, x=x, y=y, epsg=epsg, spacing=np.array([dx, dy]),
                        stat_keys=np.array(list(stats)), stat_vals=np.array(list(stats.values())))
    return {"db": db, "x": x, "y": y, "epsg": epsg, "spacing": (dx, dy), "stats": stats, "cached": False}
