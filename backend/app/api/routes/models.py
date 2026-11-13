"""Model registry endpoints — list / detail / register (upload) / promote /
archive / delete / reload.

Registration is the safe path for incoming retrained models:
  1. artifacts land in a staging dir
  2. they are validated (load + smoke prediction + sha256)
  3. only then do they move atomically into model_store/artifacts/<id>/
  4. the manifest gains a CANDIDATE entry — the champion is untouched
Promotion is a separate, explicit step (and fully reversible).
"""

from __future__ import annotations

import shutil
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi import status as http

from ...core.config import settings
from ...core.manager import manager
from ...core.registry import RegistryError, make_model_id, store
from ...core.schemas import (
    ModelCard,
    ModelWithRuntime,
    ModelsListResponse,
    RegisterMeta,
    RegisterResult,
    SmokeTest,
)
from ...core.sessions import sessions
from ...core.validator import ValidationError, validate_registration
from ..deps import require_api_key

router = APIRouter(prefix="/models", tags=["registry"])


@router.get("", response_model=ModelsListResponse)
async def list_models() -> ModelsListResponse:
    cards = store.list_cards()
    order = {"champion": 0, "candidate": 1, "archived": 2}
    cards.sort(key=lambda c: (order.get(c.status, 9), c.registered_at), reverse=False)
    return ModelsListResponse(
        models=[ModelWithRuntime(card=c, runtime=manager.runtime_of(c)) for c in cards],
        champion=store.champion_id(),
        total_predictions=manager.total_predictions,
    )


@router.get("/{model_id}", response_model=ModelWithRuntime)
async def get_model(model_id: str) -> ModelWithRuntime:
    try:
        card = store.get_card(model_id)
    except RegistryError as exc:
        raise HTTPException(http.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ModelWithRuntime(card=card, runtime=manager.runtime_of(card))


@router.post(
    "/register",
    response_model=RegisterResult,
    status_code=http.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
async def register_model(
    model_file: Annotated[UploadFile, File(description="Model artifact (.json/.txt/.pkl/.joblib/.ubj)")],
    meta: Annotated[str, Form(description="JSON RegisterMeta")],
    scaler_file: Annotated[UploadFile | None, File(description="Optional fitted scaler (.pkl/.joblib)")] = None,
    encoders_file: Annotated[UploadFile | None, File(description="Optional encodings.json")] = None,
) -> RegisterResult:
    import json as _json

    try:
        meta_obj = RegisterMeta(**_json.loads(meta))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            http.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"'meta' form field is not valid RegisterMeta JSON: {exc}",
        ) from exc

    max_bytes = settings.max_upload_mb * 1024 * 1024
    staging = store.new_staging_dir()
    try:
        # ---- save uploads to staging with size guards ----
        def _save(upload: UploadFile, filename: str) -> None:
            dest = staging / filename
            size = 0
            with open(dest, "wb") as out:
                while chunk := upload.file.read(1 << 20):
                    size += len(chunk)
                    if size > max_bytes:
                        raise HTTPException(
                            http.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"Upload exceeds ML_MAX_UPLOAD_MB={settings.max_upload_mb}.",
                        )
                    out.write(chunk)

        model_filename = "model" + _safe_ext(model_file.filename, "model")
        _save(model_file, model_filename)

        scaler_filename: str | None = None
        if scaler_file is not None and scaler_file.filename:
            scaler_filename = "scaler" + _safe_ext(scaler_file.filename, "scaler")
            _save(scaler_file, scaler_filename)

        encoders_filename: str | None = None
        if encoders_file is not None and encoders_file.filename:
            encoders_filename = "encodings.json"
            _save(encoders_file, encoders_filename)

        # ---- validate (load + smoke prediction) ----
        feature_schema = meta_obj.feature_schema or []
        try:
            report = validate_registration(
                staging / model_filename,
                staging / scaler_filename if scaler_filename else None,
                staging / encoders_filename if encoders_filename else None,
                framework=meta_obj.framework,
                allowed_model_ext=settings.allowed_model_extensions,
                allowed_scaler_ext=settings.allowed_scaler_extensions,
                feature_schema=feature_schema,
            )
        except ValidationError as exc:
            raise HTTPException(http.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

        # ---- commit ----
        card = ModelCard(
            id=make_model_id(meta_obj.name, meta_obj.version),
            name=meta_obj.name,
            framework=report["framework"],
            version=meta_obj.version,
            status="candidate",
            task=meta_obj.task,
            threshold=meta_obj.threshold,
            artifact=model_filename,
            scaler=scaler_filename,
            encoders=encoders_filename,
            feature_schema=report["feature_names"],
            metrics=meta_obj.metrics,
            notes=meta_obj.notes,
            sha256=report["sha256"],
            size_bytes=(staging / model_filename).stat().st_size,
        )
        store.register(
            staging_dir=staging,
            model_filename=model_filename,
            scaler_filename=scaler_filename,
            encoders_filename=encoders_filename,
            card=card,
        )
        return RegisterResult(
            card=card,
            smoke_test=SmokeTest(**report["smoke"]),
            message=(
                f"Registered '{card.id}' as CANDIDATE. Validate it in the UI, then "
                f"POST /api/v1/models/{card.id}/promote to make it champion."
            ),
        )
    except HTTPException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    except RegistryError as exc:
        shutil.rmtree(staging, ignore_errors=True)
        raise HTTPException(http.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        shutil.rmtree(staging, ignore_errors=True)
        raise HTTPException(http.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Registration failed: {exc}") from exc


def _safe_ext(filename: str | None, kind: str) -> str:
    """Keep the original extension (validated later), strip everything else."""
    from pathlib import PurePosixPath

    if not filename:
        raise HTTPException(http.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{kind} file has no name.")
    ext = PurePosixPath(filename).suffix.lower()
    if not ext or len(ext) > 6:
        raise HTTPException(
            http.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{kind} file must have a normal extension (.json/.txt/.pkl/.joblib/.ubj).",
        )
    return ext


@router.post("/{model_id}/promote", response_model=ModelWithRuntime, dependencies=[Depends(require_api_key)])
async def promote_model(model_id: str) -> ModelWithRuntime:
    """Promote a candidate (or archived — rollback) to champion. The previous
    champion is archived, not deleted; warm sessions continue uninterrupted."""
    try:
        card, _previous = store.promote(model_id)
    except RegistryError as exc:
        raise HTTPException(http.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ModelWithRuntime(card=card, runtime=manager.runtime_of(card))


@router.post("/{model_id}/archive", response_model=ModelWithRuntime, dependencies=[Depends(require_api_key)])
async def archive_model(model_id: str) -> ModelWithRuntime:
    try:
        card = store.set_status(model_id, "archived")
    except RegistryError as exc:
        raise HTTPException(http.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ModelWithRuntime(card=card, runtime=manager.runtime_of(card))


@router.delete("/{model_id}", status_code=http.HTTP_204_NO_CONTENT, dependencies=[Depends(require_api_key)])
async def delete_model(model_id: str) -> None:
    try:
        store.delete(model_id, bound_models=sessions.bound_models())
    except RegistryError as exc:
        raise HTTPException(http.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{model_id}/reload", response_model=ModelWithRuntime, dependencies=[Depends(require_api_key)])
async def reload_model(model_id: str) -> ModelWithRuntime:
    """Force a cold reload of the artifact (dev tool — e.g. after manually
    replacing files on disk)."""
    try:
        manager.get(model_id, reload=True)
        card = store.get_card(model_id)
    except (RegistryError, FileNotFoundError) as exc:
        raise HTTPException(http.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ModelWithRuntime(card=card, runtime=manager.runtime_of(card))
