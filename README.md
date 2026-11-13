# F1 Strategy Engine — Premium Platform + Real ML Backend

Complete package: the premium motorsport-engineering frontend (Next.js 16 · React 19 ·
Three.js · Bun) **merged with a production-grade ML serving backend** (FastAPI ·
model registry · session-persistent warm inference · MLOps lifecycle).

The UI is permanent. Models come and go — registered, evaluated, promoted, rolled
back — without ever touching the frontend or restarting anything.

```
┌──────────────────────────────┐      ┌───────────────────────────────────┐
│  frontend/  (port 3000)      │      │  backend/  (port 8000)            │
│  Next.js 16 + React 19       │HTTP  │  FastAPI                          │
│  Three.js exploded-view car  │─────▶│  · model registry (champion/      │
│  race replay · telemetry ·   │      │    candidate/archived)            │
│  strategy · driver intel     │      │  · warm ModelManager (session-    │
│  ⌘K command palette          │      │    persistent loading)            │
│                              │      │  · real prediction + strategy sim │
│  Falls back to bundled data  │      │  · validated uploads (MLOps)      │
│  automatically when offline  │      │  · 3 reference models PRE-SEEDED  │
└──────────────────────────────┘      └───────────────────────────────────┘
                                                 │
                                       model_store/artifacts/
                                       (immutable, versioned, sha256-audited)
```

---

## Quickstart (2 terminals)

**Prerequisites:** Node/Bun for the frontend, Python 3.11+ for the backend.

```bash
# 1 — backend (serves real predictions; 3 reference models ship pre-registered)
cd backend
pip install -r requirements.txt     # or: uv sync
python run.py                       # → http://localhost:8000  (docs at /docs)

# 2 — frontend (new terminal)
cd frontend
bun install                         # Bun ≥ 1.2 (pinned 1.4); npm install also works
bun run dev                         # → http://localhost:3000
```

Open **http://localhost:3000** — the nav chip flips to **ML LIVE**. Go to
**09 Model Registry** → *ACTIVATE* a model → **07 Model Intelligence** → run a
real prediction in the Live Inference Console.

One-command alternative: `./dev.sh` (starts both) or `docker compose up`.

## Attach YOUR original model (the merge, one command)

```bash
# from backend/, with f1_pitstop_model.json + f1_scaler.pkl at the repo root
python scripts/seed_from_original.py --model ../f1_pitstop_model.json \
                                      --scaler  ../f1_scaler.pkl \
                                      --version 1.0.0-original --promote
```

Validated (load + smoke prediction + sha256), registered, promoted to champion.
The previous champion stays available for A/B comparison. Done — the UI, strategy
simulator and inference console now serve YOUR artifact.

## What ships pre-seeded

| Model | Status | Notes |
|---|---|---|
| LightGBM Pit-Stop 1.0.0 | champion | Verified replica of the documented pipeline (f1 0.861, threshold 0.64) |
| XGBoost Pit-Stop 1.0.0 | candidate | Challenger baseline (threshold 0.60) |
| LogReg Pit-Stop 1.0.0 | candidate | Linear baseline + StandardScaler — demonstrates the scaler serving path |

All trained on the published dataset (`data/f1_strategy_dataset_v4.csv`, 101,371
laps, same 12 features and 80/20 split as the original project).

## MLOps loop (retraining over time)

```bash
cd backend
python scripts/retrain.py --dataset ../data/f1_strategy_dataset_v4.csv   # → new candidate
# evaluate in the UI (Model Intelligence + Registry), then:
python scripts/promote_model.py --id lightgbm-pit-stop-1.1.0             # champion swap
python scripts/promote_model.py --id lightgbm-pit-stop-1.0.0             # rollback anytime
```

Or entirely from the UI: **Registry → Register a new model** (drag & drop the
artifacts) → *Promote*. Sessions already running keep their warm model — zero
downtime, zero frontend changes.

## Documentation

| File | Purpose |
|---|---|
| **MERGE_GUIDE.md** | The complete merge manual — architecture, session-persistent loading, security, troubleshooting |
| **AGENT_MERGE_GUIDE.md** | Step-by-step instructions for an AI agent performing the merge |
| **MLOPS_PLAYBOOK.md** | Retraining cadence, promotion policy, rollback, monitoring |
| **API_REFERENCE.md** | Every endpoint with request/response examples |
| backend/README.md | Backend internals (registry, warm cache, loaders) |

## Stack

- **Frontend:** Next.js 16 · React 19 · TypeScript 5 · Tailwind 4 · Three.js/R3F · GSAP · Zustand · Recharts · shadcn/ui — managed with **Bun 1.4**
- **Backend:** Python 3.12 · FastAPI · Pydantic v2 · LightGBM · XGBoost · scikit-learn · Uvicorn
- **Contract:** camelCase JSON, typed on both sides (`backend/app/core/schemas.py` ↔ `frontend/src/services/ml-api.ts`)

## License & credits

Independent engineering project. Not affiliated with Formula One Group, the FIA,
or any team. Dataset derived from public F1 timing data (f1-strategy-engine,
loisekk). 3D model "F1 2022 Generic" by TheoDevF1 (CC-BY-NC-ND-4.0), split into
engineering groups by this project's build pipeline.
