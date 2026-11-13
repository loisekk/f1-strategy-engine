"""Shared FastAPI dependencies."""

from __future__ import annotations

from fastapi import Header, HTTPException, status

from ..core.config import settings


async def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """Protects mutating endpoints. Active only when ML_API_KEY is set."""
    if settings.api_key:
        if not x_api_key or x_api_key != settings.api_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing X-API-Key header.",
            )
