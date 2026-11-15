## 1. Get a NASA Earthdata token

The app downloads NISAR radar data from NASA, which needs an Earthdata login token.

1. Sign up or log in at https://urs.earthdata.nasa.gov/

2. **Approve the data applications first.** Do this before you generate the token, or data downloads will fail even with a valid token.
   1. Go to **Applications > Authorized Apps**.
   2. Click **Approve More Applications**.
   3. Search for each application below and click **Approve**:
      - `Alaska Satellite Facility Data Access`
      - `Earthdata Search PROD (Serverless)`
      - `Alaska Satellite Facility NISAR Data Access`
      
   4. Check that they now appear in your **Authorized Apps** list.

3. Go to **Generate Token** and create a token.

4. Copy the token. You'll put it in `backend/.env` in the setup step.

Never commit your `.env` file; it is already in `.gitignore`.
# nasa-space-apps-change

Map app that uses NASA radar satellite data to show how the ground changes between two dates. NASA Space Apps Challenge project by Novara Labs.

The backend is a FastAPI server that also serves the frontend (React + Leaflet, loaded from a CDN), so the frontend has no separate build step.

## Requirements

- Python 3.13
- A free NASA Earthdata account and token (see below)

## 1. Get a NASA Earthdata token

The app downloads NISAR radar data from NASA, which needs an Earthdata login token.

1. Sign up or log in at https://urs.earthdata.nasa.gov/

2. **Approve the data applications first.** Do this before you generate the token, or data downloads will fail even with a valid token.
   1. Go to **Applications > Authorized Apps**.
   2. Click **Approve More Applications**.
   3. Search for each application below and click **Approve**:
      - `Alaska Satellite Facility Data Access`
      - `Earthdata Search PROD (Serverless)`
      - `Alaska Satellite Facility NISAR Data Access`
      
   4. Check that they now appear in your **Authorized Apps** list.

3. Go to **Generate Token** and create a token.

4. Copy the token. You'll put it in `backend/.env` in the setup step.

Never commit your `.env` file; it is already in `.gitignore`.

## 2. Setup (one time)

### Windows (PowerShell)

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
notepad .env
```

> If `Activate.ps1` is blocked, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and try again.

### macOS (Terminal)

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
open -e .env
```

> Don't have Python 3.13? Install it with `brew install python@3.13` or from https://www.python.org/downloads/

In `.env`, paste your token:

```
EARTHDATA_TOKEN=your_token_here
```

## 3. Run the app

### Windows

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

### macOS

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload
```

Then open **http://127.0.0.1:8000** in your browser.

- API health check: http://127.0.0.1:8000/api/health
- API docs: http://127.0.0.1:8000/docs

Stop the server with `Ctrl+C`.

## Test scripts (optional)

With the virtual environment active, run these from the repo root:

```bash
python scripts/test_search.py
python scripts/test_change_pipeline.py
```

## Project structure

```
backend/     FastAPI server (main.py) and services for NASA search, NISAR reading, change detection and map images
frontend/    React + Leaflet UI served by the backend
scripts/     Test scripts and NISAR data experiments
```