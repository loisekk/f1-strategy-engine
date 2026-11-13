"""Session registry — binds a browser session to one model.

* The frontend generates a session id (UUID) once and keeps it in
  localStorage, so the binding survives page reloads — "the model stays
  active throughout the session".
* `bind()` PRE-WARMS the model: the artifact is loaded the moment the user
  selects it, so the first prediction is already warm.
* Sessions are in-memory. After a backend restart the frontend transparently
  re-binds (404 from GET /sessions/{id} triggers POST /sessions again) — no
  user-visible failure.
* Sessions are garbage-collected after ML_SESSION_IDLE_TTL_SECONDS (24h).
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field

from ..core.schemas import SessionInfo
from .config import settings
from .manager import ModelManager, manager as default_manager
from .registry import ModelStore, store as default_store, utc_now


@dataclass
class Session:
    id: str
    model_id: str
    created_at: float = field(default_factory=time.time)
    last_used: float = field(default_factory=time.time)
    predictions: int = 0

    def info(self, warm: bool) -> SessionInfo:
        return SessionInfo(
            id=self.id,
            modelId=self.model_id,
            createdAt=utc_now(),  # coarse display timestamp
            lastUsed=utc_now(),
            predictions=self.predictions,
            modelState="warm" if warm else "cold",
        )


class SessionRegistry:
    def __init__(
        self,
        manager: ModelManager | None = None,
        store: ModelStore | None = None,
    ):
        self.manager = manager or default_manager
        self.store = store or default_store
        self._sessions: dict[str, Session] = {}
        self._lock = threading.RLock()

    @staticmethod
    def new_id() -> str:
        return uuid.uuid4().hex

    def bind(self, session_id: str | None, model_id: str) -> Session:
        """Create or rebind a session. Validates the model exists and
        pre-warms it (loads into the manager cache)."""
        # validate + pre-warm BEFORE binding (raises if the model is unknown)
        self.manager.get(model_id)

        with self._lock:
            sid = session_id or self.new_id()
            existing = self._sessions.get(sid)
            if existing is None:
                existing = Session(id=sid, model_id=model_id)
                self._sessions[sid] = existing
            else:
                existing.model_id = model_id
            existing.last_used = time.time()
            return existing

    def get(self, session_id: str) -> Session:
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None:
                raise KeyError(session_id)
            return s

    def touch(self, session_id: str, model_id: str | None = None) -> Session:
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None:
                raise KeyError(session_id)
            if model_id:
                s.model_id = model_id
            s.last_used = time.time()
            return s

    def record_prediction(self, session_id: str, model_id: str) -> Session:
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None:
                # stateless clients that send session ids without binding first
                s = Session(id=session_id, model_id=model_id)
                self._sessions[session_id] = s
            s.model_id = model_id
            s.predictions += 1
            s.last_used = time.time()
            return s

    def unbind(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    def bound_models(self) -> set[str]:
        with self._lock:
            return {s.model_id for s in self._sessions.values()}

    def list(self) -> list[Session]:
        with self._lock:
            return list(self._sessions.values())

    def active_count(self) -> int:
        with self._lock:
            return len(self._sessions)

    def sweep_stale(self) -> int:
        cutoff = time.time() - settings.session_idle_ttl_seconds
        removed = 0
        with self._lock:
            for sid in list(self._sessions.keys()):
                if self._sessions[sid].last_used < cutoff:
                    self._sessions.pop(sid)
                    removed += 1
        return removed

    def to_info(self, s: Session) -> SessionInfo:
        return s.info(self.manager.is_warm(s.model_id))


# module-level singleton
sessions = SessionRegistry()
