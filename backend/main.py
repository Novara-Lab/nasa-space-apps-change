"""Main backend app. API is under /api and the frontend is served at /.
Run from backend/: uvicorn main:app --reload
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date, timedelta
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from services import change_detection, map_image, nasa_search, nisar_reader
from services.nasa_search import PRODUCTS, search_observations

BACKEND_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
load_dotenv(BACKEND_DIR / ".env")  # earthdata login

app = FastAPI(title="NISAR Change Explorer API", version="0.2.0")


@app.get("/api/health")
def health():
    return {"status": "ok", "metadata_source": "NASA CMR"}


@app.get("/api/observations")
async def observations(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(0, ge=0, le=200),  # 0 = point must be inside the footprint
    start_date: date = Query(default_factory=lambda: date.today() - timedelta(days=90)),
    end_date: date = Query(default_factory=date.today),
    limit: int = Query(100, ge=1, le=200),  # per collection
):
    """Find observations around a point (metadata only)."""
    if start_date > end_date:
        raise HTTPException(400, "start_date must be on or before end_date")
    try:
        items, total_hits = await search_observations(lat, lon, radius_km, start_date, end_date, limit)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"NASA CMR returned HTTP {exc.response.status_code}. Try again later.") from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(502, "Could not reach or parse NASA CMR. Try again later.") from exc

    features = [
        {"type": "Feature", "geometry": o["geometry"],
         "properties": {k: o[k] for k in ("id", "product", "maturity", "start", "end")}}
        for o in items if o["geometry"]
    ]
    return {
        "source": "NASA Common Metadata Repository (CMR)",
        "query": {"lat": lat, "lon": lon, "radius_km": radius_km,
                  "start_date": start_date.isoformat(), "end_date": end_date.isoformat(),
                  "collections": [c[2] for c in nasa_search.COLLECTIONS]},
        "count": len(items),
        "total_hits": total_hits,  # can be more than count
        "footprint_count": len(features),
        "observations": items,
        "stacks": nasa_search.group_stacks(items),  # dates we can compare
        "footprints": {"type": "FeatureCollection", "features": features},
        "note": ("Archive metadata only. No raster has been read and no change computed."),
    }


# each job is saved in cache/analysis/<id>/
ANALYSIS_DIR = BACKEND_DIR / "cache" / "analysis"
ANALYSIS_VERSION = "v3"  # change this to ignore old results
PROVISIONAL_NOTE = ("Provisional radar signal change from PROVISIONAL NISAR GCOV data. "
                    "Not confirmed damage, flooding or ground movement.")


class AnalysisRequest(BaseModel):
    granule_a: str
    granule_b: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    place: str = ""


def _job_path(job_id: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{16}", job_id):
        raise HTTPException(404, "Unknown analysis id")
    return ANALYSIS_DIR / job_id


def _save(job_id: str, job: dict) -> None:
    folder = ANALYSIS_DIR / job_id
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / "job.json.tmp"
    tmp.write_text(json.dumps(job, indent=2))
    tmp.replace(folder / "job.json")


def _run_analysis(job_id: str, job: dict, a: dict, b: dict, pol: str) -> None:
    """Runs in background: read both dates, compare and save images."""
    folder = ANALYSIS_DIR / job_id
    try:
        job["step"] = "Reading Date A window (remote HDF5, may take a minute)…"; _save(job_id, job)
        wa = nisar_reader.read_gcov_window(a, job["lat"], job["lon"], pol)
        job["step"] = "Reading Date B window…"; _save(job_id, job)
        wb = nisar_reader.read_gcov_window(b, job["lat"], job["lon"], pol)
        job["read_stats"] = {"a": wa["stats"], "b": wb["stats"]}
        for key, w in (("A", wa), ("B", wb)):
            if not w["stats"].get("exception_mask_available", 1):
                job.setdefault("cautions", []).append(
                    f"Date {key} has no input-data exception mask (older product version); only its quality mask was applied.")

        problems = change_detection.grid_problems(wa, wb)
        if problems:
            job.update(status="failed", warnings=job["warnings"] + problems, step="Grid check failed")
            return
        job["step"] = "Computing difference…"; _save(job_id, job)
        diff, stats = change_detection.difference_db(wa, wb)
        if stats["valid_pixels"] == 0:
            job.update(status="failed", step="No valid pixels",
                       warnings=job["warnings"] + ["No pixel is valid on both dates in this window."])
            return

        change_3857, bounds = map_image.to_web_mercator(diff, wa["x"], wa["y"], wa["epsg"])
        map_image.change_png(change_3857, folder / "change.png")
        for key, w in (("a", wa), ("b", wb)):
            arr, _ = map_image.to_web_mercator(w["db"], w["x"], w["y"], w["epsg"])
            map_image.backscatter_png(arr, folder / f"{key}.png")
        job["step"] = "Writing report"; _save(job_id, job)
        job["report"] = change_detection.build_report(wa, wb, diff, stats, a, b, job["lat"], job["lon"])
        job.update(status="done", step="Done", bounds=bounds, stats=stats, epsg=wa["epsg"],
                   spacing_m=[abs(v) for v in wa["spacing"]], polarisation=pol)
    except nisar_reader.ReaderError as exc:
        job.update(status="failed", step="Could not read data", warnings=job["warnings"] + [str(exc)])
    except Exception as exc:  # show other errors to the user
        job.update(status="failed", step="Unexpected error", warnings=job["warnings"] + [f"{type(exc).__name__}: {exc}"])
    finally:
        _save(job_id, job)


@app.post("/api/analysis")
def start_analysis(req: AnalysisRequest, background: BackgroundTasks):
    """Start comparing two dates, or return the saved result."""
    # same inputs give same id
    key = f"{ANALYSIS_VERSION}|{req.granule_a}|{req.granule_b}|{req.lat:.4f}|{req.lon:.4f}"
    job_id = hashlib.sha1(key.encode()).hexdigest()[:16]
    existing = ANALYSIS_DIR / job_id / "job.json"
    if existing.exists():
        job = json.loads(existing.read_text())
        if job["status"] in ("done", "running", "rejected"):
            return job

    try:
        # get both granules at once
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(2) as pool:
            a, b = pool.map(nasa_search.get_granule, [req.granule_a, req.granule_b])
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not look up the granules in NASA CMR. Try again.") from exc
    if not a or not b:
        raise HTTPException(404, "One of the granules was not found in NASA CMR.")
    if (a["start"] or "") > (b["start"] or ""):
        a, b = b, a  # A is always the older date

    job = {"id": job_id, "status": "running", "step": "Queued", "place": req.place,
           "lat": req.lat, "lon": req.lon, "warnings": [], "note": PROVISIONAL_NOTE,
           "granule_a": {"id": a["id"], "start": a["start"], "maturity": a["maturity"], "pairing": a["pairing"]},
           "granule_b": {"id": b["id"], "start": b["start"], "maturity": b["maturity"], "pairing": b["pairing"]}}
    problems = change_detection.pair_problems(a, b)
    if problems:
        job.update(status="rejected", step="These two observations cannot be compared", warnings=problems)
        _save(job_id, job)
        return job
    pol = change_detection.common_pol(a, b)
    job["cautions"] = change_detection.pair_cautions(a, b)
    _save(job_id, job)
    background.add_task(_run_analysis, job_id, job, a, b, pol)
    return job


@app.get("/api/analysis/{job_id}")
def get_analysis(job_id: str):
    path = _job_path(job_id) / "job.json"
    if not path.exists():
        raise HTTPException(404, "Unknown analysis id")
    return json.loads(path.read_text())


@app.get("/api/analysis/{job_id}/{name}.png")
def analysis_image(job_id: str, name: str):
    """name is image, a or b."""
    files = {"image": "change.png", "a": "a.png", "b": "b.png"}
    if name not in files:
        raise HTTPException(404, "Unknown image")
    path = _job_path(job_id) / files[name]
    if not path.exists():
        raise HTTPException(404, "Image not ready")
    return FileResponse(path, media_type="image/png")


def _fail_interrupted_jobs() -> None:
    """Mark jobs stopped by a restart as failed."""
    for path in ANALYSIS_DIR.glob("*/job.json"):
        job = json.loads(path.read_text())
        if job.get("status") == "running":
            job.update(status="failed", step="Interrupted", warnings=job["warnings"] + ["Server restarted during the job. Run it again."])
            path.write_text(json.dumps(job, indent=2))


_fail_interrupted_jobs()

# keep this last so /api routes work
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
