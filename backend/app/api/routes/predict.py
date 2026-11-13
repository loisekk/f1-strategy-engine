"""Prediction endpoints — REAL inference through the session's warm model.

Resolution order for the model:
  1. explicit `modelId` in the body
  2. the session bound via X-Session-ID (header or body sessionId)
  3. the registry champion

The model is loaded once and stays warm — `loadState` reports 'warm' for
every call after the first of a model.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Header, HTTPException, status as http

from ...core.manager import manager
from ...core.registry import RegistryError, store
from ...core.schemas import (
    BatchPredictRequest,
    BatchPredictResponse,
    PredictRequest,
    PredictResponse,
    SessionInfo,
)
from ...core.sessions import sessions
from ...services.features import FeatureError, build_feature_row, rows_for_batch

router = APIRouter(tags=["prediction"])


def _resolve_model(model_id: str | None, session_id: str | None) -> tuple[str, str | None]:
    """Returns (model_id, session_id|None). Raises 404/400 with clear hints."""
    sid = session_id
    if sid:
        try:
            s = sessions.get(sid)
            if not model_id:
                model_id = s.model_id
        except KeyError:
            # unknown session (backend restart) — fall through to champion
            sid = None
    if not model_id:
        model_id = store.champion_id()
    if not model_id:
        raise HTTPException(
            http.HTTP_409_CONFLICT,
            detail="No model registered yet. Register one first: "
            "POST /api/v1/models/register (see MERGE_GUIDE.md §4).",
        )
    return model_id, sid


def _decision(p: float, threshold: float) -> str:
    if p >= threshold:
        return "BOX"
    if p >= threshold * 0.7:  # 0.64 -> watch band starts at 0.45
        return "WATCH"
    return "STAY"


@router.post("/predict", response_model=PredictResponse)
async def predict(
    body: PredictRequest,
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
) -> PredictResponse:
    session_id = x_session_id or getattr(body, "session_id", None)
    model_id, session_id = _resolve_model(body.model_id, session_id)

    try:
        lm = manager.get(model_id)
    except RegistryError as exc:
        raise HTTPException(http.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(http.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    try:
        row, names = build_feature_row(body.inputs, lm.encoders, lm.card.feature_schema)
    except FeatureError as exc:
        raise HTTPException(http.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    t0 = time.perf_counter()
    proba, load_state, _count = manager.predict_proba(model_id, [row])
    latency_ms = (time.perf_counter() - t0) * 1000

    session_info: SessionInfo | None = None
    if session_id:
        s = sessions.record_prediction(session_id, model_id)
        session_info = sessions.to_info(s)

    return PredictResponse(
        modelId=lm.card.id,
        modelName=lm.card.name,
        modelVersion=lm.card.version,
        framework=lm.card.framework,
        status=lm.card.status,
        pitProbability=round(proba, 6),
        threshold=lm.card.threshold,
        decision=_decision(proba, lm.card.threshold),
        latencyMs=round(latency_ms, 2),
        loadState=load_state,
        scaled=lm.scaler is not None,
        session=session_info,
        featureNames=names,
        featureVector=[round(v, 6) for v in row],
    )


@router.post("/predict/batch", response_model=BatchPredictResponse)
async def predict_batch(
    body: BatchPredictRequest,
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
) -> BatchPredictResponse:
    session_id = x_session_id
    model_id, session_id = _resolve_model(body.model_id, session_id)

    try:
        lm = manager.get(model_id)
    except RegistryError as exc:
        raise HTTPException(http.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(http.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    try:
        X = rows_for_batch(body.inputs, lm.encoders, lm.card.feature_schema)
    except FeatureError as exc:
        raise HTTPException(http.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    t0 = time.perf_counter()
    probas = manager.predict_proba_batch(model_id, X)
    latency_ms = (time.perf_counter() - t0) * 1000

    session_info: SessionInfo | None = None
    if session_id:
        s = sessions.record_prediction(session_id, model_id)
        session_info = sessions.to_info(s)

    return BatchPredictResponse(
        modelId=lm.card.id,
        modelName=lm.card.name,
        modelVersion=lm.card.version,
        framework=lm.card.framework,
        threshold=lm.card.threshold,
        latencyMs=round(latency_ms, 2),
        loadState="warm",
        results=[{"pitProbability": round(p, 6), "decision": _decision(p, lm.card.threshold)} for p in probas],
        session=session_info,
    )
