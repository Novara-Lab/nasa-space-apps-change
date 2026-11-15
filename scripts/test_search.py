"""Test the search api. Start the server first.
Run: python scripts/test_search.py [place ...]
"""
import sys
from datetime import date, timedelta

import httpx

API = "http://localhost:8000/api/observations"
places = sys.argv[1:] or ["Melbourne, Australia", "London, United Kingdom"]
end = date.today()
start = end - timedelta(days=150)

with httpx.Client(timeout=60, headers={"User-Agent": "change-explorer-smoke-test/0.1"}) as client:
    for place in places:
        hit = client.get("https://nominatim.openstreetmap.org/search",
                         params={"q": place, "format": "jsonv2", "limit": 1}).json()
        if not hit:
            print(f"\n{place}: NOT FOUND by geocoder")
            continue
        lat, lon = float(hit[0]["lat"]), float(hit[0]["lon"])
        for radius in (25, 100):
            r = client.get(API, params={"lat": lat, "lon": lon, "radius_km": radius,
                                        "start_date": start, "end_date": end, "limit": 20})
            print(f"\n=== {place} ({lat:.4f}, {lon:.4f}) radius={radius} km {start}..{end} -> HTTP {r.status_code}")
            if r.status_code != 200:
                print(r.text)
                continue
            data = r.json()
            by_product = {}
            for o in data["observations"]:
                by_product[o["product"]] = by_product.get(o["product"], 0) + 1
            print(f"count={data['count']} footprints={data['footprint_count']} by product={by_product}")
            for o in data["observations"][:6]:
                print(f"  {o['product']} {o['start']}  {o['id']}")
