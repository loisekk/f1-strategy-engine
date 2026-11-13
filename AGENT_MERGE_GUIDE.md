# AGENT MERGE GUIDE — Executable Instructions for an AI Agent

You are merging the F1 Strategy Platform package (frontend + FastAPI ML backend)
into the user's existing repository, and attaching their original ML artifacts.
Follow this document exactly. Do not improvise structural changes. Work
stepwise; after each phase, run the verification command before continuing.
If a verification fails, stop and report — do not paper over it.

## Context (read first)

- User's original repo (`f1-strategy-engine`, Python/Streamlit) contains:
  `app.py`, `F1 pit stop app.py`, `f1_pitstop_model.json` (LightGBM booster,
  JSON), `f1_scaler.pkl` (fitted StandardScaler), `requirements.txt`,
  `README.md`. The ML training pipeline stays UNTOUCHED — we only serve it.
- The package provides: `frontend/` (premium Next.js 16 UI), `backend/`
  (FastAPI serving layer with model registry + session-persistent warm loading),
  `data/f1_strategy_dataset_v4.csv`, docs, launchers.
- Golden rule: **never modify ML training logic; never rebuild the frontend;
  models are data, not code.**

## Phase 0 — Layout

Target structure (create missing dirs, copy package contents in):

```
<repo>/
├── app.py, requirements.txt, ...        # user's original files (UNTOUCHED)
├── f1_pitstop_model.json                # user's artifacts (UNTOUCHED, read-only)
├── f1_scaler.pkl
├── frontend/                            # from package
├── backend/                             # from package
├── data/f1_strategy_dataset_v4.csv      # from package
├── dev.sh, docker-compose.yml, .env.example
└── MERGE_GUIDE.md, MLOPS_PLAYBOOK.md, API_REFERENCE.md, README.md
```

Verify: `ls frontend/package.json backend/run.py backend/model_store/registry.json` all exist.

## Phase 1 — Backend up

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python run.py &          # or: nohup python run.py > backend.log 2>&1 &
sleep 5
curl -s http://localhost:8000/api/v1/health
```

PASS criteria: JSON with `"status":"ok"`, `"modelsRegistered":3`,
`"champion":"lightgbm-pit-stop-1.0.0"`.
FAIL → check `backend.log`; common causes: port busy (change `ML_PORT`),
missing deps.

## Phase 2 — Frontend up

```bash
cd ../frontend
bun install              # npm install works too
bun run dev &            # or npm run dev
sleep 8
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000    # expect 200
```

PASS criteria: 200 AND the page HTML contains "F1 Strategy".
If the nav chip concern: in a real browser it should show "ML LIVE" (backend from
Phase 1 must still be running).

## Phase 3 — Attach the user's original model

```bash
cd ../backend
python scripts/seed_from_original.py \
  --model ../f1_pitstop_model.json \
  --scaler ../f1_scaler.pkl \
  --version 1.0.0-original --promote
```

PASS criteria: JSON output `"registered": "lightgbm-pit-stop-original-1.0.0-original"`
(sic — slug of the name + version; exact id may differ if --name changed),
`"status": "champion"`, and smoke probas within [0,1].

Then verify the registry and one real prediction:

```bash
curl -s http://localhost:8000/api/v1/models | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['champion']); [print(m['card']['id'], m['card']['status']) for m in d['models']]"

curl -s -X POST http://localhost:8000/api/v1/predict \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"driver":"VER","compound":"MEDIUM","lapNumber":34,"totalLaps":57,"stint":2,"tyreLife":22,"position":3,"lapTimeS":93.4,"lapTimeDelta":0.25}}'
```

PASS criteria: champion is the user's model; predict returns
`pitProbability` in [0,1] and a decision.

KNOWN ISSUES YOU MAY HIT (fix precisely, nothing else):
- `Unknown driver 'XXX'` → the model was trained with different driver
  encodings. Ship an `encoders.json` (sorted unique driver codes used in
  training) with the registration: add `--encoders path.json`.
- `Model expects feature 'X'...` → different feature set. Re-register with
  `--feature-schema "Comma,Separated,Names"` in training order.
- Smoke prediction shape error → scaler/model mismatch (model without scaler or
  vice versa). Register them as a pair or drop the scaler
  (LightGBM is scale-invariant).

## Phase 4 — Session persistence verification (the core requirement)

```bash
SID="verify-$$"
# bind
curl -s -X POST http://localhost:8000/api/v1/sessions -H "Content-Type: application/json" \
  -d "{\"modelId\":\"$(curl -s http://localhost:8000/api/v1/health | python3 -c 'import json,sys; print(json.load(sys.stdin)["champion"])')\",\"sessionId\":\"$SID\"}"
# predict twice
for i in 1 2; do curl -s -X POST http://localhost:8000/api/v1/predict \
  -H "Content-Type: application/json" -H "X-Session-ID: $SID" \
  -d '{"inputs":{"lapNumber":30,"tyreLife":20}}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['loadState'], d['latencyMs'], d['session']['predictions'])"; done
```

PASS criteria: line 1 may be `cold-loaded`; **line 2 must be `warm`**, latency
lower or equal, session predictions = 2. This proves the model stays active
across predictions (no load/unload per request).

## Phase 5 — UI verification (browser)

Open http://localhost:3000 and check, in order:
1. Nav chip: **ML LIVE** (top right). If OFFLINE → Settings → ML Backend →
   Save & test; check backend process and CORS.
2. `#/registry`: 4 entries (3 reference + user's champion). Click ACTIVATE on
   the champion → toast confirms warm binding.
3. `#/models`: Live Inference Console visible → set lap 34, tyre life 22 →
   RUN PREDICTION → result card with %, decision, latency, feature table.
   Run again → latency drops (warm).
4. `#/strategy`: "LIVE MODEL" badge on the verdict panel.
5. `#/monitoring`: "BACKEND SERVICES — LIVE HEALTH CHECKS".
6. Browser console: zero errors.

## Phase 6 — MLOps dry run (prove future retraining works)

```bash
cd ../backend
python scripts/register_model.py --name "LightGBM Pit-Stop" --version 9.9.9-test \
  --model ../f1_pitstop_model.json --framework lightgbm --threshold 0.64
# → candidate, champion untouched. Then:
python scripts/promote_model.py --id lightgbm-pit-stop-9.9.9-test     # champion swap
curl -s http://localhost:8000/api/v1/health                            # champion = 9.9.9-test
python scripts/promote_model.py --id <id-of-users-original>           # rollback
python scripts/promote_model.py --archive --id lightgbm-pit-stop-9.9.9-test
python scripts/promote_model.py --delete  --id lightgbm-pit-stop-9.9.9-test
```

PASS criteria: after the final command, registry has exactly 4 models and the
champion is the user's original.

## Phase 7 — Cleanup & handover

- Stop background processes; leave instructions: `./dev.sh` starts everything.
- Write a short report: what was merged, model ids registered, champion id,
  any deviations from this guide (with reasons), commands the user can re-run.
- Do NOT: edit `app.py` or training code; edit frontend source; delete
  reference models (keep them for A/B); enable `ML_API_KEY` without telling the
  user; commit `.venv`, `node_modules`, `model_store/.staging`.

## Quick reference — files you are allowed to touch

- `backend/.env` (ports, CORS, API key)
- `backend/data/encodings.json` (only if user's encodings differ — see Phase 3)
- `frontend/.env.local` (`NEXT_PUBLIC_ML_API_URL`)
- `backend/model_store/` (only via the scripts/APIs above, never by hand)
