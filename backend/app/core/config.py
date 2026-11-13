"""Runtime configuration — everything is environment-overridable.

Copy backend/.env.example to backend/.env and adjust. Settings are read once
at startup; a restart reloads them.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        env_prefix="ML_",
        extra="ignore",
    )

    # ---- serving ----
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001"

    # ---- model store ----
    store_dir: str = str(BACKEND_DIR / "model_store")

    # ---- warm model cache (session-persistent loading) ----
    # A model stays loaded for the whole session. It is NEVER unloaded after a
    # prediction — only when it has been idle longer than `idle_ttl_seconds`
    # (default 1 hour) or when more than `max_loaded_models` distinct models
    # are requested simultaneously (least-recently-used eviction).
    max_loaded_models: int = 8
    idle_ttl_seconds: int = 3600
    sweep_interval_seconds: int = 60

    # ---- sessions ----
    session_idle_ttl_seconds: int = 86400  # unbind sessions idle for 24h

    # ---- security ----
    # Optional shared secret. When set, every mutating endpoint (register /
    # promote / archive / delete / reload) requires header `X-API-Key`.
    # Prediction, session and health endpoints stay open for the UI.
    api_key: str = ""

    # ---- upload hardening ----
    max_upload_mb: int = 256
    allowed_model_extensions: str = ".json,.txt,.pkl,.joblib,.ubj"
    allowed_scaler_extensions: str = ".pkl,.joblib,.json"

    # ---- data ----
    tyre_curves_path: str = str(BACKEND_DIR / "data" / "tyre_curves.json")
    default_encoders_path: str = str(BACKEND_DIR / "data" / "encodings.json")


settings = Settings()


def cors_origin_list() -> list[str]:
    return [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
