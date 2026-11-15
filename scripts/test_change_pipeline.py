"""Test the compare code with fake data.
Run: python scripts/test_change_pipeline.py
"""
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from services import change_detection, map_image  # noqa: E402

# 200x200 grid near Melbourne
x = 320000 + 10 * np.arange(200) + 5.0
y = 5815000 - 10 * np.arange(200) - 5.0
a = np.full((200, 200), -10.0, dtype=np.float32)
b = a.copy()
b[50:100, 50:100] += 6.0     # brighter
b[120:170, 120:170] -= 6.0   # darker
a[0:10, :] = np.nan          # bad pixels
wa = {"db": a, "x": x, "y": y, "epsg": 32755, "spacing": (10.0, -10.0)}
wb = {"db": b, "x": x, "y": y, "epsg": 32755, "spacing": (10.0, -10.0)}

assert change_detection.grid_problems(wa, wb) == [], "identical grids should pass"
shifted = dict(wb, x=x + 10)
assert change_detection.grid_problems(wa, shifted), "shifted grid must be rejected"

diff, stats = change_detection.difference_db(wa, wb)
assert np.isnan(diff[0:10]).all(), "pixels invalid on A must be NaN"
assert abs(diff[75, 75] - 6) < 1e-4 and abs(diff[145, 145] + 6) < 1e-4 and abs(diff[30, 30]) < 1e-4
print("stats:", stats)

out, bounds = map_image.to_web_mercator(diff, x, y, 32755)
(s, w), (n, e) = bounds
print("bounds [[s,w],[n,e]]:", [[round(s, 5), round(w, 5)], [round(n, 5), round(e, 5)]], "reprojected shape:", out.shape)
assert -38.0 < s < n < -37.7 and 144.7 < w < e < 145.1, "bounds should be near Melbourne"

with tempfile.TemporaryDirectory() as tmp:
    p = Path(tmp) / "change.png"
    map_image.change_png(out, p)
    img = np.array(Image.open(p))
    print("png:", img.shape, "transparent px:", int((img[..., 3] == 0).sum()))
    assert img.shape[2] == 4 and (img[..., 3] == 0).any()
    map_image.backscatter_png(map_image.to_web_mercator(a, x, y, 32755)[0], Path(tmp) / "a.png")
print("ALL CHECKS PASSED (synthetic data)")
