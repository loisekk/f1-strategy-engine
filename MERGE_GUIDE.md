# MERGE GUIDE — Attaching the Real ML Models Behind the Premium UI

This is the complete, hand-holding manual for merging the FastAPI ML serving
layer with your existing F1 Strategy Engine frontend **and** your original
Python artifacts (`f1_pitstop_model.json` + `f1_scaler.pkl`), while keeping the
UI permanent and making future retrained models safe to add at any time.

Companion documents: `AGENT_MERGE_GUIDE.md` (for an AI agent doing the merge),
`MLOPS_PLAYBOOK.md` (lifecycle), `API_REFERENCE.md` (endpoints).

---

## 1. What you have after the merge

```
your-repo/
├── frontend/                 ← the premium UI (unchanged visuals, new live mode)
│   └── src/services/ml-api.ts        ← typed API client (new)
│   └── src/stores/ml-session-store.ts ← session model binding (new)
│   └── src/features/...              ← registry/models/strategy/monitoring/settings
│                                        pages upgraded with live mode + offline fallback
├── backend/                  ← NEW: FastAPI ML serving layer
│   ├── app/                          ← API, registry, warm ModelManager, feature builder
│   ├── model_store/                  ← registry.json + immutable versioned artifacts
│   │   └── artifacts/
│   │       ├── lightgbm-pit-stop-1.0.0/   (champion, pre-seeded reference)
│   │       ├── xgboost-pit-stop-1.0.0/    (candidate, pre-seeded reference)
│   │       └── logreg-pit-stop-1.0.0/     (candidate + scaler, pre-seeded reference)
│   ├── scripts/                      ← register / promote / retrain / seed CLIs
│   └── data/                         ← encodings.json, tyre curves
├── data/f1_strategy_dataset_v4.csv   ← the published training dataset
├── dev.sh · docker-compose.yml       ← one-command launchers
└── f1_pitstop_model.json / f1_scaler.pkl  ← YOUR original artifacts (drop them here)
```

**The frontend never changes again when models change.** It renders whatever the
registry serves: 1 model or 50, LightGBM or XGBoost or sklearn, today's champion
or next year's — the UI is data-driven from the backend contract.

---

## 2. The serving contract — session-persistent model loading

This is the behaviour you specified, implemented exactly:

> *The user selects the ML model they want to use for making the prediction, and
> throughout the session the model must be active — not loaded and shut down
> after each single prediction.*

### How it works

```
Browser                                Backend (FastAPI, single process)
───────                                ─────────────────────────────────
1. App starts
   probe → GET /health                 → "live" — chip flips to ML LIVE

2. User clicks ACTIVATE (Registry)
   POST /sessions {modelId}            → session registry binds sessionId → modelId
                                       → ModelManager LOADS the artifact (pre-warm)
                                       ← {modelState: "warm", predictions: 0}

3. Every prediction (console, strategy,
   simulator, batch curves)
   POST /predict  [X-Session-ID]       → ModelManager cache HIT (no disk, no load)
                                       ← {loadState: "warm", latencyMs: ~0.3,
                                          session: {predictions: n+1}}

4. User switches model (any time)
   POST /sessions {newModelId}         → new artifact loaded; the old one stays
                                         warm for any OTHER sessions using it

5. Backend restarts (deploy/retrain)
   GET /sessions/{id} → 404            → frontend auto-re-binds silently;
                                         localStorage keeps the selection
```

**Guarantees baked into `ModelManager` (backend/app/core/manager.py):**

| Rule | Value | Meaning |
|---|---|---|
| Load policy | load-once | `get(model_id)` loads the artifact the first time; every later call is an in-memory cache hit |
| Unload policy | idle TTL only | a model is unloaded **only** after `ML_IDLE_TTL_SECONDS` (default 3600) with zero use — never after a prediction |
| Memory cap | LRU, `ML_MAX_LOADED_MODELS`=8 | if more distinct models are actively used, the least-recently-used cold one is evicted; a session that keeps predicting keeps its model at the front of the queue |
| Promotion | no unload | promoting a new champion never unloads anything; sessions on the old champion continue on their warm copy until they switch |
| Sessions | in-memory, 24h TTL | GC'd automatically; restart-safe (frontend re-binds) |

You can watch it happen: the Registry page shows **WARM · n PRED** per model, the
Inference Console shows `loadState: warm` and a growing session counter, and the
second prediction is visibly faster than the first (model load ≈ 2 ms happens
once; warm inference ≈ 0.3 ms forever after).

### Where the session lives

- Frontend: `localStorage["f1ml.sessionId"]` (UUID, created once, survives
  reloads) + `localStorage["f1ml.selectedModelId"]`.
- Backend: in-memory `SessionRegistry` (see `app/core/sessions.py`).
- Settings → *ML Backend* → **New session** resets the binding on demand.

---

## 3. The merge, step by step

### Step 0 — prerequisites

- Python 3.11+ (tested on 3.12)
- Bun ≥ 1.2 (pinned 1.4 in `package.json` — `npm`/`pnpm` also work)
- Your original repo checked out (or just this package, standalone — the
  frontend works against the bundled data even with no backend)

### Step 1 — start the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # or: uv venv
pip install -r requirements.txt                       # or: uv sync
python run.py
# INFO: Uvicorn running on http://0.0.0.0:8000
```

Verify (3 models ship pre-registered and pre-seeded):

```bash
curl http://localhost:8000/api/v1/health
# {"status":"ok","modelsRegistered":3,"champion":"lightgbm-pit-stop-1.0.0",...}
```

Interactive API docs: **http://localhost:8000/docs**

### Step 2 — start the frontend

```bash
cd frontend
bun install
bun run dev            # → http://localhost:3000
```

The nav chip shows **ML LIVE**. If it shows **ML OFFLINE**, see §9.

Optional — pin the backend URL for deployments (default is localhost:8000):

```bash
# frontend/.env.local
NEXT_PUBLIC_ML_API_URL=http://your-server:8000
```

(The Settings page can also override the URL per browser, no rebuild needed.)

### Step 3 — attach YOUR original model (the actual "merge")

Copy `f1_pitstop_model.json` and `f1_scaler.pkl` from your original project into
the repo root, then:

```bash
cd backend
python scripts/seed_from_original.py \
    --model   ../f1_pitstop_model.json \
    --scaler  ../f1_scaler.pkl \
    --version 1.0.0-original \
    --promote
```

What happens (all logged, all reversible):

1. The artifact is copied to a **staging directory** (your file is never touched).
2. It is **loaded and smoke-tested** (3 feature rows → probabilities in [0,1]).
3. sha256 of both files is recorded in the registry.
4. It enters the store as an **immutable, versioned directory**:
   `model_store/artifacts/lightgbm-pit-stop-original-1.0.0-original/`.
5. With `--promote` it becomes **champion**; the reference replica is archived
   (still selectable — promote it back any time to A/B).

Then reload the frontend: the Registry lists your model as CHAMPION; ACTIVATE
it; the Inference Console, Strategy Simulator and Monitoring all serve your
artifact. **No frontend file is edited. Ever.**

### Step 4 — verify the session behaviour

1. Registry → ACTIVATE your model → toast: *warm and bound to this session*.
2. Model Intelligence → Live Inference Console → **RUN PREDICTION** twice.
   - First run: `latency ~2ms`, `loadState: cold-loaded`, session pred. 1.
   - Second run: `latency ~0.3ms`, `loadState: warm`, session pred. 2.
3. Registry → the model row now shows **WARM · 2 PRED**.

That is the contract from §2, observable in the UI.

---

## 4. Adding future models (the MLOps loop)

Time passes, you retrain. Every path below ends in the same safe place:
**a validated CANDIDATE that cannot affect anything until you promote it.**

### From the UI (no CLI)

Registry → *Register a new model*:
- drop the model file (`.json`/`.txt` = LightGBM/XGBoost booster, `.pkl`/`.joblib`
  = sklearn estimator, `.ubj` = XGBoost binary)
- optionally drop the scaler and/or an `encodings.json`
- name, version (e.g. `2.0.0`), decision threshold, notes → **Register**

The response includes the smoke-test result. The entry appears as CANDIDATE.
Compare it in Model Intelligence (its metrics travel with the card), run live
predictions against it by ACTIVATE-ing it, then **PROMOTE** when convinced.

### From the CLI (CI-friendly, same validation)

```bash
cd backend

# register (local store, no server needed)
python scripts/register_model.py --name "LightGBM Pit-Stop" --version 2.0.0 \
    --model ../retrained/model.json --encoders data/encodings.json \
    --framework lightgbm --threshold 0.64 --metrics '{"f1":0.88}' --promote

# register against a RUNNING backend (identical validation over HTTP)
python scripts/register_model.py --api http://localhost:8000 ... 

# promote / rollback / archive / delete / list
python scripts/promote_model.py --list
python scripts/promote_model.py --id lightgbm-pit-stop-2.0.0
python scripts/promote_model.py --id lightgbm-pit-stop-1.0.0-original   # rollback
```

### Full retrain in one command

```bash
python scripts/retrain.py --dataset ../data/f1_strategy_dataset_v4.csv
# trains → evaluates on held-out 20% → registers as lightgbm-pit-stop-<next-version> candidate
```

Wire it to cron/GitHub Actions — see `MLOPS_PLAYBOOK.md` for cadence, promotion
policy and monitoring.

### Rules that keep this safe

- **Artifact directories are immutable.** Re-registering the same id is
  rejected — a new model is a new version. Bumping versions is enforced.
- **Champion is never auto-replaced.** Registration produces candidates only;
  promotion is an explicit human action (UI button or CLI flag).
- **Zero-downtime swap.** Promotion flips a manifest entry atomically. Sessions
  already bound to the old champion keep their warm model — deletion of an
  archived model is even refused while sessions are bound to it.
- **Rollback is one command** (promote the archived version back).

---

## 5. Feature schema & encodings (the only place semantics live)

The serving layer reproduces the original pipeline's feature engineering in
**one file**: `backend/app/services/features.py`.

Canonical 12 features (order matters):

```
LapNumber, Stint, TyreLife, Position, LapTime, LapTime_Delta,
Cumulative_Degradation, RaceProgress, Normalized_TyreLife,
Position_Change, Driver_enc, Compound_enc
```

- **Semantic inputs** (`driver: "VER"`, `compound: "MEDIUM"`, `lapNumber: 34`,
  …) are accepted from the UI and encoded server-side.
- **Encodings** = index into the sorted unique values of the dataset
  (`backend/data/encodings.json`) — identical to the `LabelEncoder` fit on the
  full columns during training. Regenerate with
  `python scripts/train_reference_models.py` after a dataset update, or ship
  your own `encodings.json` next to the model (drop it in the upload form).
- **Derived features** (`RaceProgress = lapNumber/totalLaps`,
  `Normalized_TyreLife = tyreLife/40`, `Cumulative_Degradation = 0.15×tyreLife`)
  are computed server-side; every one of them can be overridden per request
  (`raceProgress`, `normalizedTyreLife`, `cumulativeDegradation` fields).
- **Schema matching is automatic**: canonical names, generic `f0..f11` /
  `Column_0..Column_11` placeholders (numpy-trained boosters), or any custom
  schema by name. If your model was trained on a different feature set, pass
  `--feature-schema` (comma list or JSON file) at registration — or extend
  `build_feature_row()`, the single documented place to do it.

If your training script derived features differently (check your `app.py`),
edit `DERIVATIONS` in `features.py` — one function, clearly marked, tested by
the smoke prediction at registration time.

---

## 6. Security model

| Layer | Mechanism |
|---|---|
| Upload endpoint | extension whitelist, 256 MB cap, staging quarantine, load + smoke-test before anything is registered |
| Mutating endpoints | optional shared secret — set `ML_API_KEY=...` in `backend/.env`; then register/promote/archive/delete/reload require `X-API-Key` (predictions/sessions/health stay open for the UI) |
| Integrity | sha256 recorded per artifact at registration; visible in the registry JSON |
| Registry writes | atomic (`os.replace`) + process-wide lock; corrupt manifests fail loud, never half-written |
| Pickle warning | `.pkl`/`.joblib` deserialisation executes code by design. Only register artifacts you trained yourself. For shared/production deployments keep `ML_API_KEY` set and the port firewalled. |
| CORS | locked to localhost:3000/3001 by default; widen via `ML_CORS_ORIGINS` |

---

## 7. Frontend integration points (what changed, file by file)

| File | Change |
|---|---|
| `src/services/ml-api.ts` | **NEW** — typed client: health/models/sessions/predict/batch/register/promote, localStorage config, timeouts, session header |
| `src/stores/ml-session-store.ts` | **NEW** — Zustand store: probe → live/offline, model selection (persisted), predict wrappers, promote/archive/delete |
| `src/components/nav/app-shell.tsx` | probe on startup (3 lines) |
| `src/components/nav/top-navigation.tsx` | ML LIVE / ML OFFLINE status chip |
| `src/features/registry/registry-page.tsx` | live registry: sessions bar, ACTIVATE/PROMOTE/ARCHIVE/DELETE, validated upload panel; static reference view when offline |
| `src/features/models/inference-console.tsx` | **NEW** — live inference console (model selector, race-state form, real prediction, feature vector) |
| `src/features/models/models-page.tsx` | mounts the console (+2 lines) |
| `src/features/strategy/strategy-page.tsx` | live verdict + live model curve (one batch call per state change); pre-computed grid fallback offline |
| `src/features/monitoring/monitoring-page.tsx` | backend services panel flips to live health checks |
| `src/features/settings/settings-page.tsx` | ML Backend panel: URL, API key, reconnect, new session |

**The offline fallback is a feature, not a compromise**: with no backend the app
behaves exactly like the original (bundled datasets, pre-computed model surface),
with honest OFFLINE badges. Starting the backend upgrades it in place.

---

## 8. Configuration reference (backend/.env)

```ini
ML_HOST=0.0.0.0
ML_PORT=8000
ML_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ML_STORE_DIR=./model_store            # default next to backend/
ML_MAX_LOADED_MODELS=8                 # warm cache cap (LRU)
ML_IDLE_TTL_SECONDS=3600               # unload after 1h unused (never after a prediction)
ML_SESSION_IDLE_TTL_SECONDS=86400      # unbind sessions idle 24h
ML_API_KEY=                            # set to protect mutating endpoints
ML_MAX_UPLOAD_MB=256
```

Frontend: `NEXT_PUBLIC_ML_API_URL` (build-time default; the Settings page
overrides per browser and persists to localStorage).

---

## 9. Troubleshooting

**Chip shows ML OFFLINE**
→ Is the backend up? `curl http://localhost:8000/api/v1/health`.
→ Different port/host? Set it in Settings → ML Backend → Save & test, or
   `NEXT_PUBLIC_ML_API_URL`. Check `ML_CORS_ORIGINS` includes the frontend origin
   (browser console shows CORS errors).

**"Unknown driver 'XXX'" (422)**
→ The driver code is not in `backend/data/encodings.json`. Either send
   `driverEnc` numerically, regenerate encodings from your dataset
   (`python scripts/train_reference_models.py` writes them), or ship your own
   `encodings.json` with the model.

**"Model expects feature 'X' which this serving layer does not produce"**
→ Your model was trained on a different feature set. Re-register with
   `--feature-schema` matching your training columns, or extend
   `build_feature_row()`.

**"Model id '…' already exists"**
→ Good — that is immutability working. Bump the version (`2.0.0`), or archive +
   delete the old entry first.

**Predictions look off after registering my original model**
→ Compare a known row from your training data: run the Inference Console with
   the same inputs and check the **feature vector** table (shown under every
   result) against what your `app.py` fed the model. 99% of the time it is an
   encoding or derived-feature mismatch — see §5.

**Backend restarted and my session is gone**
→ By design; the frontend re-binds automatically on your next interaction. The
   selected model persists in localStorage.

**Deleting a model is refused**
→ Sessions are still bound to it. Switch them (or wait for the 24h session GC),
   or restart the backend.

---

## 10. Where to go next

- `API_REFERENCE.md` — every endpoint, curl examples.
- `MLOPS_PLAYBOOK.md` — retraining cadence, promotion gates, rollback drills.
- `backend/README.md` — internals: registry layout, warm cache internals, adding
  a new framework loader (e.g. ONNX or a Keras model) — one file, ~30 lines.
