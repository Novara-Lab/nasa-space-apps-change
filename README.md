# nasa-space-apps-change

Map app that uses NASA radar satellite data to show how the ground changes between two dates. NASA Space Apps Challenge project by Novara Labs.

The backend is a FastAPI app that also serves the frontend, so you only run one server. There is no build step: React, Leaflet and Babel load from a CDN, and the browser compiles the JSX.

## Requirements

- **Python 3.13.** The packages in `backend/requirements.txt` are pinned to versions tested on 3.13. Older versions of Python may fail to install them.
- **Git**
- **Internet access.** Searches go to NASA's services, and the page loads its libraries from unpkg.com.
- **A NASA Earthdata account** (free, at https://urs.earthdata.nasa.gov/). You only need it to read NISAR data files for change analysis. Searching works without one.

## Keeping the project folder clean

These instructions keep the cloned folder exactly as it is in git:

- The Python virtual environment goes in your home folder (`~/.venvs/nisar`), **not** inside the project.
- `PYTHONDONTWRITEBYTECODE=1` stops Python from creating `__pycache__` folders.
- Your Earthdata token is set in the terminal, so you don't need a `.env` file.
- Every command calls the virtual environment's Python by its full path, so you never need to activate it.

The only files the app still writes inside the project are analysis results in `backend/cache/`. They are ignored by git and safe to delete at any time.

---

## macOS

### One-time setup

1. Install Python 3.13 from https://www.python.org/downloads/, or with Homebrew:

   ```bash
   brew install python@3.13
   ```

2. Clone the project and move into it:

   ```bash
   git clone https://github.com/Novara-Lab/nasa-space-apps-change.git
   cd nasa-space-apps-change
   ```

3. Create the virtual environment outside the project and install the packages:

   ```bash
   python3.13 -m venv ~/.venvs/nisar
   ~/.venvs/nisar/bin/python -m pip install -r backend/requirements.txt
   ```

### Run

Open a terminal in the `nasa-space-apps-change` folder, then run:

```bash
cd backend
export PYTHONDONTWRITEBYTECODE=1
export EARTHDATA_TOKEN="your-real-token"
~/.venvs/nisar/bin/python -m uvicorn main:app --reload
```

---

## Windows (PowerShell)

### One-time setup

1. Install Python 3.13, then **close and reopen PowerShell**:

   ```powershell
   winget install Python.Python.3.13
   ```

   You can also use the installer from https://www.python.org/downloads/. If you do, tick **"Add python.exe to PATH"**. Check that it worked with `py --list`; you should see `-V:3.13` in the list.

2. Clone the project and move into it:

   ```powershell
   git clone https://github.com/Novara-Lab/nasa-space-apps-change.git
   cd nasa-space-apps-change
   ```

3. Create the virtual environment outside the project and install the packages:

   ```powershell
   py -3.13 -m venv "$HOME/.venvs/nisar"
   & "$HOME/.venvs/nisar/Scripts/python" -m pip install -r backend/requirements.txt
   ```

### Run

Open PowerShell in the `nasa-space-apps-change` folder, then run:

```powershell
cd backend
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:EARTHDATA_TOKEN = "your-real-token"
& "$HOME/.venvs/nisar/Scripts/python" -m uvicorn main:app --reload
```

---

## Open the app

When the terminal shows `Application startup complete.`, open:

| URL | What it is |
| --- | --- |
| http://127.0.0.1:8000 | The app |
| http://127.0.0.1:8000/api/health | Health check. Returns `{"status": "ok", ...}` |
| http://127.0.0.1:8000/docs | Interactive API docs |

Press **Ctrl + C** in the terminal to stop the server.

## Earthdata credentials

- Get a token from https://urs.earthdata.nasa.gov/ under **Profile > Generate Token**, and use it in place of `your-real-token` above. Don't use the placeholder text itself.
- Instead of a token, you can set `EARTHDATA_USERNAME` and `EARTHDATA_PASSWORD` the same way.
- Variables set with `export` or `$env:` only last for that terminal window. Set them again each time you open a new one.
- **Optional:** to avoid typing the token each time, copy `backend/.env.example` to `backend/.env` and put the token there. The app reads `.env` automatically, and git ignores it.

## Removing everything

Delete the `nasa-space-apps-change` folder and the virtual environment:

- macOS: `rm -rf ~/.venvs/nisar`
- Windows: `Remove-Item -Recurse -Force "$HOME/.venvs/nisar"`

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| `No suitable Python runtime found` (Windows) | Python 3.13 isn't installed. Install it, then reopen PowerShell. |
| `Could not open requirements file` | You're in the wrong folder. Run the install from inside `nasa-space-apps-change`, where the path is `backend/requirements.txt`. |
| `Could not import module "main"` | You're not in `backend/`. Run `cd backend` first. Check the spelling: `cd`, not `.cd`. |
| `uvicorn` is not recognized / command not found | Start it through the virtual environment's Python, as shown above (`... -m uvicorn`), not with plain `uvicorn`. |
| `pip install` fails on a package such as `rasterio` or `h5py` | Check that the virtual environment was created with Python 3.13: `~/.venvs/nisar/bin/python --version` (macOS) or `& "$HOME/.venvs/nisar/Scripts/python" --version` (Windows). |
| `(base)` appears in the macOS prompt | Conda is active. This is harmless, because the commands use the virtual environment's Python by its full path. |
| Search works but the analysis fails to log in | The token isn't set or is wrong. Set `EARTHDATA_TOKEN` again and restart the server. |
| The page is blank | Open the browser console and check that unpkg.com is reachable. |
| `A new release of pip is available` | Only a notice, not an error. You can ignore it. |

## Project layout

```
backend/
  main.py              FastAPI app: /api routes, and serves frontend/ at /
  services/            NASA search, NISAR file reading, change detection, map images
  requirements.txt
  .env.example         Optional template for Earthdata credentials
  cache/               Analysis results written at runtime (ignored by git)
frontend/
  index.html           Loads React, Leaflet and Babel from a CDN
  App.jsx, components/ UI components
  api.js               API helpers
scripts/
  test_search.py, test_change_pipeline.py
  experiments/         One-off scripts for inspecting NISAR granules
```
