"""ModelManager — session-persistent WARM model loading.

This is the heart of the serving contract the frontend relies on:

    The user selects a model once per session. From that moment the model is
    loaded into memory and STAYS ACTIVE for the whole session. A prediction
    never loads-and-unloads — after the first call the artifact is warm and
    inference is a pure in-memory computation (sub-millisecond for GBDT models
    of this size).

Eviction policy (explicit, deliberate):
* `ML_IDLE_TTL_SECONDS` (default 3600): a model unused for a full hour is
  unloaded by the background sweeper. This is the ONLY automatic unload.
* `ML_MAX_LOADED_MODELS` (default 8): if more distinct models are requested,
  the least-recently-used one is evicted. Sessions touching their model keep
  it at the front of the LRU queue, so an active session never loses its model.
* Promotions never unload anything: a promoted champion is loaded on next use;
  sessions bound to the old champion continue on the warm copy.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..core.schemas import ModelCard, ModelRuntime
from .config import settings
from .loaders import load_encoders, load_model, load_scaler
from .registry import ModelStore, store as default_store


@dataclass
class LoadedModel:
    card: ModelCard
    model: Any                      # NormalizedModel
    scaler: Any | None = None
    encoders: dict | None = None
    loaded_at: float = field(default_factory=time.time)
    last_used: float = field(default_factory=time.time)
    loads: int = 1
    predictions: int = 0
    load_ms: float = 0.0

    @property
    def artifact_dir(self) -> Path:
        raise NotImplementedError  # set by manager


class ModelManager:
    def __init__(self, store: ModelStore | None = None):
        self.store = store or default_store
        self._cache: OrderedDict[str, LoadedModel] = OrderedDict()
        self._lock = threading.RLock()
        self.total_predictions = 0

    # -------------------------------------------------------------- loading --

    def get(self, model_id: str, *, reload: bool = False) -> LoadedModel:
        """Return the warm model, loading it exactly once. Subsequent calls
        are pure cache hits — the model stays resident."""
        with self._lock:
            if reload and model_id in self._cache:
                self._evict(model_id)

            lm = self._cache.get(model_id)
            if lm is None:
                lm = self._load(model_id)
                self._cache[model_id] = lm
                self._evict_lru()
            else:
                self._cache.move_to_end(model_id)  # LRU touch
            lm.last_used = time.time()
            return lm

    def _load(self, model_id: str) -> LoadedModel:
        card = self.store.get_card(model_id)
        adir = self.store.artifact_dir(model_id)
        model_path = adir / card.artifact
        if not model_path.exists():
            raise FileNotFoundError(
                f"Artifact missing for '{model_id}': {model_path}. The store is "
                "inconsistent — re-register the model."
            )
        t0 = time.perf_counter()
        model = load_model(model_path, card.framework)
        load_ms = (time.perf_counter() - t0) * 1000

        scaler = None
        if card.scaler:
            scaler = load_scaler(adir / card.scaler)

        encoders = None
        if card.encoders:
            encoders = load_encoders(adir / card.encoders)

        return LoadedModel(
            card=card,
            model=model,
            scaler=scaler,
            encoders=encoders,
            load_ms=load_ms,
        )

    # ------------------------------------------------------------ inference --

    def predict_proba(self, model_id: str, X) -> tuple[float, str, int]:
        """Warm inference. Returns (probability, load_state, predictions_count).
        `load_state` is 'cold-loaded' only for the very first call of a model."""
        lm = self.get(model_id)
        with self._lock:
            was_first = lm.predictions == 0
            lm.predictions += 1
            self.total_predictions += 1
        if lm.scaler is not None:
            proba = lm.model.predict_proba(lm.scaler.transform(X))
        else:
            proba = lm.model.predict_proba(X)
        return float(proba[0]), ("cold-loaded" if was_first else "warm"), lm.predictions

    def predict_proba_batch(self, model_id: str, X) -> list[float]:
        lm = self.get(model_id)
        with self._lock:
            lm.predictions += 1
            self.total_predictions += 1
        if lm.scaler is not None:
            proba = lm.model.predict_proba(lm.scaler.transform(X))
        else:
            proba = lm.model.predict_proba(X)
        return [float(p) for p in proba]

    # ------------------------------------------------------------- lifecycle --

    def _evict(self, model_id: str) -> None:
        self._cache.pop(model_id, None)

    def _evict_lru(self) -> None:
        while len(self._cache) > max(1, settings.max_loaded_models):
            self._cache.popitem(last=False)  # evict least-recently-used

    def sweep_idle(self) -> list[str]:
        """Unload models idle beyond the TTL. Called by the background task.
        NOTE: this never touches models used within the TTL — active sessions
        are protected by the LRU touch in `get()`."""
        now = time.time()
        evicted: list[str] = []
        with self._lock:
            for mid in list(self._cache.keys()):
                lm = self._cache[mid]
                if now - lm.last_used > settings.idle_ttl_seconds:
                    evicted.append(mid)
                    self._evict(mid)
        return evicted

    def is_warm(self, model_id: str) -> bool:
        with self._lock:
            return model_id in self._cache

    def runtime_of(self, card: ModelCard) -> ModelRuntime:
        with self._lock:
            lm = self._cache.get(card.id)
            if lm is None:
                return ModelRuntime(warm=False)
            return ModelRuntime(
                warm=True,
                loads=lm.loads,
                predictions=lm.predictions,
                load_ms=round(lm.load_ms, 1),
                last_used_seconds_ago=round(max(0.0, time.time() - lm.last_used), 1),
                loaded_at=datetime.fromtimestamp(lm.loaded_at, tz=timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
            )

    def stats(self) -> dict:
        with self._lock:
            return {
                "loaded": len(self._cache),
                "total_predictions": self.total_predictions,
                "warm_models": list(self._cache.keys()),
            }


# module-level singleton shared by all routes
manager = ModelManager()
