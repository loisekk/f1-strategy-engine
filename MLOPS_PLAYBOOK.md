# MLOPS PLAYBOOK — Model Lifecycle Over Time

How the platform absorbs retraining: every N months you retrain on fresh data,
register the result, evaluate, promote — with the UI untouched and zero
downtime. This document is the operating manual.

---

## 1. The lifecycle at a glance

```
        ┌────────────┐   register    ┌───────────┐   evaluate    ┌────────────┐
 train ─▶│  artifact  ├─────────────▶│ CANDIDATE │──────────────▶│  decision  │
        └────────────┘  (validated)  └───────────┘  (live A/B)   └─────┬──────┘
                         ▲                                  promote     │ archive
                         │ rollback                             ┌──────▼──────┐
                      ┌──┴────────┐                             │  ARCHIVED   │
                      │ CHAMPION  │◀────────────────────────────┤ (previous)  │
                      └───────────┘   promote back (rollback)    └─────────────┘
```

States are pure metadata in `model_store/registry.json`; artifacts are immutable
directories. Nothing is ever mutated in place.

## 2. Retraining

### Cadence (suggested)

| Trigger | Action |
|---|---|
| New season of race data (yearly) | Full retrain, new major version (`2.0.0`) |
| New races appended (monthly/quarterly) | Incremental retrain, minor version (`1.1.0`) |
| Threshold/hyperparameter tuning | Patch version (`1.0.1`) |
| Suspected drift (see §5) | Immediate retrain + investigation |

### One command

```bash
cd backend
python scripts/retrain.py --dataset ../data/f1_strategy_dataset_v4.csv
```

- Trains the documented LightGBM configuration on the dataset.
- Evaluates on a stratified held-out 20% (seed 42 — comparable across runs).
- Auto-increments the version beyond the highest existing one.
- Registers as **CANDIDATE** with metrics attached to the card.

Prefer your own training code (the original pipeline, AutoML, etc.)? Fine —
produce a booster file (`Booster.save_model("model.json")` or
`get_booster().save_model(...)`, or joblib for sklearn) and register it:

```bash
python scripts/register_model.py --name "LightGBM Pit-Stop" --version 2.0.0 \
  --model artifacts/model.json --scaler artifacts/scaler.pkl \
  --encoders data/encodings.json --framework lightgbm --threshold 0.64 \
  --metrics '{"accuracy":0.93,"precision":0.85,"recall":0.90,"f1":0.87,"rocAuc":0.98}'
```

### CI example (GitHub Actions)

```yaml
name: retrain
on:
  schedule: [{cron: "0 3 1 * *"}]        # monthly
  workflow_dispatch:
jobs:
  train:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.12"}
      - run: pip install -r backend/requirements.txt
      - run: |
          cd backend
          python scripts/retrain.py --dataset ../data/f1_strategy_dataset_v4.csv
      - run: |                                   # promote gate: F1 must beat champion
          cd backend
          BEST=$(python - <<'EOF'
          from app.core.registry import store
          champ = next((c for c in store.list_cards() if c.status=="champion"), None)
          cand  = max((c for c in store.list_cards() if c.status=="candidate"),
                      key=lambda c: c.metrics.get("f1", 0), default=None)
          assert cand, "no candidate"
          if champ is None or cand.metrics.get("f1",0) > champ.metrics.get("f1",0):
              print(cand.id)
          EOF)
          if [ -n "$BEST" ]; then python scripts/promote_model.py --id "$BEST"; fi
```

## 3. Evaluation gate (promote only on evidence)

Before promoting, use the platform itself:

1. **Metrics on the card** — `f1` / `rocAuc` at the candidate's own threshold,
   computed on the same held-out split (seeded → comparable).
2. **Live A/B** — Registry → ACTIVATE the candidate for your session; run the
   Inference Console and Strategy Simulator against it; switch back and compare.
3. **Domain sanity** — the strategy page's model curve should still rise with
   tyre age; probabilities at fresh tyres should be low, at old tyres high.

Promotion policy (recommended): candidate must beat the champion on **pit-class
F1** by ≥ 0.005 with no recall regression > 0.01. Encode it in CI (above) or
apply it by hand — the platform never auto-promotes.

## 4. Promote / rollback / retire

```bash
python scripts/promote_model.py --list                        # current state
python scripts/promote_model.py --id lightgbm-pit-stop-2.0.0  # promote
python scripts/promote_model.py --id lightgbm-pit-stop-1.0.0-original  # rollback
python scripts/promote_model.py --archive --id lightgbm-pit-stop-1.1.0
python scripts/promote_model.py --delete  --id lightgbm-pit-stop-1.1.0   # archived only
```

Or the same from the Registry page (PROMOTE / ARCHIVE / DELETE buttons).

**During a promotion:**
- new predictions with no explicit model → new champion
- sessions bound to the old champion → keep their warm old model (by design)
- deletion of an archived model → refused while any session is bound to it

## 5. Monitoring & drift

- **Monitoring page** — live health: models registered/loaded, predictions
  served, active sessions, champion id.
- **Registry page** — per-model `WARM · n PRED` runtime stats.
- **Drift signals to watch** (add your own collectors later; the API is ready):
  - mean predicted probability creeping up at fixed feature states → tyre data
    distribution shifted → retrain.
  - BOX-decision rate per race diverging from historical pit rates.
  - smoke probas at registration drifting vs the same states last release.

## 6. Housekeeping

- `model_store/.staging/` — quarantined uploads; safe to clear when the backend
  is stopped (it also self-cleans on failure).
- Keep at least the current champion + the previous one (rollback depth 1).
  Archive the rest; delete only archaic versions.
- The registry JSON is human-readable and version-control friendly — commit
  `model_store/registry.json` (and optionally the artifacts) to track lineage.
- Backups: the store is a directory — `tar` it. sha256 hashes are inside every
  card for verification after restore.

## 7. Incident runbook

| Symptom | Action |
|---|---|
| Champion misbehaving after promote | `promote_model.py --id <previous>` — instant rollback, warm sessions unaffected |
| Bad artifact registered but caught at validation | Nothing to do — it never entered the store |
| Bad artifact promoted anyway | Roll back (above), then archive + delete the bad version |
| Backend OOM (many huge models loaded) | Lower `ML_MAX_LOADED_MODELS` in `backend/.env`, restart; LRU keeps active sessions' models |
| Suspected pickle tampering | `ML_API_KEY` was unset — set it, audit `registry.json` sha256 values against your training logs, re-register from source |
