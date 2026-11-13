"""Model registry — a filesystem-backed, atomically-updated manifest.

Layout
------
model_store/
├── registry.json                    # manifest: one entry per model version
└── artifacts/
    └── lightgbm-pitstop-1.0.0/      # immutable artifact directory
        ├── model.json               # (filename recorded in the card)
        ├── scaler.pkl               # optional
        └── encodings.json           # optional

Guarantees
----------
* Artifact directories are IMMUTABLE once registered — re-registering the same
  id is rejected; a new model means a new version id.
* registry.json is updated via write-to-temp + os.replace (atomic on POSIX).
* Promotion is a pure manifest operation: the previous champion becomes
  'archived', the target becomes 'champion'. Sessions already bound to the old
  champion keep serving from its (still-present) artifacts — zero downtime.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ..core.schemas import ModelCard, ModelStatus
from .config import settings

ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{1,79}$")

_lock = threading.RLock()


class RegistryError(Exception):
    """User-facing registry failure."""


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if not slug:
        raise RegistryError(f"Name '{name}' cannot be turned into a valid id.")
    return slug


def make_model_id(name: str, version: str) -> str:
    mid = f"{slugify(name)}-{version}"
    if not ID_PATTERN.match(mid):
        raise RegistryError(
            f"Derived model id '{mid}' is invalid. Use lowercase letters, digits, '.', '_', '-'."
        )
    return mid


class ModelStore:
    def __init__(self, store_dir: Path | None = None):
        self.dir = Path(store_dir or settings.store_dir)
        self.manifest = self.dir / "registry.json"
        self.artifacts = self.dir / "artifacts"
        self.staging = self.dir / ".staging"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.artifacts.mkdir(parents=True, exist_ok=True)
        self.staging.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------ manifest --

    def _read_manifest(self) -> dict:
        if not self.manifest.exists():
            return {"version": 1, "models": []}
        try:
            with open(self.manifest, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as exc:
            raise RegistryError(f"registry.json is corrupted: {exc}") from exc

    def _write_manifest(self, data: dict) -> None:
        """Atomic write: temp file in the same directory + os.replace."""
        tmp = self.dir / f".registry.{uuid.uuid4().hex[:8]}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.manifest)

    def list_cards(self) -> list[ModelCard]:
        with _lock:
            data = self._read_manifest()
        return [ModelCard(**c) for c in data.get("models", [])]

    def get_card(self, model_id: str) -> ModelCard:
        with _lock:
            for card in self.list_cards():
                if card.id == model_id:
                    return card
        raise RegistryError(
            f"Model '{model_id}' is not registered. Call GET /api/v1/models for the list."
        )

    def champion_id(self) -> str | None:
        for card in self.list_cards():
            if card.status == "champion":
                return card.id
        return None

    # ---------------------------------------------------------- operations --

    def artifact_dir(self, model_id: str) -> Path:
        return self.artifacts / model_id

    def new_staging_dir(self) -> Path:
        d = self.staging / uuid.uuid4().hex[:12]
        d.mkdir(parents=True, exist_ok=True)
        return d

    def register(
        self,
        *,
        staging_dir: Path,
        model_filename: str,
        scaler_filename: str | None,
        encoders_filename: str | None,
        card: ModelCard,
        promote: bool = False,
    ) -> ModelCard:
        """Move a validated staging directory into the store and append the
        card to the manifest. `card.id` must not already exist."""
        with _lock:
            if any(c.id == card.id for c in self.list_cards()):
                raise RegistryError(
                    f"Model id '{card.id}' already exists — bump the version "
                    "(e.g. 1.1.0) or delete the old entry after archiving."
                )
            target = self.artifact_dir(card.id)
            if target.exists():
                raise RegistryError(f"Artifact directory '{card.id}' already exists (corrupt store?).")
            os.replace(staging_dir, target)  # atomic move on the same filesystem

            card.registered_at = utc_now()
            data = self._read_manifest()
            if promote:
                for c in data["models"]:
                    if c.get("status") == "champion":
                        c["status"] = "archived"
                card.status = "champion"
            data["models"].append(card.model_dump())
            self._write_manifest(data)
            return card

    def set_status(self, model_id: str, status: ModelStatus) -> ModelCard:
        with _lock:
            data = self._read_manifest()
            found = None
            for c in data["models"]:
                if c["id"] == model_id:
                    found = c
                    break
            if found is None:
                raise RegistryError(f"Model '{model_id}' is not registered.")
            found["status"] = status
            self._write_manifest(data)
            return ModelCard(**found)

    def promote(self, model_id: str) -> tuple[ModelCard, ModelCard | None]:
        """Promote to champion; returns (new_champion, previous_champion)."""
        with _lock:
            data = self._read_manifest()
            target = next((c for c in data["models"] if c["id"] == model_id), None)
            if target is None:
                raise RegistryError(f"Model '{model_id}' is not registered.")
            if target["status"] == "archived":
                # allow rollback: archived -> champion is an explicit decision
                pass
            previous = next((c for c in data["models"] if c.get("status") == "champion"), None)
            if previous is not None and previous["id"] != model_id:
                previous["status"] = "archived"
            target["status"] = "champion"
            self._write_manifest(data)
            return ModelCard(**target), (ModelCard(**previous) if previous else None)

    def delete(self, model_id: str, *, bound_models: set[str] | None = None) -> None:
        """Delete an ARCHIVED model. Refuses while any session is bound to it."""
        with _lock:
            card = self.get_card(model_id)
            if card.status != "archived":
                raise RegistryError(
                    "Only archived models can be deleted. Archive it first "
                    f"(POST /api/v1/models/{model_id}/archive)."
                )
            if bound_models and model_id in bound_models:
                raise RegistryError(
                    f"Sessions are still bound to '{model_id}'. Wait for them to "
                    "switch models (or restart the backend) before deleting."
                )
            data = self._read_manifest()
            data["models"] = [c for c in data["models"] if c["id"] != model_id]
            self._write_manifest(data)
        # remove artifacts after the manifest no longer references them
        adir = self.artifact_dir(model_id)
        if adir.exists():
            for p in sorted(adir.rglob("*"), reverse=True):
                if p.is_file():
                    p.unlink()
            adir.rmdir()


# module-level singleton (uvicorn workers = 1 process; threading-safe via locks)
store = ModelStore()
