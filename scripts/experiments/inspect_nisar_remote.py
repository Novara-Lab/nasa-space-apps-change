
import csv
from pathlib import Path

import earthaccess
import h5py

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "nisar_melbourne_candidates.csv"
PRODUCT = "NISAR_L2_GCOV_PROVISIONAL_V1"


def main():
    with CSV_PATH.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))

    candidates = [
        row for row in rows
        if row.get("product") == "GCOV"
        and row.get("granule_id")
        and row.get("intersects_study_area", "").lower() == "true"
    ]

    if not candidates:
        raise RuntimeError("No matching GCOV granules in the CSV.")

    granule_id = candidates[0]["granule_id"]
    print("Selected granule:", granule_id)

    earthaccess.login()

    results = earthaccess.search_data(
        short_name=PRODUCT,
        granule_name=granule_id,
        count=5,
    )

    if not results:
        raise RuntimeError("Granule was not found in the archive.")

    urls = results[0].data_links(access="external")
    if not urls:
        raise RuntimeError("No external data URL was returned.")

    url = urls[0]
    print("Opening remote HDF5 file using block streaming...")

    # read without downloading the whole file
    fs = earthaccess.get_fsspec_https_session()
    config = {
        "cache_type": "blockcache",
        "block_size": 8 * 1024 * 1024,
    }

    with fs.open(url, mode="rb", **config) as remote_file:
        with h5py.File(remote_file, "r") as hdf:
            print("\nRoot attributes:")
            for key, value in hdf.attrs.items():
                print(f"  {key}: {value}")

            print("\nGroups and datasets:")

            def show_item(name, item):
                if isinstance(item, h5py.Dataset):
                    print(
                        f"  DATASET /{name}"
                        f" | shape={item.shape}"
                        f" | dtype={item.dtype}"
                        f" | chunks={item.chunks}"
                    )
                else:
                    print(f"  GROUP   /{name}")

            hdf.visititems(show_item)

    print("\nRemote metadata inspection completed.")
    print("No complete satellite file was intentionally downloaded.")


if __name__ == "__main__":
    main()
