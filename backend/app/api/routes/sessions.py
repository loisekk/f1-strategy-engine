"""Session endpoints — bind a browser session to one model (pre-warmed)."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, status as http

from ...core.registry import RegistryError, store
from ...core.schemas import SessionCreateRequest, SessionInfo, SessionListResponse
from ...core.sessions import sessions

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionInfo, status_code=http.HTTP_201_CREATED)
async def create_session(
    body: SessionCreateRequest,
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
) -> SessionInfo:
    """Create or rebind a session. The bound model is loaded (pre-warmed)
    immediately and stays resident for the session's lifetime."""
    sid = body.session_id or x_session_id
    try:
        s = sessions.bind(sid, body.model_id)
    except RegistryError as exc:
        raise HTTPException(http.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(http.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return sessions.to_info(s)


@router.get("", response_model=SessionListResponse)
async def list_sessions() -> SessionListResponse:
    active = [sessions.to_info(s) for s in sessions.list()]
    return SessionListResponse(
        sessions=sorted(active, key=lambda i: i.last_used, reverse=True),
        active_models=sorted(sessions.bound_models()),
    )


@router.get("/{session_id}", response_model=SessionInfo)
async def get_session(session_id: str) -> SessionInfo:
    try:
        s = sessions.get(session_id)
    except KeyError:
        raise HTTPException(
            http.HTTP_404_NOT_FOUND,
            detail="Unknown session — the backend restarted or the session "
            "expired. Re-bind with POST /api/v1/sessions.",
        ) from None
    return sessions.to_info(s)


@router.delete("/{session_id}", status_code=http.HTTP_204_NO_CONTENT)
async def unbind_session(session_id: str) -> None:
    sessions.unbind(session_id)
