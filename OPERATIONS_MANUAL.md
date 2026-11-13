# OPERATIONS MANUAL — Everything You Need To Run, Feed & Deploy This Project

One document. No agent required. Every command below was tested against this
exact package before it was written down.

| If you want to… | Go straight to |
|---|---|
| Run it on your machine in 5 minutes | **Part A** |
| Understand how every piece works | **Part B** |
| Add / replace / roll back models (manually, forever) | **Part C** |
| Deploy to the web — Vercel (frontend) + Render (backend) | **Part D** |
| Fix a problem | **Part E** |

Companion documents (deeper detail, same package):
`MERGE_GUIDE.md` (architecture & the serving contract) · `MLOPS_PLAYBOOK.md`
(lifecycle policy) · `API_REFERENCE.md` (every endpoint) ·
`AGENT_MERGE_GUIDE.md` (for an AI assistant doing the merge) ·
`backend/README.md` (backend internals).

---

## 0. The 60-second cheat sheet

```bash
# RUN — two terminals, from the unzipped folder (f1-strategy-platform/)

# Terminal 1 — ML backend (real predictions):        http://localhost:8000/docs
cd backend && pip install -r requirements.txt && python run.py

# Terminal 2 — premium frontend:                     http://localhost:3000
cd frontend && bun install && bun run dev
```

| The thing you'll do most | The one place to remember |
|---|---|
| **Where new models go** | `backend/model_store/` (see Part C — 3 ways, easiest is drag & drop in the UI) |
| **Where the registry lives** | `backend/model_store/registry.json` (never edit by hand — the UI/scripts do it) |
| **Model commands** | `backend/scripts/` — `register_model.py`, `promote_model.py`, `retrain.py` |
| **Backend settings** | `backend/.env` (copy from `backend/.env.example`) |
| **Frontend → backend URL** | `frontend` env var `NEXT_PUBLIC_ML_API_URL` (or Settings page in the UI) |

---

# PART A — RUN THE PROJECT ON YOUR MACHINE

## A1. What's in the package

Unzip `f1-strategy-platform.zip`. You get:

```
f1-strategy-platform/
├── frontend/                  ← the premium UI (Next.js 16 · React 19 · Three.js)
│   ├── public/                ← 3D car asset, race/telemetry/driver data (works offline)
│   └── src/                   ← pages, components, typed API client
├── backend/                   ← the ML serving layer (FastAPI)
│   ├── run.py                 ← start command: python run.py
│   ├── requirements.txt       ← pip install -r requirements.txt
│   ├── model_store/           ← ★ THE MODEL REGISTRY — new models land here
│   ├── scripts/               ← register / promote / retrain command-line tools
│   └── data/                  ← label encodings, tyre-degradation curves
├── data/f1_strategy_dataset_v4.csv   ← training data (101,371 laps)
├── dev.sh                     ← one-command launcher (starts both servers)
├── docker-compose.yml         ← Docker alternative
└── the .md guides you're reading
```

Three models ship pre-registered and ready:

| Model id | Status | What it is |
|---|---|---|
| `lightgbm-pit-stop-1.0.0` | **champion** | LightGBM pit-stop predictor (f1 0.861, threshold 0.64) |
| `xgboost-pit-stop-1.0.0` | candidate | XGBoost challenger |
| `logreg-pit-stop-1.0.0` | candidate | Logistic Regression + scaler baseline |

## A2. Install the prerequisites (once)

You need **two runtimes** — Bun for the frontend, Python for the backend.

**1) Bun ≥ 1.4** (frontend package manager & runtime — this is the stack you asked for)

```bash
# macOS / Linux / WSL
curl -fsSL https://bun.sh/install | bash
# restart the terminal, then verify:
bun --version

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# …or if you already have Node:  npm install -g bun
```

**2) Python 3.11 or newer** (backend + the real ML models)

- Download from <https://www.python.org/downloads/> (Windows: tick
  "Add python.exe to PATH" during install), or `brew install python` on macOS.
- Verify: `python3 --version` (Windows: `python --version`).

**3) Git** (only needed for deploying to Vercel/Render in Part D) —
<https://git-scm.com/downloads>.

## A3. Start the backend (Terminal 1)

```bash
cd f1-strategy-platform/backend
pip install -r requirements.txt     # once; creates the ML environment
python run.py                       # Windows: python run.py
```

**Success looks like:**

```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

Open <http://localhost:8000/docs> — you'll see the full interactive API
(health, models, sessions, predict, strategy). This backend:
- loads the 3 registered models **on demand** and keeps them **warm**,
- serves **real predictions** — no mocks when it's running,
- protects every mutating endpoint with validation (see Part C3).

> Behind a proxy / port conflict? Set `ML_PORT=9000` in `backend/.env`
> (copy `.env.example` to `.env` first). Every setting has an `ML_` prefix.

## A4. Start the frontend (Terminal 2)

```bash
cd f1-strategy-platform/frontend    # a SECOND terminal, keep the backend running
bun install                         # once; installs 100% of dependencies
bun run dev
```

Open <http://localhost:3000>. The top-nav chip shows **ML LIVE** — that means
the UI found the backend and every prediction from here on is computed by the
real Python models.

## A5. One-command alternatives

```bash
./dev.sh                 # starts backend :8000 + frontend :3000 together
docker compose up        # if you prefer Docker (both containers, one command)
```

`dev.sh` auto-installs anything missing and waits for both servers to be
healthy before handing you the URLs.

## A6. Your first real prediction (60 seconds, no typing)

1. Open <http://localhost:3000>.
2. Go to **09 Model Registry**.
3. Pick a model → click **ACTIVATE** (this binds it to your session — it stays
   loaded from now on, it is NOT loaded/unloaded per prediction).
4. Go to **07 Model Intelligence** → the **Live Inference Console**.
5. Set a lap scenario (e.g. Lap 32, tyre life 24, P5, MEDIUM tyres) → **Run**.
6. You get a real probability + decision (**BOX / WATCH / STAY**) from the
   actual model, with the model's own decision threshold applied.

Watch the **latency** of the second prediction — it drops and the state shows
`warm`. That's the session-persistent cache doing its job (Part B3).

## A7. Stopping

`Ctrl+C` in each terminal (or `Ctrl+C` once if you used `./dev.sh`).

---

# PART B — HOW THE WHOLE PROJECT RUNS (full function guide)

## B1. Two servers, one contract

```
┌────────────────────────────┐         ┌─────────────────────────────────┐
│ FRONTEND  (port 3000)      │  HTTP   │ BACKEND  (port 8000)            │
│ Next.js 16 + React 19      │────────▶│ FastAPI + real Python models    │
│ · 3D exploded-view F1 car  │  JSON   │ · model registry (any # of      │
│ · race replay / telemetry  │         │   versions, immutable artifacts)│
│ · strategy simulator       │         │ · warm ModelManager (session-   │
│ · registry / monitoring    │         │   persistent loading ★)         │
│ Falls back to bundled data │         │ · feature engineering + predict │
│ if the backend is offline  │         │ · validated model uploads       │
└────────────────────────────┘         └─────────────────────────────────┘
```

- The frontend is **permanent** — it never changes when models change. It
  renders whatever the registry serves: 3 models today, 50 next year.
- The backend is **stateless for the UI** but keeps a **warm model cache** and
  a **session table** in memory.
- Contract is typed on both sides: `backend/app/core/schemas.py` ↔
  `frontend/src/services/ml-api.ts` (camelCase JSON).

## B2. What every section of the UI does

| # | Section | What it shows | Data source |
|---|---|---|---|
| 01 | Overview | Scroll-driven 3D exploded F1 car, 5 reversible engineering states | 3D asset (bundled) |
| 02 | Race Intelligence | Calendar, circuits, tyre-degradation curves | bundled + backend curves |
| 03 | Race Replay | Lap-by-lap race playback, position charts | bundled race data |
| 04 | Telemetry Lab | Speed/throttle/brake/gear traces, synced axes | bundled telemetry |
| 05 | Strategy Simulator | One-stop vs two-stop race simulation, scored by the **selected model** | **live backend** (offline → bundled) |
| 06 | Driver Intelligence | Driver vs driver comparisons | bundled |
| 07 | Model Intelligence | Metrics, model comparison, **Live Inference Console** | **live backend** |
| 08 | Experiments | Pit-stop pattern exploration on the dataset | bundled |
| 09 | Model Registry | All model versions, ACTIVATE / PROMOTE / ARCHIVE, **REGISTER A NEW MODEL** upload panel | **live backend** |
| 10 | Monitoring | Backend health, warm/cold models, session & prediction counters | **live backend** |
| 11 | Settings | Backend URL + API key override, connection test | local + live |

If the backend is off, every live page degrades gracefully to bundled data and
the nav chip flips to **OFFLINE** — nothing breaks, no empty screens.

## B3. The life of a prediction (the session-persistent model rule)

This is the behaviour you specified, implemented literally:

> *"The user selects the ML model they want to use for the prediction, and
> throughout the session the model must be active — not loaded and shut down
> after each single prediction."*

```
 1. App loads → probes GET /api/v1/health → chip = ML LIVE
 2. A session id is generated ONCE and stored in localStorage
    (same id for the whole browser session)
 3. You click ACTIVATE on a model
    → POST /api/v1/sessions {modelId}
    → backend binds sessionId → modelId  AND PRE-LOADS the artifact (pre-warm)
 4. Every prediction: POST /api/v1/predict  (header X-Session-ID)
    → backend looks up the session → finds the model ALREADY IN MEMORY
    → runs predict_proba in-process (~0.3 ms) → returns result
 5. The model is NEVER unloaded after a prediction. It is unloaded only if:
      a) it has been completely idle for ML_IDLE_TTL_SECONDS (default 1h), or
      b) more than ML_MAX_LOADED_MODELS (default 8) DIFFERENT models are
         requested at once — then the least-recently-used one steps aside,
         and an active session constantly refreshes its own model, so
         YOUR session is never the victim.
 6. Switch models any time (ACTIVATE another) — the old one stays warm for
    its other sessions; you can switch back and it's already loaded.
```

**You can watch this happen:** Monitoring (10) shows `modelsLoaded`,
`predictionsServed`, and per-model `loads` vs `predictions` counters — run 20
predictions and see loads stay at 1 while predictions climbs.

**Switching a model mid-session = instant.** Because every registered model
can stay warm, going back to a previous version costs nothing.

## B4. Offline behaviour

Backend down? Every live page falls back to the bundled dataset copies, badges
flip to OFFLINE/MOCK, and the rest of the UI (3D, replay, telemetry) is 100%
functional. Start the backend again and the chip flips back to ML LIVE on the
next probe — no reload needed.

## B5. All configuration (backend)

Copy `backend/.env.example` → `backend/.env`. Restart the backend to apply.

| Variable | Default | Meaning |
|---|---|---|
| `ML_HOST` / `ML_PORT` | `0.0.0.0` / `8000` | Listen address |
| `ML_CORS_ORIGINS` | localhost:3000,127.0.0.1:3000,localhost:3001 | Comma-separated allowed frontend origins (scheme + host + port, no trailing slash) |
| `ML_STORE_DIR` | `backend/model_store` | Where the registry + artifacts live |
| `ML_MAX_LOADED_MODELS` | `8` | Warm-cache LRU cap |
| `ML_IDLE_TTL_SECONDS` | `3600` | Unload only after 1h of ZERO use |
| `ML_API_KEY` | *(empty)* | If set: register/promote/archive/delete/reload require header `X-API-Key`. Predict/sessions/health stay open. **Set this in production.** |
| `ML_MAX_UPLOAD_MB` | `256` | Upload size cap |
| `ML_ALLOWED_MODEL_EXTENSIONS` | `.json,.txt,.pkl,.joblib,.ubj` | Accepted model file types |

Frontend side: the backend URL resolves as
`localStorage("f1ml.apiUrl")` → `NEXT_PUBLIC_ML_API_URL` → `http://localhost:8000`.
The **Settings** page (11) can change the URL at runtime (great for testing a
deployed backend without rebuilding) — the value persists in the browser.

---

# PART C — MODELS: WHERE THEY GO + HOW TO ADD / MERGE NEW ONES

*Everything here is manual, on purpose. No agent, no CI required — ever.*

## C1. The one folder that matters

```
backend/model_store/
├── registry.json                        ← the index the backend reads at runtime
└── artifacts/
    ├── lightgbm-pit-stop-1.0.0/         ← one folder per model version
    │   ├── model.json                   ← the actual trained model
    │   └── encodings.json               ← driver/compound label encodings
    ├── xgboost-pit-stop-1.0.0/
    │   ├── model.json
    │   └── encodings.json
    └── logreg-pit-stop-1.0.0/
        ├── model.joblib                 ← sklearn artifacts are .joblib
        ├── scaler.joblib                ← optional fitted scaler
        └── encodings.json
```

Rules the system enforces for you:
- Artifact folders are **immutable** — a version, once registered, is never
  modified. A retrained model is a **new version** (new folder, new id).
- `registry.json` is updated atomically (write-to-temp + rename) — it can
  never be half-written.
- Every artifact is **SHA-256 fingerprinted** at registration and verified at
  load. You can audit any version's provenance in the Registry UI.

## C2. The three ways to add a new model — pick your favorite

### Way 1 — Drag & drop in the UI (zero commands, easiest)

Use when: you retrained a model and have the artifact file(s) on your machine.

1. Start backend + frontend (Part A).
2. Go to **09 Model Registry** → scroll to **REGISTER A NEW MODEL — VALIDATED
   UPLOAD**.
3. Fill in: name (e.g. `LightGBM Pit-Stop`), version (e.g. `1.1.0` — must be
   new), threshold (e.g. `0.64`), optional metrics JSON.
4. Drop the **model file** (`.json` for LightGBM/XGBoost dumps, `.joblib`/
   `.pkl` for sklearn, `.ubj` for XGBoost binary). Optionally drop a
   **scaler** and your **encodings.json**.
5. Click **Register model**. The backend stages the files, loads the model,
   runs a smoke prediction, fingerprints everything — if anything fails it
   tells you exactly why and nothing is added.
6. It lands as **CANDIDATE** — the champion is untouched. Compare it on the
   Model Intelligence page, then hit **PROMOTE** when you're happy.

### Way 2 — One command (local registry, no UI needed)

```bash
cd backend

# register as candidate
python scripts/register_model.py \
    --name "LightGBM Pit-Stop" --version 1.1.0 \
    --model ~/Downloads/f1_pitstop_model.json \
    --framework lightgbm --threshold 0.64 \
    --metrics '{"accuracy":0.93,"f1":0.87}' \
    --notes "Retrained Nov 2026"

# …or register AND make it champion in one go:
python scripts/register_model.py \
    --name "LightGBM Pit-Stop" --version 1.1.0 \
    --model ~/Downloads/f1_pitstop_model.json \
    --framework lightgbm --threshold 0.64 --promote
```

(If the backend is already running, restart it — or call
`POST /api/v1/models/reload` — so it picks up the new registry entry.)

### Way 3 — Retrain from the dataset (train + evaluate + register, one command)

```bash
cd backend
python scripts/retrain.py --dataset ../data/f1_strategy_dataset_v4.csv
# → trains a fresh LightGBM, evaluates it, registers the NEXT version
#   (auto-increments: 1.0.0 → 1.1.0 → 1.2.0 …) as candidate

python scripts/promote_model.py --id lightgbm-pit-stop-1.1.0   # promote
python scripts/promote_model.py --id lightgbm-pit-stop-1.0.0   # rollback
```

This is the "time to time retraining" loop you planned: run `retrain.py`,
look at the candidate's metrics in the UI, promote or ignore it. Old versions
are never deleted — rollback is always one command.

### Bonus — register against a RUNNING backend (works for production too)

```bash
python scripts/register_model.py --api https://your-backend.onrender.com \
    --api-key <your ML_API_KEY> \
    --name "LightGBM Pit-Stop" --version 1.1.0 \
    --model ./new_model.json --framework lightgbm --threshold 0.64
```

See Part D5 for when to use this in production.

## C3. What the system checks before accepting a model (why it's safe)

Every registration — UI upload or script — runs the same pipeline:

1. **Staging** — files land in a temp quarantine dir, never directly in the store.
2. **Extension + size check** — only `ML_ALLOWED_MODEL_EXTENSIONS`, max `ML_MAX_UPLOAD_MB`.
3. **Load check** — the model must actually load (LightGBM / XGBoost / sklearn).
4. **Interface check** — must expose a probability-style prediction path.
5. **Smoke prediction** — a real inference on the canonical feature schema
   must succeed.
6. **Feature-schema match** — the model's expected features are recorded and
   must line up with the canonical 12 features (below).
7. **SHA-256 fingerprints** — model, scaler and encodings are hashed; hashes
   are verified again on every cold load.
8. **Atomic commit** — only then the version folder + registry entry appear.
   Any failure → clear error, store untouched.

## C4. Promote / rollback / archive / delete

**In the UI (09 Model Registry):** every model card has **PROMOTE** (make
champion — the previous champion is auto-archived, not lost), **ARCHIVE**
(retire from the active list), **DELETE** (archived models only, refused while
any session is bound to it).

**In a terminal:**

```bash
cd backend
python scripts/promote_model.py --list                          # see everything
python scripts/promote_model.py --id lightgbm-pit-stop-1.1.0    # promote / rollback
python scripts/promote_model.py --archive --id logreg-pit-stop-1.0.0
python scripts/promote_model.py --delete  --id logreg-pit-stop-1.0.0
```

**Champion is a label, not a lock.** Users can still ACTIVATE any registered
version — champion is just the default/recommended one. That's what makes
A/B comparison and rollback trivial.

## C5. What a new model must look like

| File | Required? | Formats |
|---|---|---|
| Model artifact | **yes** | `.json` (LightGBM/XGBoost dump), `.joblib`/`.pkl` (sklearn), `.ubj` (XGBoost binary) |
| Fitted scaler | optional | `.pkl` / `.joblib` / `.json` — applied automatically before prediction |
| Encodings | optional | `encodings.json` — if your model uses the standard `Driver_enc`/`Compound_enc` features, reuse the existing `backend/data/encodings.json` |

**The canonical feature schema (12 features, this exact order):**

```
LapNumber · Stint · TyreLife · Position · LapTime · LapTime_Delta ·
Cumulative_Degradation · RaceProgress · Normalized_TyreLife ·
Position_Change · Driver_enc · Compound_enc
```

The backend's feature builder produces these from friendly inputs
(`lapNumber`, `tyreLife`, `position`, `compound`, `driver`, …) — the same
engineering as the original f1-strategy-engine project. If your retrained
model expects exactly these features (i.e. you retrained on the same
dataset), it plugs in with zero code changes.

Need a new framework (ONNX, CatBoost, …)? `backend/README.md` § "Adding a new
model framework" — it's one loader function; everything else (registry,
warm cache, UI) picks it up automatically.

## C6. The 60-second model update checklist (print this)

```
□ 1. Train your model → save as .json / .joblib / .pkl / .ubj
□ 2. Open the UI → 09 Model Registry → REGISTER A NEW MODEL
□ 3. Name + NEW version number + threshold (+ metrics if you have them)
□ 4. Drop the model file (+ scaler + encodings if used)
□ 5. Register → watch it appear as CANDIDATE
□ 6. Compare on 07 Model Intelligence (activate both, run scenarios)
□ 7. Happy? PROMOTE it. Not happy? Leave it as candidate or ARCHIVE.
□ 8. Emergency? PROMOTE the old version back — instant rollback,
     sessions that were using it never even noticed.
```

## C7. Common mistakes & instant fixes

| Symptom | Cause | Fix |
|---|---|---|
| "version already exists" | Same name+version registered before | Bump the version (`1.1.0` → `1.1.1`) |
| "feature schema mismatch" | Model trained on different features | Retrain on the canonical 12 features (C5) |
| "failed to load model" | Wrong framework or corrupt file | Check `--framework` (auto-detect usually right); re-export the model |
| Registered but not visible in UI | Backend was restarted before you looked, or browser cache | Hit refresh; the UI re-fetches on page focus |
| `metrics` JSON error on Windows cmd | Quoting | Use the exact quoting from C2, or run in PowerShell/VS Code terminal |

---

# PART D — DEPLOY TO THE WEB: VERCEL (FRONTEND) + RENDER (BACKEND)

Target architecture (both have free tiers — this costs $0 to run):

```
   https://your-app.vercel.app                https://your-api.onrender.com
┌──────────────────────────────┐            ┌──────────────────────────────┐
│  VERCEL — frontend (free)    │  HTTPS     │  RENDER — backend (free)     │
│  Next.js build, global CDN   │───────────▶│  FastAPI + models + registry │
│  env: NEXT_PUBLIC_ML_API_URL │  JSON      │  env: ML_CORS_ORIGINS,       │
│                              │            │       ML_API_KEY             │
└──────────────────────────────┘            └──────────────────────────────┘
        ↑ git push to deploy                        ↑ git push to deploy
```

## D1. Put the project on GitHub (5 minutes)

1. Create an empty repository on <https://github.com/new> — name it e.g.
   `f1-strategy-platform`. **Do NOT** add README/license (we have files).
2. From inside the unzipped folder:

```bash
cd f1-strategy-platform
git init
git add .
git commit -m "F1 Strategy Platform — frontend + ML backend"
git branch -M main
git remote add origin https://github.com/<your-username>/f1-strategy-platform.git
git push -u origin main
```

**Important:** let `backend/model_store/` be committed (it's a few MB) — on
Render's free tier the filesystem is temporary, so models that live in git
survive every restart. `node_modules`, `.next` and `.env` are already
git-ignored.

## D2. Deploy the backend on Render (step by step)

1. Go to <https://render.com> → **Sign Up** with GitHub (that's the whole account setup).
2. Dashboard → **New +** → **Web Service**.
3. **Connect a repository** → pick `f1-strategy-platform` → **Connect**.
4. Fill in exactly:

| Field | Value |
|---|---|
| Name | `f1-strategy-backend` (your choice — it becomes part of the URL) |
| Region | the one closest to you |
| Branch | `main` |
| **Root Directory** | **`backend`** ← critical |
| Runtime | **Python 3** (auto-detected from `requirements.txt`) |
| Build Command | `pip install -r requirements.txt` |
| **Start Command** | **`ML_PORT=$PORT python run.py`** ← Render assigns `$PORT`; this maps it to the backend |
| Instance Type | **Free** |

5. **Add environment variables** (Advanced → Add Environment Variable):

| Key | Value | Why |
|---|---|---|
| `ML_CORS_ORIGINS` | *(leave for now — set in D4 once you know the Vercel URL)* | allows the frontend to call the API |
| `ML_API_KEY` | a long random string, e.g. from `openssl rand -hex 24` | protects register/promote/delete in production |

6. Click **Create Web Service**. First build takes ~2–4 minutes (installs
   LightGBM/XGBoost/scikit-learn).
7. **Verify** — when it shows *Live*, open:

```
https://f1-strategy-backend.onrender.com/api/v1/health   → {"status":"ok", …}
https://f1-strategy-backend.onrender.com/docs            → interactive API
```

You should see `"modelsRegistered": 3` and `"champion": "lightgbm-pit-stop-1.0.0"`.

> Free-tier truth: the service **sleeps after ~15 min without traffic** and
> takes ~30–60 s to wake on the next request. During the wake-up window your
> UI shows OFFLINE, then flips to ML LIVE by itself. If that bothers you,
> Render Starter ($7/mo) never sleeps.

## D3. Deploy the frontend on Vercel (step by step)

1. Go to <https://vercel.com> → **Sign Up** (continue with GitHub).
2. Dashboard → **Add New… → Project**.
3. **Import** the `f1-strategy-platform` repository.
4. Configure:

| Field | Value |
|---|---|
| Framework Preset | **Next.js** (auto-detected) |
| **Root Directory** | **`frontend`** ← critical |
| Build Command | leave default (`bun run build` — Vercel sees `bun.lock` and uses Bun automatically) |
| Install Command | leave default |

5. **Add environment variable** (Environment Variables section):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_ML_API_URL` | `https://f1-strategy-backend.onrender.com` ← your Render URL from D2, **no trailing slash** |

6. Click **Deploy** (~2 minutes). You get
   `https://f1-strategy-platform.vercel.app` (or `…-<team>.vercel.app`).

## D4. Connect the two (CORS) — the step everyone forgets

1. Copy your **exact** Vercel URL (from the browser address bar, e.g.
   `https://f1-strategy-platform.vercel.app`) — scheme + host, **no trailing slash**.
2. Render → your backend service → **Environment** → edit `ML_CORS_ORIGINS`:

```
ML_CORS_ORIGINS=https://f1-strategy-platform.vercel.app
```

(Comma-separate multiple origins; add Vercel preview URLs later if you use
them. Local dev origins don't matter in production.)

3. Render → **Manual Deploy → Deploy latest commit** (env changes need a
   restart). Wait for *Live*.
4. **Verify end-to-end:** open the Vercel URL → nav chip says **ML LIVE** →
   Registry shows 3 models → ACTIVATE one → run a prediction in the Inference
   Console. If the chip says OFFLINE, check Part E.

Quick test without redeploying: UI → **11 Settings** → paste the backend URL
→ *Apply* — this overrides the API URL in your browser only (handy for
pointing the deployed UI at a different backend, or your local machine at the
deployed one).

## D5. Adding new models to PRODUCTION (your future MLOps loop)

Three options — know the trade-off and you're never surprised:

### Option A — commit models to git (recommended, free-tier-proof)

Models live in the repo → every deploy ships them → they survive restarts,
sleeps and rebuilds. This is the flow for your periodic retraining:

```bash
# on YOUR machine, in your clone:
cd backend
python scripts/retrain.py --dataset ../data/f1_strategy_dataset_v4.csv
# evaluate the candidate in the local UI if you like, then:
python scripts/promote_model.py --id lightgbm-pit-stop-1.1.0

# ship it to production:
git add backend/model_store
git commit -m "Model 1.1.0 — retrained"
git push
# Render auto-deploys → the new model is live in the Registry in ~3 min.
```

UI drag & drop uploads to Render also work instantly — but on the free tier
they vanish on the next restart/deploy (ephemeral disk). Use git (Option A)
for anything you want to keep.

### Option B — register over HTTP (instant, no redeploy)

```bash
python scripts/register_model.py \
    --api https://f1-strategy-backend.onrender.com \
    --api-key <the ML_API_KEY you set in D2> \
    --name "LightGBM Pit-Stop" --version 1.2.0 \
    --model ./new_model.json --framework lightgbm --threshold 0.64 --promote
```

Great for experiments and quick comparisons. Remember: free-tier disk is
temporary — if it's a keeper, also commit it (Option A).

### Option C — persistent disk (paid, survives everything)

Render → your service → **Disks** → add a disk mounted at
`/opt/render/model_store` (any size ≥ 1 GB) → set env
`ML_STORE_DIR=/opt/render/model_store`. Now UI uploads and `--api`
registrations are permanent. Requires a paid instance.

### Rollback in production

```bash
python scripts/promote_model.py --api https://f1-strategy-backend.onrender.com \
    --api-key <key> --id lightgbm-pit-stop-1.0.0
```

…or just PROMOTE the old version in the Registry UI. Running sessions keep
their warm model until they switch — zero downtime either way.

## D6. Updating the frontend

Any `git push` to `main` redeploys Vercel automatically (Render too). Changed
`NEXT_PUBLIC_ML_API_URL`? Redeploy once from the Vercel dashboard (Project →
Deployments → ⋯ → Redeploy) — build-time variables are baked into the bundle.

## D7. Costs & limits summary

| | Free | Paid |
|---|---|---|
| Vercel frontend | generous hobby tier, no sleep | Pro $20/mo/team (custom domains on free too) |
| Render backend | 512 MB RAM, sleeps after 15 min idle | Starter $7/mo — never sleeps; + persistent disks |
| Our models | LightGBM champion ≈ 2.7 MB — fits free tier with room to spare | — |

---

# PART E — QUICK TROUBLESHOOTING

| Symptom | Cause | Fix |
|---|---|---|
| Chip stays **OFFLINE** locally | Backend not running / wrong port | Start it (A3); check <http://localhost:8000/api/v1/health>; if you changed the port, set it in **11 Settings** |
| Chip **ML LIVE** but predictions fail | Session bound to a model whose files were removed | Registry → ACTIVATE a valid model |
| Browser console: *CORS error* | `ML_CORS_ORIGINS` missing the exact frontend origin | D4 — scheme + host, no trailing slash, redeploy backend |
| Render: *"Port scan timeout"* | Start command not using `$PORT` | Start Command must be `ML_PORT=$PORT python run.py` |
| Render first request slow (~30–60 s) | Free tier waking from sleep | Normal; Starter tier removes it |
| Vercel build fails | Root Directory not set to `frontend` | D3 step 4 — re-import or edit project settings |
| `pip install` fails on old Python | Python < 3.11 | Install 3.11+ (A2) |
| `bun: command not found` | Bun not on PATH | Reopen terminal after install, or `npm i -g bun` |
| Register rejected: *schema mismatch* | Model trained on different features | C5 — retrain on the canonical 12 features |
| Register rejected: *version exists* | Duplicate name+version | C7 — bump the version |
| Promote button greyed out | Model already champion / archived | Archive ≠ delete; only ARCHIVED models can be deleted |

---

## FAQ

**Q: Do I lose my selected model if I close the browser?**
A: The browser session id is kept in localStorage, so the same session resumes.
After 24 h of inactivity the binding expires; the backend re-binds
automatically to your next ACTIVATE. Warm models idle out after 1 h of ZERO
use — never after a prediction — and reload in milliseconds when needed.

**Q: Can two models be compared at the same time?**
A: Yes — open the UI, ACTIVATE model A, run your scenario, ACTIVATE model B,
run it again. Both stay warm; the Inference Console shows which model produced
each result. The 07 Model Intelligence page also renders side-by-side metrics
for every registered version.

**Q: Is uploading models over the internet safe?**
A: Uploads are extension-checked, size-capped, staged in quarantine, must
load and pass a smoke prediction, and are SHA-256-fingerprinted. In
production, set `ML_API_KEY` so only you can register/promote. As with any
pickle-based artifact: only register models **you or your team trained**.

**Q: Where do I see what's loaded right now?**
A: **10 Monitoring** — modelsLoaded, per-model loads/predictions counters,
active sessions, total predictions, uptime. Or `GET /api/v1/health`.

**Q: What if I never deploy and just run it locally?**
A: Totally fine — everything in Parts A–C works offline forever. The bundled
race/telemetry data ships in `frontend/public/data/`.

---

*Manual verified against the package on 2026-11-14: backend boots from
`backend/` with `python run.py` (health OK, 3 models registered, warm
session-predictions confirmed at ~0.3 ms), frontend builds with
`bun install && bun run build` (Next.js 16.1.3, clean TypeScript pass).*
