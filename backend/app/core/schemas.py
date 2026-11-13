"""Pydantic v2 schemas — the API contract shared with the frontend.

These shapes are mirrored 1:1 by `frontend/src/services/ml-api.ts`, so any
change here must be reflected there (see MERGE_GUIDE.md § contract).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

ModelStatus = Literal["champion", "candidate", "archived"]


class CamelModel(BaseModel):
    """snake_case Python fields ↔ camelCase JSON keys (frontend contract)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


# ---------------------------------------------------------------- models ----

class Sha256Info(CamelModel):
    model: str
    scaler: str | None = None
    encoders: str | None = None


class ModelCard(CamelModel):
    """Immutable registry entry for one model version."""

    id: str                                   # e.g. "lightgbm-pitstop-1.0.0"
    name: str = ""                            # display name, e.g. "LightGBM Pit-Stop"
    framework: str                            # lightgbm | xgboost | sklearn
    version: str = "1.0.0"
    status: ModelStatus = "candidate"
    task: str = "pitstop_binary_classification"
    threshold: float = 0.5                    # decision threshold from training
    artifact: str = "model.json"              # filename inside the artifact dir
    scaler: str | None = None                 # optional scaler filename
    encoders: str | None = None               # optional encodings.json filename
    feature_schema: list[str] = Field(default_factory=list)
    metrics: dict[str, float] = Field(default_factory=dict)
    notes: str | None = None
    registered_at: str = ""
    sha256: Sha256Info | None = None
    size_bytes: int = 0


class ModelRuntime(CamelModel):
    """Live serving state of a model (from the warm ModelManager)."""

    warm: bool = False
    loads: int = 0
    predictions: int = 0
    load_ms: float | None = None
    last_used_seconds_ago: float | None = None
    loaded_at: str | None = None


class ModelWithRuntime(CamelModel):
    card: ModelCard
    runtime: ModelRuntime


class ModelsListResponse(CamelModel):
    models: list[ModelWithRuntime]
    champion: str | None = None
    total_predictions: int = 0


class SmokeTest(CamelModel):
    load_ms: float = 0.0
    probas: list[float] = Field(default_factory=list)
    scaler: bool = False
    encoders: bool = False


class RegisterMeta(CamelModel):
    """Metadata sent alongside an artifact upload (multipart `meta` field)."""

    name: str = Field(..., min_length=1, max_length=64)
    version: str = Field(default="1.0.0", pattern=r"^[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9]+)*$")
    framework: str = "auto"                    # auto | lightgbm | xgboost | sklearn
    threshold: float = 0.5
    notes: str | None = None
    task: str = "pitstop_binary_classification"
    feature_schema: list[str] | None = None   # defaults to the canonical 12 features
    metrics: dict[str, float] = Field(default_factory=dict)


class RegisterResult(CamelModel):
    card: ModelCard
    smoke_test: SmokeTest
    message: str


# -------------------------------------------------------------- sessions ----

class SessionCreateRequest(BaseModel):
    model_id: str = Field(..., alias="modelId")
    session_id: str | None = Field(default=None, alias="sessionId")

    model_config = {"populate_by_name": True}


class SessionInfo(BaseModel):
    id: str
    model_id: str = Field(alias="modelId")
    created_at: str = Field(alias="createdAt")
    last_used: str = Field(alias="lastUsed")
    predictions: int = 0
    model_state: Literal["warm", "cold"] = Field("warm", alias="modelState")

    model_config = {"populate_by_name": True}


class SessionListResponse(BaseModel):
    sessions: list[SessionInfo]
    active_models: list[str]


# -------------------------------------------------------------- predict -----

class PredictInputs(BaseModel):
    """Semantic race-state inputs. Derived features are computed server-side
    exactly like the training pipeline (see services/features.py); anything
    provided explicitly overrides the derivation."""

    driver: str | None = "VER"
    compound: str | None = "MEDIUM"
    lap_number: int = Field(30, ge=1, le=120, alias="lapNumber")
    total_laps: int = Field(57, ge=5, le=120, alias="totalLaps")
    stint: int = Field(2, ge=1, le=10)
    tyre_life: int = Field(15, ge=1, le=80, alias="tyreLife")
    position: int = Field(10, ge=1, le=24)
    lap_time_s: float = Field(93.0, gt=0, alias="lapTimeS")
    lap_time_delta: float = Field(0.15, alias="lapTimeDelta")
    cumulative_degradation: float | None = Field(None, alias="cumulativeDegradation")
    race_progress: float | None = Field(None, ge=0.0, le=1.0, alias="raceProgress")
    normalized_tyre_life: float | None = Field(None, ge=0.0, le=1.0, alias="normalizedTyreLife")
    position_change: float = Field(0.0, alias="positionChange")
    # raw overrides for encoded features (skip name-based encoding)
    driver_enc: float | None = Field(None, alias="driverEnc")
    compound_enc: float | None = Field(None, alias="compoundEnc")

    model_config = {"populate_by_name": True}


class PredictRequest(BaseModel):
    model_id: str | None = Field(None, alias="modelId")   # optional if a session is bound
    inputs: PredictInputs = Field(default_factory=PredictInputs)

    model_config = {"populate_by_name": True}


class PredictResponse(BaseModel):
    model_id: str = Field(alias="modelId")
    model_name: str = Field(alias="modelName")
    model_version: str = Field(alias="modelVersion")
    framework: str
    status: ModelStatus
    pit_probability: float = Field(alias="pitProbability")
    threshold: float
    decision: Literal["BOX", "WATCH", "STAY"]
    latency_ms: float = Field(alias="latencyMs")
    load_state: Literal["warm", "cold-loaded"] = Field("warm", alias="loadState")
    scaled: bool = False
    session: SessionInfo | None = None
    feature_names: list[str] = Field(default_factory=list, alias="featureNames")
    feature_vector: list[float] = Field(default_factory=list, alias="featureVector")

    model_config = {"populate_by_name": True}


class BatchPredictRequest(BaseModel):
    model_id: str | None = Field(None, alias="modelId")
    inputs: list[PredictInputs] = Field(..., min_length=1, max_length=2000)

    model_config = {"populate_by_name": True}


class BatchPredictItem(BaseModel):
    pit_probability: float = Field(alias="pitProbability")
    decision: Literal["BOX", "WATCH", "STAY"]

    model_config = {"populate_by_name": True}


class BatchPredictResponse(BaseModel):
    model_id: str = Field(alias="modelId")
    model_name: str = Field(alias="modelName")
    model_version: str = Field(alias="modelVersion")
    framework: str
    threshold: float
    latency_ms: float = Field(alias="latencyMs")
    load_state: str = Field(alias="loadState")
    results: list[BatchPredictItem]
    session: SessionInfo | None = None

    model_config = {"populate_by_name": True}


# ------------------------------------------------------------- strategy -----

class StrategyStop(BaseModel):
    lap: int = Field(..., ge=1, le=120)
    compound: str = "MEDIUM"


class StrategyScenario(BaseModel):
    label: str
    start_compound: str = Field("MEDIUM", alias="startCompound")
    start_age: int = Field(1, ge=1, le=80, alias="startAge")
    stops: list[StrategyStop] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class StrategySimulateRequest(BaseModel):
    model_id: str | None = Field(None, alias="modelId")
    current_lap: int = Field(18, ge=1, alias="currentLap")
    total_laps: int = Field(57, ge=5, alias="totalLaps")
    baseline_lap_s: float = Field(95.0, gt=0, alias="baselineLapS")
    pit_loss_s: float | None = Field(None, alias="pitLossS")
    driver: str = "VER"
    position: int = 10
    lap_time_s: float = Field(93.0, alias="lapTimeS")
    use_model: bool = Field(True, alias="useModel")
    scenarios: list[StrategyScenario] = Field(..., min_length=1, max_length=6)

    model_config = {"populate_by_name": True}


class StintPlan(BaseModel):
    compound: str
    from_lap: int = Field(alias="fromLap")
    to_lap: int = Field(alias="toLap")
    ages: list[int]

    model_config = {"populate_by_name": True}


class StrategyScenarioResult(BaseModel):
    label: str
    stops: int
    predicted_race_time_s: float = Field(alias="predictedRaceTimeS")
    pit_loss_total_s: float = Field(alias="pitLossTotalS")
    stint_plan: list[StintPlan] = Field(alias="stintPlan")
    avg_deg_per_lap: float = Field(alias="avgDegPerLap")
    final_tyre_age: int = Field(alias="finalTyreAge")
    mean_pit_probability: float = Field(alias="meanPitProbability")
    # model-scored extras (only when use_model and a model is available)
    model_mean_pit_probability: float | None = Field(None, alias="modelMeanPitProbability")
    model_recommended_box_lap: int | None = Field(None, alias="modelRecommendedBoxLap")

    model_config = {"populate_by_name": True}


class StrategySimulateResponse(BaseModel):
    model_id: str | None = Field(None, alias="modelId")
    model_name: str | None = Field(None, alias="modelName")
    model_version: str | None = Field(None, alias="modelVersion")
    model_scored: bool = Field(False, alias="modelScored")
    pit_loss_s: float = Field(alias="pitLossS")
    scenarios: list[StrategyScenarioResult]

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------- health ----

class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    uptime_seconds: float = Field(alias="uptimeSeconds")
    models_registered: int = Field(alias="modelsRegistered")
    models_loaded: int = Field(alias="modelsLoaded")
    champion: str | None = None
    sessions_active: int = Field(alias="sessionsActive")
    predictions_served: int = Field(alias="predictionsServed")
    store_path: str = Field(alias="storePath")

    model_config = {"populate_by_name": True}


class ErrorResponse(BaseModel):
    detail: str
    hint: str | None = None
