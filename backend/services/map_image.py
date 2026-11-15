"""Make PNG images for the map. Leaflet uses EPSG:3857 so we convert to that first."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, calculate_default_transform, reproject

CHANGE_LIMIT_DB = 6.0  # max colour at +/- 6 dB


def to_web_mercator(values: np.ndarray, x: np.ndarray, y: np.ndarray, epsg: int):
    """Convert the grid to EPSG:3857. Returns the array and its bounds."""
    dx, dy = float(x[1] - x[0]), float(y[0] - y[1])
    src_transform = from_origin(float(x[0]) - dx / 2, float(y[0]) + dy / 2, dx, dy)
    h, w = values.shape
    left, top = float(x[0]) - dx / 2, float(y[0]) + dy / 2
    right, bottom = left + w * dx, top - h * dy
    dst_transform, dw, dh = calculate_default_transform(f"EPSG:{epsg}", "EPSG:3857", w, h, left, bottom, right, top)
    out = np.full((dh, dw), np.nan, dtype=np.float32)
    reproject(values.astype(np.float32), out, src_transform=src_transform, src_crs=f"EPSG:{epsg}",
              dst_transform=dst_transform, dst_crs="EPSG:3857", resampling=Resampling.nearest,
              src_nodata=np.nan, dst_nodata=np.nan)
    # corners in lat/lon
    west, north = dst_transform * (0, 0)
    east, south = dst_transform * (dw, dh)
    to_ll = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    lon_w, lat_s = to_ll.transform(west, south)
    lon_e, lat_n = to_ll.transform(east, north)
    return out, [[lat_s, lon_w], [lat_n, lon_e]]


def change_png(diff: np.ndarray, path: Path) -> None:
    """Blue = brighter, red = darker. Small changes are faint."""
    from matplotlib import colormaps
    valid = np.isfinite(diff)
    norm = np.clip((np.where(valid, diff, 0) + CHANGE_LIMIT_DB) / (2 * CHANGE_LIMIT_DB), 0, 1)
    rgba = colormaps["RdBu"](norm, bytes=True)
    strength = np.clip(np.abs(np.where(valid, diff, 0)) / CHANGE_LIMIT_DB, 0, 1)
    rgba[..., 3] = np.where(valid, (40 + 215 * strength).astype(np.uint8), 0)
    Image.fromarray(rgba, mode="RGBA").save(path)


def backscatter_png(db: np.ndarray, path: Path) -> None:
    """One date as a grey image."""
    valid = np.isfinite(db)
    lo, hi = np.percentile(db[valid], [2, 98]) if valid.any() else (0, 1)
    grey = (np.clip((np.where(valid, db, lo) - lo) / max(hi - lo, 1e-6), 0, 1) * 255).astype(np.uint8)
    rgba = np.dstack([grey, grey, grey, np.where(valid, 255, 0).astype(np.uint8)])
    Image.fromarray(rgba, mode="RGBA").save(path)
