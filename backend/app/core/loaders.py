"""Framework loaders — normalise LightGBM / XGBoost / sklearn artifacts behind
one `predict_proba(X) -> np.ndarray` interface.

Supported artifact formats
--------------------------
lightgbm : Booster model file, `.json` or `.txt` (Booster.save_model). This is
           exactly the format of the original project's `f1_pitstop_model.json`.
xgboost  : Booster model file, `.json` or `.ubj` (get_booster().save_model()).
sklearn  : pickled / joblib-dumped estimator exposing `predict_proba`
           (pickle and joblib both supported).

Security note: `.pkl` / `.joblib` deserialisation executes arbitrary code by
design. Only register artifacts you trained yourself or fully trust, and set
`ML_API_KEY` before exposing the register endpoint beyond localhost.
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Any, Protocol

import numpy as np


class PredictProba(Protocol):
    def predict_proba(self, X: np.ndarray) -> np.ndarray: ...


class NormalizedModel:
    """Uniform wrapper: `predict_proba(X) -> np.ndarray shape (n,)` of the
    positive-class probability."""

    def __init__(self, framework: str, predictor: Any, feature_names: list[str]):
        self.framework = framework
        self.predictor = predictor
        self.feature_names = feature_names

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        X = np.atleast_2d(np.asarray(X, dtype=np.float64))
        if self.framework == "lightgbm":
            import lightgbm as lgb

            out = self.predictor.predict(X)
            # Booster.predict on a binary objective returns P(class=1) directly.
            out = np.asarray(out, dtype=np.float64)
            return out.reshape(-1)
        if self.framework == "xgboost":
            import xgboost as xgb

            d = xgb.DMatrix(X)
            out = np.asarray(self.predictor.predict(d), dtype=np.float64)
            return out.reshape(-1)
        # sklearn-style estimator
        proba = self.predictor.predict_proba(X)
        proba = np.asarray(proba, dtype=np.float64)
        if proba.ndim == 2 and proba.shape[1] == 2:
            return proba[:, 1].reshape(-1)
        if proba.ndim == 2 and proba.shape[1] == 1:
            return proba[:, 0].reshape(-1)
        return proba.reshape(-1)


def sniff_framework(path: Path, declared: str = "auto") -> str:
    """Detect the artifact framework. `declared` overrides sniffing."""
    if declared != "auto":
        allowed = {"lightgbm", "xgboost", "sklearn"}
        if declared not in allowed:
            raise ValueError(f"Unknown framework '{declared}'. Choose from {sorted(allowed)} or 'auto'.")
        return declared

    suffix = path.suffix.lower()
    if suffix in (".pkl", ".joblib"):
        return "sklearn"
    if suffix == ".txt":
        return "lightgbm"
    if suffix in (".json", ".ubj"):
        if suffix == ".ubj":
            return "xgboost"
        try:
            with open(path, "r", encoding="utf-8") as f:
                head = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("File has .json extension but is not valid JSON — cannot detect framework.")
        if not isinstance(head, dict):
            raise ValueError("Unexpected JSON structure — expected a model file.")
        if "learner" in head:
            return "xgboost"
        if "tree_info" in head or "feature_names" in head or "feature_infos" in head:
            return "lightgbm"
        raise ValueError(
            "JSON model detected but framework is ambiguous. Re-upload with "
            "framework='lightgbm' or 'xgboost' specified."
        )
    raise ValueError(f"Unsupported model extension '{suffix}'.")


def _load_pickle_or_joblib(path: Path):
    """Load a pickle/joblib file regardless of which dumper produced it.

    joblib.dump files (very common for sklearn artifacts saved as .pkl) cannot
    be read by pickle.load, but joblib.load reads BOTH formats — so we try
    joblib first and fall back to plain pickle."""
    try:
        import joblib

        return joblib.load(str(path))
    except Exception:  # noqa: BLE001 — plain-pickle fallback
        with open(path, "rb") as f:
            return pickle.load(f)


def load_model(path: Path, framework: str = "auto") -> NormalizedModel:
    """Load a model artifact and return the normalised wrapper."""
    framework = sniff_framework(path, framework)

    if framework == "lightgbm":
        import lightgbm as lgb

        booster = lgb.Booster(model_file=str(path))
        names = [n for n in (booster.feature_name() or []) if n]
        return NormalizedModel("lightgbm", booster, names)

    if framework == "xgboost":
        import xgboost as xgb

        booster = xgb.Booster()
        booster.load_model(str(path))
        names = [n for n in (booster.feature_names or []) if n]
        return NormalizedModel("xgboost", booster, names)

    # sklearn-style pickle / joblib
    obj = _load_pickle_or_joblib(path)

    if not hasattr(obj, "predict_proba"):
        raise ValueError(
            "Pickle loaded, but the object has no predict_proba() — is this a "
            "scaler or a regressor rather than a classifier?"
        )
    names: list[str] = []
    try:
        if hasattr(obj, "feature_names_in_"):
            names = [str(n) for n in obj.feature_names_in_]
    except Exception:  # pragma: no cover - defensive
        names = []
    return NormalizedModel("sklearn", obj, names)


def load_scaler(path: Path):
    """Load a fitted scaler (StandardScaler etc.) — pickle or joblib format,
    any of the allowed extensions."""
    obj = _load_pickle_or_joblib(path)
    if not hasattr(obj, "transform"):
        raise ValueError("Scaler loaded, but the object has no transform() method.")
    if not hasattr(obj, "n_features_in_"):
        raise ValueError("Scaler loaded, but it does not look fitted (no n_features_in_).")
    return obj


def load_encoders(path: Path) -> dict:
    """Load encodings.json: {"drivers": [...], "compounds": [...]}."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or "drivers" not in data or "compounds" not in data:
        raise ValueError("encoders JSON must contain 'drivers' and 'compounds' lists.")
    return data
