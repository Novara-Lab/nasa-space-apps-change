
import csv
import json
from pathlib import Path

import earthaccess
import h5py
import matplotlib.pyplot as plt
import numpy as np
from pyproj import CRS, Transformer


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "nisar_melbourne_candidates.csv"
OUTPUT_DIR = ROOT / "data" / "previews"

PRODUCT = "NISAR_L2_GCOV_PROVISIONAL_V1"

BASE_PATH = "/science/LSAR/GCOV/grids/frequencyA"

DATASET_PATH = f"{BASE_PATH}/HHHH"
X_PATH = f"{BASE_PATH}/xCoordinates"
Y_PATH = f"{BASE_PATH}/yCoordinates"
PROJECTION_PATH = f"{BASE_PATH}/projection"
QUALITY_MASK_PATH = f"{BASE_PATH}/mask"
EXCEPTION_MASK_PATH = f"{BASE_PATH}/inputDataExceptionMask"

# melbourne box (west, south, east, north)
STUDY_BOUNDS = (144.4, -38.2, 145.5, -37.4)

# max window size
WINDOW_SIZE = 1024


def select_candidate():
    """Pick a granule that covers our area."""
    with CSV_PATH.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))

    for row in rows:
        if (
            row.get("product") == "GCOV"
            and row.get("intersects_study_area", "").lower() == "true"
            and row.get("granule_id")
        ):
            return row

    raise RuntimeError(
        "No intersecting GCOV candidate found in the CSV."
    )


def find_window(x_coords, y_coords, transformer):
    """Find a small window near our area."""
    west, south, east, north = STUDY_BOUNDS

    lon = [west, west, east, east]
    lat = [south, north, south, north]

    xs, ys = transformer.transform(lon, lat)

    xmin, xmax = min(xs), max(xs)
    ymin, ymax = min(ys), max(ys)

    x_indices = np.flatnonzero(
        (x_coords >= xmin) & (x_coords <= xmax)
    )
    y_indices = np.flatnonzero(
        (y_coords >= ymin) & (y_coords <= ymax)
    )

    if len(x_indices) == 0 or len(y_indices) == 0:
        raise RuntimeError(
            "This granule's raster coordinates do not intersect "
            "the Melbourne bounding box. Select another granule "
            "using its actual raster coordinates."
        )

    x_center = (
        int(x_indices[0]) + int(x_indices[-1])
    ) // 2
    y_center = (
        int(y_indices[0]) + int(y_indices[-1])
    ) // 2

    half = WINDOW_SIZE // 2

    x0 = max(0, x_center - half)
    x1 = min(len(x_coords), x0 + WINDOW_SIZE)
    x0 = max(0, x1 - WINDOW_SIZE)

    y0 = max(0, y_center - half)
    y1 = min(len(y_coords), y0 + WINDOW_SIZE)
    y0 = max(0, y1 - WINDOW_SIZE)

    return x0, x1, y0, y1


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    candidate = select_candidate()
    granule_id = candidate["granule_id"]

    print("Selected granule:", granule_id)
    print("Authenticating with NASA Earthdata...")
    earthaccess.login()

    results = earthaccess.search_data(
        short_name=PRODUCT,
        granule_name=granule_id,
        count=5,
    )

    if not results:
        raise RuntimeError(
            "Selected granule was not found in the archive."
        )

    links = results[0].data_links(access="external")

    if not links:
        raise RuntimeError(
            "No external data URL was returned."
        )

    fs = earthaccess.get_fsspec_https_session()
    options = {
        "cache_type": "blockcache",
        "block_size": 8 * 1024 * 1024,
    }

    print("Opening remote HDF5 file...")

    with fs.open(links[0], mode="rb", **options) as remote:
        with h5py.File(remote, "r") as hdf:
            x_coords = hdf[X_PATH][:]
            y_coords = hdf[Y_PATH][:]
            epsg = int(hdf[PROJECTION_PATH][()])

            print("Projection EPSG:", epsg)
            print(
                "Raster coordinate dimensions:",
                len(x_coords),
                "x",
                len(y_coords),
            )

            crs = CRS.from_epsg(epsg)
            transformer = Transformer.from_crs(
                "EPSG:4326",
                crs,
                always_xy=True,
            )

            x0, x1, y0, y1 = find_window(
                x_coords,
                y_coords,
                transformer,
            )

            print(
                f"Reading window: rows {y0}:{y1}, "
                f"columns {x0}:{x1}"
            )

            # read only this part
            window = np.s_[y0:y1, x0:x1]

            raw = hdf[DATASET_PATH][window]
            quality_mask = hdf[QUALITY_MASK_PATH][window]
            exception_mask = hdf[EXCEPTION_MASK_PATH][window]

            # mask: 0 = bad, 255 = outside
            # exception mask: 0 = ok
            valid_numeric = np.isfinite(raw) & (raw > 0)

            valid_quality = (
                (quality_mask > 0)
                & (quality_mask != 255)
            )

            no_input_exception = exception_mask == 0

            valid = (
                valid_numeric
                & valid_quality
                & no_input_exception
            )

            # count removed pixels
            invalid_numeric_count = int(
                (~valid_numeric).sum()
            )

            invalid_quality_count = int(
                (~valid_quality).sum()
            )

            exception_count = int(
                (~no_input_exception).sum()
            )

            valid_count = int(valid.sum())

            print("\nQuality summary")
            print("----------------")
            print("Total pixels:", raw.size)
            print(
                "Invalid numeric pixels:",
                invalid_numeric_count,
            )
            print(
                "Invalid quality-mask pixels:",
                invalid_quality_count,
            )
            print(
                "Pixels with input exceptions:",
                exception_count,
            )
            print("Pixels retained:", valid_count)

            if valid_count == 0:
                raise RuntimeError(
                    "No valid pixels remain after applying "
                    "the quality checks."
                )

            # convert to dB
            db = np.full(raw.shape, np.nan, dtype=np.float32)
            db[valid] = 10.0 * np.log10(raw[valid])

            values = db[valid]
            vmin, median, vmax = np.percentile(
                values,
                [2, 50, 98],
            )

            x_window = x_coords[x0:x1]
            y_window = y_coords[y0:y1]

            extent = [
                float(np.min(x_window)),
                float(np.max(x_window)),
                float(np.min(y_window)),
                float(np.max(y_window)),
            ]

            # save image, bad pixels are transparent
            from matplotlib import colormaps
            from matplotlib.colors import Normalize

            norm = Normalize(vmin=vmin, vmax=vmax, clip=True)
            colormap = colormaps["gray"]

            # replace NaN first
            safe_db = np.where(valid, db, vmin)
            rgba = colormap(norm(safe_db), bytes=True)

            # transparent where invalid
            rgba[..., 3] = np.where(valid, 255, 0).astype(np.uint8)

            png_path = (
                OUTPUT_DIR / "melbourne_gcov_preview.png"
            )

            from PIL import Image

            Image.fromarray(rgba, mode="RGBA").save(png_path)

            report = {
                "product": PRODUCT,
                "granule_id": granule_id,
                "measurement": DATASET_PATH,
                "projection_epsg": epsg,
                "window_pixels": list(raw.shape),
                "window_indices": {
                    "x_start": x0,
                    "x_end": x1,
                    "y_start": y0,
                    "y_end": y1,
                },
                "projected_extent": extent,
                "total_pixel_count": int(raw.size),
                "valid_pixel_count": valid_count,
                "invalid_numeric_pixel_count": (
                    invalid_numeric_count
                ),
                "invalid_quality_mask_pixel_count": (
                    invalid_quality_count
                ),
                "input_exception_pixel_count": (
                    exception_count
                ),
                "quality_mask_applied": True,
                "exception_mask_applied": True,
                "backscatter_db_percentiles": {
                    "p02": float(vmin),
                    "p50": float(median),
                    "p98": float(vmax),
                },
                "interpretation": (
                    "Single-date NISAR GCOV HHHH backscatter "
                    "preview. Positive finite power values "
                    "were converted to dB after applying the "
                    "GCOV validity mask and excluding pixels "
                    "with nonzero input-data exception codes. "
                    "This is not a change-detection result."
                ),
            }

            report_path = (
                OUTPUT_DIR / "melbourne_gcov_metadata.json"
            )

            report_path.write_text(
                json.dumps(report, indent=2),
                encoding="utf-8",
            )

    print("\nPreview saved:", png_path)
    print("Metadata saved:", report_path)
    print(
        "No complete satellite file was intentionally downloaded."
    )


if __name__ == "__main__":
    main()
