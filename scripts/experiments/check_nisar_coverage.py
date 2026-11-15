
import csv
from pathlib import Path

import earthaccess
from shapely.geometry import box, shape
from shapely.ops import unary_union

# melbourne area (lon, lat)
STUDY_AREA = box(144.4, -38.2, 145.5, -37.4)

PRODUCTS = {
    "GCOV": "NISAR_L2_GCOV_PROVISIONAL_V1",
    "GUNW": "NISAR_L2_GUNW_PROVISIONAL_V1",
}

START_DATE = "2026-06-17"
END_DATE = "2026-10-21"
OUTPUT = Path("data/nisar_melbourne_candidates.csv")


def get_footprint(umm):
    """Make a shape from the footprint."""
    spatial = umm.get("SpatialExtent", {})
    domain = spatial.get("HorizontalSpatialDomain", {})
    geometry = domain.get("Geometry", {})
    polygons = geometry.get("GPolygons", [])

    shapes = []

    for polygon in polygons:
        boundary = polygon.get("Boundary", {})
        points = boundary.get("Points", [])

        coordinates = [
            (point["Longitude"], point["Latitude"])
            for point in points
            if "Longitude" in point and "Latitude" in point
        ]

        if len(coordinates) >= 3:
            # close the polygon
            if coordinates[0] != coordinates[-1]:
                coordinates.append(coordinates[0])

            try:
                polygon_shape = shape({
                    "type": "Polygon",
                    "coordinates": [coordinates],
                })

                if not polygon_shape.is_valid:
                    polygon_shape = polygon_shape.buffer(0)

                if not polygon_shape.is_empty:
                    shapes.append(polygon_shape)
            except (ValueError, TypeError):
                continue

    return unary_union(shapes) if shapes else None


def inspect_product(product, short_name):
    print(f"\n--- {product} ---")

    results = earthaccess.search_data(
        short_name=short_name,
        bounding_box=(144.4, -38.2, 145.5, -37.4),
        temporal=(START_DATE, END_DATE),
        count=100,
    )

    print(f"Search results: {len(results)}")
    rows = []

    for granule in results:
        umm = granule.get("umm", {})
        granule_id = umm.get("GranuleUR", "Unknown")

        temporal = umm.get("TemporalExtent", {})
        date_range = temporal.get("RangeDateTime", {})
        start = date_range.get("BeginningDateTime", "")
        end = date_range.get("EndingDateTime", "")

        footprint = get_footprint(umm)

        if footprint is None:
            overlap_area = None
            intersects = False
            coverage_fraction = None
        else:
            intersection = footprint.intersection(STUDY_AREA)
            intersects = not intersection.is_empty
            overlap_area = intersection.area

            # rough coverage, not real area
            coverage_fraction = overlap_area / STUDY_AREA.area

        try:
            links = granule.data_links(access="external")
            data_url = links[0] if links else ""
        except Exception:
            data_url = ""

        row = {
            "product": product,
            "granule_id": granule_id,
            "start": start,
            "end": end,
            "intersects_study_area": intersects,
            "study_area_overlap_fraction_approx": (
                round(coverage_fraction, 6)
                if coverage_fraction is not None
                else ""
            ),
            "data_url": data_url,
        }

        rows.append(row)

        if intersects:
            print(f"  MATCH: {granule_id} | {start} to {end}")
        elif footprint is None:
            print(f"  UNKNOWN FOOTPRINT: {granule_id}")

    matched = sum(row["intersects_study_area"] for row in rows)
    print(f"Footprint intersections: {matched}/{len(rows)}")
    return rows


def main():
    all_rows = []

    for product, short_name in PRODUCTS.items():
        try:
            all_rows.extend(inspect_product(product, short_name))
        except Exception as error:
            print(f"{product} search failed: {type(error).__name__}: {error}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "product",
        "granule_id",
        "start",
        "end",
        "intersects_study_area",
        "study_area_overlap_fraction_approx",
        "data_url",
    ]

    with OUTPUT.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\nSaved {len(all_rows)} metadata records to {OUTPUT}")
    print("No satellite files were downloaded.")


if __name__ == "__main__":
    main()
