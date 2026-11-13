# API REFERENCE — ML Serving Layer

Base URL: `http://localhost:8000` (configurable via `ML_HOST`/`ML_PORT`).
All endpoints live under `/api/v1`. Interactive docs: `/docs`.

Conventions:
- JSON bodies and responses, **camelCase** keys.
- `X-Session-ID` header (any string, typically a UUID) binds requests to a
  browser session. Send it on predictions to keep one model warm per session.
- `X-API-Key` header required on mutating endpoints **only when** `ML_API_KEY`
  is set in the backend environment.

Error shape: `{"detail": "human-readable message"}` with proper HTTP codes
(404 unknown model, 409 conflict/state error, 413 too large, 422 validation,
401 bad/missing key).

---

## System

### GET /api/v1/health

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptimeSeconds": 128.4,
  "modelsRegistered": 3,
  "modelsLoaded": 1,
  "champion": "lightgbm-pit-stop-1.0.0",
  "sessionsActive": 2,
  "predictionsServed": 47,
  "storePath": "/…/backend/model_store"
}
```

Used by the frontend to flip between LIVE and OFFLINE modes.

---

## Models

### GET /api/v1/models

```json
{
  "models": [
    {
      "card": {
        "id": "lightgbm-pit-stop-1.0.0",
        "name": "LightGBM Pit-Stop",
        "framework": "lightgbm",
        "version": "1.0.0",
        "status": "champion",
        "task": "pitstop_binary_classification",
        "threshold": 0.64,
        "artifact": "model.json",
        "scaler": null,
        "encoders": "encodings.json",
        "featureSchema": ["LapNumber", "Stint", "…12 features"],
        "metrics": {"accuracy": 0.9268, "precision": 0.8339, "recall": 0.8901,
                     "f1": 0.861, "rocAuc": 0.975, "threshold": 0.64, "testRows": 20275},
        "notes": "…",
        "registeredAt": "2026-11-13T18:28:26Z",
        "sha256": {"model": "406c2f32…", "scaler": null, "encoders": "…"},
        "sizeBytes": 2729161
      },
      "runtime": {"warm": true, "loads": 1, "predictions": 14,
                   "loadMs": 4.1, "lastUsedSecondsAgo": 3.2, "loadedAt": "…"}
    }
  ],
  "champion": "lightgbm-pit-stop-1.0.0",
  "totalPredictions": 21
}
```

### GET /api/v1/models/{model_id}
Single entry (card + runtime). 404 if unknown.

### POST /api/v1/models/register — validated upload *(API key if configured)*

`multipart/form-data`:

| Field | Type | Notes |
|---|---|---|
| `model_file` | file | required — `.json`/`.txt` (LightGBM/XGBoost booster), `.pkl`/`.joblib` (sklearn), `.ubj` (XGBoost) |
| `meta` | text (JSON) | `{"name", "version", "framework", "threshold", "notes", "metrics"}` |
| `scaler_file` | file | optional fitted scaler (`.pkl`/`.joblib`) |
| `encoders_file` | file | optional `encodings.json` (driver/compound class lists) |

Pipeline: extension + size check → staging quarantine → framework sniff →
load → smoke prediction (3 rows, probabilities must be in [0,1]) → sha256 →
atomic move into the store → registered as **CANDIDATE**.

```json
{
  "card": {"id": "lightgbm-pit-stop-2.0.0", "status": "candidate", "…": "…"},
  "smokeTest": {"loadMs": 4.1, "probas": [0.03, 0.11, 0.42], "scaler": false, "encoders": true},
  "message": "Registered 'lightgbm-pit-stop-2.0.0' as CANDIDATE. …"
}
```

### POST /api/v1/models/{id}/promote *(API key if configured)*
Champion swap: target → `champion`, previous champion → `archived`.
Promoting an archived model = rollback. Warm sessions are untouched.

### POST /api/v1/models/{id}/archive *(API key if configured)*
→ `archived` (deletable state).

### DELETE /api/v1/models/{id} *(API key if configured)*
Archived models only; **409** while sessions are bound to it.

### POST /api/v1/models/{id}/reload *(API key if configured)*
Force cold reload of the artifact (dev tool).

---

## Sessions — the session-persistent model binding

### POST /api/v1/sessions

```json
// body
{"modelId": "lightgbm-pit-stop-1.0.0", "sessionId": "browser-uuid-optional"}
// or send no sessionId and use the X-Session-ID header
```

Creates or rebinds a session and **pre-warms** the model (loads it into memory
immediately). Response:

```json
{"id": "browser-uuid", "modelId": "lightgbm-pit-stop-1.0.0",
 "createdAt": "…", "lastUsed": "…", "predictions": 0, "modelState": "warm"}
```

### GET /api/v1/sessions/{id}
Session status (404 after a backend restart → frontend re-binds silently).

### GET /api/v1/sessions
All sessions + distinct bound models.

### DELETE /api/v1/sessions/{id}
Unbind (the model stays warm for others).

---

## Prediction — real inference through the warm model

### POST /api/v1/predict

Model resolution order: body `modelId` → session binding (`X-Session-ID`) →
registry champion.

```json
{
  "modelId": "lightgbm-pit-stop-1.0.0",       // optional
  "inputs": {
    "driver": "VER",                            // encoded server-side
    "compound": "MEDIUM",
    "lapNumber": 34, "totalLaps": 57,
    "stint": 2, "tyreLife": 22, "position": 3,
    "lapTimeS": 93.4, "lapTimeDelta": 0.25,
    // derived server-side, each overridable:
    // "raceProgress", "normalizedTyreLife", "cumulativeDegradation",
    // "positionChange", "driverEnc", "compoundEnc"
  }
}
```

Response:

```json
{
  "modelId": "lightgbm-pit-stop-1.0.0",
  "modelName": "LightGBM Pit-Stop",
  "modelVersion": "1.0.0",
  "framework": "lightgbm",
  "status": "champion",
  "pitProbability": 0.1042,
  "threshold": 0.64,
  "decision": "STAY",                // BOX ≥ threshold · WATCH ≥ 0.7×threshold
  "latencyMs": 0.49,
  "loadState": "warm",               // "cold-loaded" only on the very first call
  "scaled": false,                   // true when a scaler is applied
  "session": {"id": "…", "predictions": 5, "modelState": "warm", "…": "…"},
  "featureNames": ["LapNumber", "…"],
  "featureVector": [34.0, 2.0, 22.0, "…"]
}
```

### POST /api/v1/predict/batch

Same contract, `inputs` is an array (≤ 2000). One warm batch call — used by the
Strategy Simulator to draw the live model curve (40 rows in < 1 ms).

---

## Strategy

### POST /api/v1/strategy/simulate

```json
{
  "currentLap": 18, "totalLaps": 57, "baselineLapS": 95.0,
  "pitLossS": 19.9,                  // optional — default from tyre curves
  "driver": "VER", "position": 3, "lapTimeS": 93.0,
  "useModel": true,                  // score every remaining lap through the model
  "modelId": null,                   // optional — session/champion by default
  "scenarios": [
    {"label": "A — ONE STOP", "startCompound": "MEDIUM", "startAge": 16,
     "stops": [{"lap": 34, "compound": "HARD"}]},
    {"label": "B — TWO STOPS", "startCompound": "MEDIUM", "startAge": 16,
     "stops": [{"lap": 28, "compound": "MEDIUM"}, {"lap": 44, "compound": "HARD"}]}
  ]
}
```

Per scenario: `predictedRaceTimeS`, `pitLossTotalS`, `stintPlan`,
`avgDegPerLap`, `finalTyreAge`, empirical `meanPitProbability`, and when
`useModel` — `modelMeanPitProbability` + `modelRecommendedBoxLap` (first lap
where P(box) ≥ threshold), computed with ONE warm batch inference per scenario.

---

## curl quickstart

```bash
# health
curl -s localhost:8000/api/v1/health | jq

# bind a session and keep the model warm
SID=$(uuidgen)
curl -s -X POST localhost:8000/api/v1/sessions -H 'Content-Type: application/json' \
  -d "{\"modelId\":\"$(curl -s localhost:8000/api/v1/health | jq -r .champion)\",\"sessionId\":\"$SID\"}"

# real prediction (session-bound — model stays active)
curl -s -X POST localhost:8000/api/v1/predict -H 'Content-Type: application/json' \
  -H "X-Session-ID: $SID" \
  -d '{"inputs":{"driver":"VER","compound":"MEDIUM","lapNumber":34,"tyreLife":22}}' | jq
```
