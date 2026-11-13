"""POST /api/v1/strategy/simulate — scenario comparison with REAL model
scoring (per-lap P(box) through the session's warm model)."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException

from ...core.manager import manager
from ...core.registry import RegistryError, store
from ...core.schemas import StrategySimulateRequest, StrategySimulateResponse
from ...core.sessions import sessions
from ...api.routes.predict import _resolve_model
from ...services.strategy_sim import StrategyError, simulate

router = APIRouter(prefix="/strategy", tags=["strategy"])


@router.post("/simulate", response_model=StrategySimulateResponse)
async def strategy_simulate(
    body: StrategySimulateRequest,
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
) -> StrategySimulateResponse:
    session_id = x_session_id
    model_id, _ = _resolve_model(body.model_id, session_id)

    if body.use_model:
        try:
            manager.get(model_id)
        except (RegistryError, FileNotFoundError) as exc:
            raise HTTPException(404, detail=str(exc)) from exc

    try:
        results, model_ctx = simulate(body, manager, model_id if body.use_model else None)
    except StrategyError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    except RegistryError as exc:
        raise HTTPException(404, detail=str(exc)) from exc

    curves_pit_loss = None
    try:
        from ...services.strategy_sim import load_curves

        curves_pit_loss = float(load_curves().get("pitLossSeconds", 19.9))
    except Exception:  # noqa: BLE001
        curves_pit_loss = 19.9

    pit_loss = body.pit_loss_s if body.pit_loss_s is not None else curves_pit_loss

    return StrategySimulateResponse(
        modelId=model_ctx["id"] if model_ctx else None,
        modelName=model_ctx["name"] if model_ctx else None,
        modelVersion=model_ctx["version"] if model_ctx else None,
        modelScored=model_ctx is not None,
        pitLossS=pit_loss,
        scenarios=results,
    )
