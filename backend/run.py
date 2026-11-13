#!/usr/bin/env python3
"""Development entrypoint: python run.py (reads ML_* env vars / .env)."""

import uvicorn

from app.core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,  # flip to True for hot reload during backend development
        log_level="info",
    )
