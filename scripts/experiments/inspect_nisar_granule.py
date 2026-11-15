
import csv
from pathlib import Path

import earthaccess
import h5py

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = PROJECT_ROOT / "data" / "nisar_melbourne_candidates.csv"
DOWNLOAD_DIR = PROJECT_ROOT / "data" / "downloads"

GCOV_SHORT_NAME = "NISAR_L2_GCOV_PROVISIONAL_V1"


def choose_granule():
    if not CSV_PATH.exists():
        raise FileNotFoundError(
            f"Coverage CSV not found: {CSV_PATH}\n"
            "Run scripts/check_nisar_coverage.py first."
        )

    with CSV_PATH.open(newline="", encoding="utf-8") as file:
        records = list(csv.DictReader(file))

    candidates = [
        row for row in records
        if row.get("product") == "GCOV"
        and row.get("intersects_study_area", "").lower() == "true"
        and row.get("granule_id")
    ]

    if not candidates:
        raise RuntimeError("No matching GCOV granules found in the CSV.")

    # use the first one in the csv
    candidate = candidates[0]

    print("\nSelected GCOV candidate")
    print("Granule:", candidate["granule_id"])
    print("Start:", candidate.get("start", "Unknown"))
    print("End:", candidate.get("end", "Unknown"))
    print("CSV data URL:", candidate.get("data_url", "Unavailable"))

    return candidate


def inspect_hdf5(file_path):
    print("\n" + "=" * 65)
    print("HDF5 FILE INSPECTION")
    print("=" * 65)
    print("File:", file_path)
    print(f"Size: {file_path.stat().st_size / (1024 * 1024):.2f} MB")

    with h5py.File(file_path, "r") as hdf:
        print("\nRoot attributes:")
        for key, value in hdf.attrs.items():
            print(f"  {key}: {value}")

        print("\nGroups and datasets:")

        def show_item(name, item):
            if isinstance(item, h5py.Dataset):
                print(
                    f"  DATASET /{name} | "
                    f"shape={item.shape} | dtype={item.dtype}"
                )
                for key, value in list(item.attrs.items())[:5]:
                    print(f"      attribute {key}: {value}")
            else:
                print(f"  GROUP   /{name}")

        hdf.visititems(show_item)

    print("\nInspection finished. No measurements were modified.")


def main():
    candidate = choose_granule()

    print("\nConnecting to NASA Earthdata Login...")
    earthaccess.login()

    print("Searching for the selected granule...")
    results = earthaccess.search_data(
        short_name=GCOV_SHORT_NAME,
        granule_name=candidate["granule_id"],
        count=5,
    )

    if not results:
        raise RuntimeError(
            "NASA Earthdata did not return the selected granule. "
            "Check the granule ID and product collection."
        )

    granule = results[0]

    print(f"Matching search results: {len(results)}")

    links = granule.data_links(access="external")
    if links:
        print("Archive data link:", links[0])

    print(
        "\nThe next step downloads one complete granule. "
        "The file may be large and use significant disk space."
    )
    confirmation = input(
        "Type DOWNLOAD to continue, or press Enter to stop: "
    ).strip()

    if confirmation != "DOWNLOAD":
        print("Stopped safely. No satellite file was downloaded.")
        return

    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    print("\nDownloading one GCOV granule...")
    downloaded_files = earthaccess.download(
        [granule],
        local_path=str(DOWNLOAD_DIR),
        threads=1,
    )

    if not downloaded_files:
        raise RuntimeError(
            "earthaccess did not report any downloaded files."
        )

    for downloaded in downloaded_files:
        path = Path(downloaded)
        print("\nDownloaded:", path)

        if not path.exists():
            print("Warning: reported path does not exist locally.")
            continue

        if h5py.is_hdf5(path):
            inspect_hdf5(path)
        else:
            print(
                "This file is not recognized as HDF5. "
                "We should identify its format before processing it."
            )


if __name__ == "__main__":
    main()
