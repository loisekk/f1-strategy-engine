"""GET /api/v1/health — liveness + serving stats. Used by the frontend to
flip the ML ENGINE chip between LIVE and OFFLINE."""

from __future__ import annotations

import time

from fastapi import APIRouter

from ... import __version__
from ...core.manager import manager
from ...core.registry import store
from ...core.schemas import HealthResponse
from ...core.sessions import sessions

router = APIRouter(tags=["system"])

_STARTED_AT = time.time()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    cards = store.list_cards()
    return HealthResponse(
        status="ok",
        version=__version__,
        uptimeSeconds=round(time.time() - _STARTED_AT, 1),
        modelsRegistered=len(cards),
        modelsLoaded=manager.stats()["loaded"],
        champion=store.champion_id(),
        sessionsActive=sessions.active_count(),
        predictionsServed=manager.total_predictions,
        storePath=str(store.dir),
    )
