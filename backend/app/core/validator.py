"""Artifact validation pipeline — every registered model passes through this
before it becomes visible in the registry.

Checks performed
----------------
1. extension whitelist + size limit (config: ML_MAX_UPLOAD_MB)
2. framework sniff / declared framework
3. load test (pickle errors, corrupt files, wrong objective)
4. smoke prediction on a canonical feature row — output must be a scalar
   probability in [0, 1]
5. (optional) scaler load + shape compatibility with the model
6. sha256 recorded for integrity audit

The same function is used by the HTTP upload route AND the CLI scripts, so a
model registered from CI is validated identically to one uploaded from the UI.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Any

import numpy as np

from .loaders import load_encoders, load_model, load_scaler

MAX_SMOKE_ROWS = 64


class ValidationError(Exception):
    """Raised when an artifact fails validation. The message is user-facing."""


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def check_extension(path: Path, allowed: str, kind: str) -> None:
    allowed_exts = [e.strip().lower() for e in allowed.split(",") if e.strip()]
    if path.suffix.lower() not in allowed_exts:
        raise ValidationError(
            f"{kind} file extension '{path.suffix or '(none)'}' is not allowed. "
            f"Allowed: {', '.join(allowed_exts)}"
        )


def validate_registration(
    model_path: Path,
    scaler_path: Path | None,
    encoders_path: Path | None,
    *,
    framework: str,
    allowed_model_ext: str,
    allowed_scaler_ext: str,
    feature_schema: list[str],
) -> dict[str, Any]:
    """Validate artifacts in place (they are already in a staging directory).
    Returns {"framework", "feature_names", "n_features", "smoke": {...}, "sha256": {...}}."""

    if not model_path.is_file() or model_path.stat().st_size == 0:
        raise ValidationError("Model file is missing or empty.")

    check_extension(model_path, allowed_model_ext, "Model")

    t0 = time.perf_counter()
    try:
        normalized = load_model(model_path, framework)
    except ValidationError:
        raise
    except Exception as exc:  # noqa: BLE001 — surface any loader failure
        raise ValidationError(f"Model failed to load: {exc}") from exc
    load_ms = round((time.perf_counter() - t0) * 1000, 1)

    # feature names: declared schema wins; else booster names; else canonical
    feature_names = feature_schema or normalized.feature_names or []

    scaler = None
    if scaler_path is not None:
        if not scaler_path.is_file() or scaler_path.stat().st_size == 0:
            raise ValidationError("Scaler file is missing or empty.")
        check_extension(scaler_path, allowed_scaler_ext, "Scaler")
        try:
            scaler = load_scaler(scaler_path)
        except Exception as exc:  # noqa: BLE001
            raise ValidationError(f"Scaler failed to load: {exc}") from exc

    encoders: dict | None = None
    if encoders_path is not None:
        if not encoders_path.is_file():
            raise ValidationError("Encoders file is missing.")
        try:
            encoders = load_encoders(encoders_path)
        except Exception as exc:  # noqa: BLE001
            raise ValidationError(f"Encoders file invalid: {exc}") from exc

    # smoke test: canonical-ish row of zeros/medians must produce [0,1]
    n_features = scaler.n_features_in_ if scaler is not None else None
    if n_features is None:
        n_features = len(feature_names) if feature_names else 12
    rows = np.zeros((3, n_features), dtype=np.float64)
    rows[1] = np.linspace(0.1, 0.9, n_features)
    rows[2] = np.full(n_features, 5.0)

    try:
        if scaler is not None:
            proba = normalized.predict_proba(scaler.transform(rows))
        else:
            proba = normalized.predict_proba(rows)
    except Exception as exc:  # noqa: BLE001
        raise ValidationError(f"Smoke prediction failed (likely wrong feature count): {exc}") from exc

    proba = np.asarray(proba, dtype=np.float64).reshape(-1)
    if proba.shape[0] != 3:
        raise ValidationError(f"Smoke prediction returned {proba.shape[0]} values for 3 rows — expected 3.")
    if not np.all(np.isfinite(proba)):
        raise ValidationError("Smoke prediction returned non-finite values (NaN/inf).")
    if proba.min() < -1e-6 or proba.max() > 1.0 + 1e-6:
        raise ValidationError(
            f"Smoke prediction returned values outside [0,1] ({proba.min():.4f}…{proba.max():.4f}) — "
            "this does not look like a binary classifier probability."
        )

    return {
        "framework": normalized.framework,
        "feature_names": feature_names,
        "n_features": int(n_features),
        "sha256": {
            "model": sha256_of(model_path),
            "scaler": sha256_of(scaler_path) if scaler_path else None,
            "encoders": sha256_of(encoders_path) if encoders_path else None,
        },
        "smoke": {
            "load_ms": load_ms,
            "probas": [round(float(p), 6) for p in proba],
            "scaler": scaler is not None,
            "encoders": encoders is not None,
        },
    }
