"""FastAPI application factory.

Run:  python run.py            (dev, reload)
      uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .api.routes import health, models, predict, sessions, strategy
from .core.config import cors_origin_list, settings
from .core.manager import manager
from .core.sessions import sessions as session_registry

log = logging.getLogger("f1.api")


async def _sweeper() -> None:
    """Background task: unload models idle > ML_IDLE_TTL_SECONDS and unbind
    sessions idle > ML_SESSION_IDLE_TTL_SECONDS. Never touches active ones."""
    while True:
        await asyncio.sleep(settings.sweep_interval_seconds)
        try:
            evicted = manager.sweep_idle()
            stale = session_registry.sweep_stale()
            if evicted or stale:
                log.info(
                    "sweeper: unloaded %d idle model(s), unbound %d stale session(s)",
                    len(evicted),
                    stale,
                )
        except Exception:  # noqa: BLE001 — the sweeper must never die
            log.exception("sweeper iteration failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_sweeper())
    log.info(
        "ML API up — store=%s, warm cache ≤%d model(s), idle TTL %ss",
        settings.store_dir,
        settings.max_loaded_models,
        settings.idle_ttl_seconds,
    )
    try:
        yield
    finally:
        task.cancel()


def create_app() -> FastAPI:
    app = FastAPI(
        title="F1 Strategy Engine — ML Serving API",
        version=__version__,
        description=(
            "Model registry, session-persistent warm inference and strategy "
            "simulation for the F1 Strategy Engine frontend. See "
            "MERGE_GUIDE.md in the repository root."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origin_list(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    prefix = "/api/v1"
    app.include_router(health.router, prefix=prefix)
    app.include_router(models.router, prefix=prefix)
    app.include_router(sessions.router, prefix=prefix)
    app.include_router(predict.router, prefix=prefix)
    app.include_router(strategy.router, prefix=prefix)

    @app.get("/")
    async def root() -> dict:
        return {
            "service": "F1 Strategy Engine — ML Serving API",
            "version": __version__,
            "docs": "/docs",
            "api": "/api/v1",
        }

    return app


app = create_app()
