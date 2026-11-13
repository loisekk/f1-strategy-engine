# F1 Strategy Engine — ML Serving Backend

FastAPI layer that serves the real Python ML models behind the premium
frontend. See the root `MERGE_GUIDE.md` for the full manual — this file is the
internals tour.

```
backend/
├── run.py                      # entrypoint: python run.py
├── app/
│   ├── main.py                 # app factory, CORS, routers, idle sweeper
│   ├── core/
│   │   ├── config.py           # ML_* env settings (pydantic-settings)
│   │   ├── schemas.py          # API contract (camelCase aliases ↔ frontend)
│   │   ├── registry.py         # filesystem store: atomic manifest, immutable artifacts
│   │   ├── loaders.py          # lightgbm / xgboost / sklearn loaders → uniform predict_proba
│   │   ├── validator.py        # registration pipeline: staging → load → smoke → sha256
│   │   ├── manager.py          # ★ ModelManager — session-persistent WARM cache (LRU + idle TTL)
│   │   └── sessions.py         # session ↔ model binding, pre-warm on bind
│   ├── api/routes/             # health · models · sessions · predict · strategy
│   └── services/
│       ├── features.py         # feature engineering (canonical 12 features + encodings)
│       └── strategy_sim.py     # scenario simulation + per-lap model scoring
├── scripts/                    # CLI twins of the API (CI-friendly)
│   ├── register_model.py       #   register (local store or --api http)
│   ├── promote_model.py        #   promote / rollback / archive / delete / list
│   ├── retrain.py              #   train + evaluate + register next candidate
│   ├── train_reference_models.py  # rebuild the 3 reference models + encodings
│   └── seed_from_original.py   # one-command merge of f1_pitstop_model.json + f1_scaler.pkl
├── model_store/                # registry.json + artifacts/<model-id>/
└── data/                       # encodings.json, tyre_curves.json
```

## The warm cache (the important part)

`ModelManager` keeps loaded models in an LRU `OrderedDict`. `get(model_id)`
loads once; every later call is a cache hit that also refreshes the LRU
position. Models are unloaded ONLY by:

1. the background sweeper, after `ML_IDLE_TTL_SECONDS` (default 1h) of zero
   use — never after a prediction;
2. LRU eviction beyond `ML_MAX_LOADED_MODELS` (default 8) — an active session
   continuously refreshes its model, so it is never the victim.

`bind()` (POST /sessions) pre-warms the model the moment a user selects it, so
even the first prediction is already warm in practice.

## Registry invariants

- artifact dirs are immutable; ids are unique (`name-slug` + semver);
- `registry.json` updates are atomic (temp + `os.replace`) under a lock;
- champion swaps archive the previous champion (rollback = promote it back);
- deletes: archived only, and refused while sessions are bound.

## Adding a new model framework (e.g. ONNX)

1. `app/core/loaders.py` — add a loader returning the uniform
   `NormalizedModel` (must expose `predict_proba(X) -> np.ndarray` of the
   positive class);
2. extend `sniff_framework()` for the file extension;
3. allow the extension in `ML_ALLOWED_MODEL_EXTENSIONS` if needed.

The registry, manager, sessions, validator and the whole frontend work with the
new framework automatically — that is the point of the abstraction.

## Tests / smoke checks

```bash
python run.py &                                   # start
curl -s localhost:8000/api/v1/health | python3 -m json.tool
curl -s localhost:8000/api/v1/models | python3 -m json.tool
SID=t1; curl -s -X POST localhost:8000/api/v1/sessions \
  -H 'Content-Type: application/json' -d '{"modelId":"lightgbm-pit-stop-1.0.0","sessionId":"'$SID'"}'
curl -s -X POST localhost:8000/api/v1/predict -H 'Content-Type: application/json' \
  -H "X-Session-ID: $SID" -d '{"inputs":{"lapNumber":30,"tyreLife":20}}' | python3 -m json.tool
```

Expected: second identical predict shows `"loadState": "warm"` and a lower
`latencyMs` — the model stayed resident.
