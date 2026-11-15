
import csv
from pathlib import Path

import earthaccess
import h5py
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "nisar_melbourne_candidates.csv"

GRANULE_ID = (
    "NISAR_L2_PR_GCOV_023_045_D_107_4005_DHDH_A_"
    "20260617T081700_20260617T081740_P05023_F_F_J_001"
)

BASE = "/science/LSAR/GCOV/grids/frequencyA"
START_ROW, END_ROW = 23870, 24894
START_COL, END_COL = 4485, 5509


def main():
    with CSV_PATH.open(newline="") as f:
        rows = list(csv.DictReader(f))

    candidate = next(
        (r for r in rows if r.get("granule_id") == GRANULE_ID),
        None,
    )
    if candidate is None:
        raise RuntimeError(
            "Granule not found in the candidates CSV. "
            "Check the CSV column names."
        )

    print("Authenticating with NASA Earthdata...")
    earthaccess.login()

    results = earthaccess.search_data(
        short_name="NISAR_L2_GCOV_PROVISIONAL_V1",
        granule_name=GRANULE_ID,
    )
    if not results:
        raise RuntimeError("NASA Earthdata search returned no granule.")

    urls = earthaccess.get_fsspec_https_session()
    links = results[0].data_links(access="external")
    if not links:
        raise RuntimeError("No external data link was returned.")

    print("Opening remote HDF5 file...")
    remote = urls.open(
        links[0],
        mode="rb",
        block_size=8 * 1024 * 1024,
        cache_type="blockcache",
    )

    with h5py.File(remote, "r") as h5:
        for name in ("HHHH", "mask", "inputDataExceptionMask"):
            path = f"{BASE}/{name}"
            if path not in h5:
                print(f"\nMISSING: {path}")
                continue

            ds = h5[path]
            print(f"\n--- {path} ---")
            print("dtype:", ds.dtype)
            print("shape:", ds.shape)
            print("attributes:")
            for key, value in ds.attrs.items():
                print(f"  {key}: {value}")

            if ds.ndim == 2:
                tile = ds[
                    START_ROW:END_ROW,
                    START_COL:END_COL,
                ]
                values, counts = np.unique(
                    tile, return_counts=True
                )
                print("Window value counts:")
                for value, count in zip(values, counts):
                    print(f"  {value}: {count}")

        print("\n--- HHHH numeric check ---")
        hhhh = h5[f"{BASE}/HHHH"][
            START_ROW:END_ROW, START_COL:END_COL
        ]
        print("Finite pixels:", int(np.isfinite(hhhh).sum()))
        print("Positive pixels:", int((hhhh > 0).sum()))

    print("\nInspection complete; no full-file download requested.")


if __name__ == "__main__":
    main()
