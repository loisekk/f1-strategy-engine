"""Feature engineering — mirrors the original f1-strategy-engine training
pipeline 1:1 (see frontend/scripts/build_model_data.py for the replication
this is derived from).

Canonical feature order (12 features):
    LapNumber, Stint, TyreLife, Position, LapTime, LapTime_Delta,
    Cumulative_Degradation, RaceProgress, Normalized_TyreLife,
    Position_Change, Driver_enc, Compound_enc

Encodings: LabelEncoder-style index over the sorted unique values of the
published dataset (backend/data/encodings.json, generated from
f1_strategy_dataset_v4.csv). A model card can override encodings by shipping
its own encodings.json artifact.

Derived features (computed when not supplied explicitly):
    RaceProgress          = lapNumber / totalLaps
    Normalized_TyreLife   = tyreLife / 40
    Cumulative_Degradation= 0.15 * tyreLife
These defaults match the inference-grid builder of the verified replication.
If your training script derived them differently, edit DERIVATIONS here —
it is the single place where feature semantics live.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from ..core.config import settings
from ..core.schemas import PredictInputs

CANONICAL_FEATURES = [
    "LapNumber", "Stint", "TyreLife", "Position", "LapTime", "LapTime_Delta",
    "Cumulative_Degradation", "RaceProgress", "Normalized_TyreLife",
    "Position_Change", "Driver_enc", "Compound_enc",
]

GENERIC_FEATURES = [f"f{i}" for i in range(len(CANONICAL_FEATURES))]


def is_generic_schema(schema: list[str]) -> bool:
    """True for placeholder feature names LightGBM/XGBoost assign when a model
    was trained on a numpy matrix: 'f0..fN', 'Column_0..Column_N', '0..N'."""
    if not schema:
        return False
    import re

    for i, name in enumerate(schema):
        if not re.fullmatch(r"(?:f|Column_)?\d+", name):
            return False
        digits = re.sub(r"^(?:f|Column_)?", "", name)
        if digits != str(i):
            return False
    return True

# single source of truth for derived-feature semantics
DERIVATIONS = {
    "race_progress": "lapNumber / totalLaps",
    "normalized_tyre_life": "tyreLife / 40.0",
    "cumulative_degradation": "0.15 * tyreLife",
}

_cache: dict[str, dict] = {}


class FeatureError(Exception):
    """User-facing feature-building failure (unknown driver/compound etc.)."""


def load_default_encoders() -> dict:
    path = Path(settings.default_encoders_path)
    if not path.exists():
        return {"drivers": [], "compounds": []}
    if "default" not in _cache:
        with open(path, "r", encoding="utf-8") as f:
            _cache["default"] = json.load(f)
    return _cache["default"]


def encode_value(kind: str, value: str, encoders: dict | None) -> int:
    """Index of `value` in the sorted class list — identical to sklearn
    LabelEncoder fitted on the full dataset column."""
    table = encoders or load_default_encoders()
    classes: list[str] = table.get(kind, [])
    if not classes:
        raise FeatureError(
            f"No {kind} encodings available. Ship an encodings.json artifact "
            "with the model, or provide {kind}Enc numerically in the request."
        )
    v = value.strip().upper()
    if v not in classes:
        raise FeatureError(
            f"Unknown {kind} '{value}'. Known values: {', '.join(classes[:30])}"
            + (" …" if len(classes) > 30 else "")
        )
    return classes.index(v)


def build_feature_row(
    inputs: PredictInputs,
    encoders: dict | None,
    feature_schema: list[str],
) -> tuple[list[float], list[str]]:
    """Build one feature row in the schema order of the target model.

    Returns (vector, names). Schema handling:
      * canonical names        → direct build
      * generic f0..f11        → canonical order (models trained on the raw
                                 matrix without feature names)
      * any other schema       → name-based mapping from canonical values;
                                 missing names raise FeatureError
    """
    race_progress = (
        inputs.race_progress
        if inputs.race_progress is not None
        else inputs.lap_number / max(1, inputs.total_laps)
    )
    normalized_life = (
        inputs.normalized_tyre_life
        if inputs.normalized_tyre_life is not None
        else inputs.tyre_life / 40.0
    )
    cum_deg = (
        inputs.cumulative_degradation
        if inputs.cumulative_degradation is not None
        else 0.15 * inputs.tyre_life
    )

    driver_enc = (
        inputs.driver_enc
        if inputs.driver_enc is not None
        else float(encode_value("drivers", inputs.driver or "VER", encoders))
    )
    compound_enc = (
        inputs.compound_enc
        if inputs.compound_enc is not None
        else float(encode_value("compounds", inputs.compound or "MEDIUM", encoders))
    )

    values: dict[str, float] = {
        "LapNumber": float(inputs.lap_number),
        "Stint": float(inputs.stint),
        "TyreLife": float(inputs.tyre_life),
        "Position": float(inputs.position),
        "LapTime": float(inputs.lap_time_s),
        "LapTime_Delta": float(inputs.lap_time_delta),
        "Cumulative_Degradation": float(cum_deg),
        "RaceProgress": float(race_progress),
        "Normalized_TyreLife": float(normalized_life),
        "Position_Change": float(inputs.position_change),
        "Driver_enc": float(driver_enc),
        "Compound_enc": float(compound_enc),
    }

    schema = feature_schema or CANONICAL_FEATURES

    if list(schema) == CANONICAL_FEATURES or is_generic_schema(list(schema)):
        if is_generic_schema(list(schema)) and len(schema) != len(CANONICAL_FEATURES):
            raise FeatureError(
                f"Model expects {len(schema)} features (generic names) but this "
                f"serving layer produces {len(CANONICAL_FEATURES)}. If your model "
                "was trained on a different feature set, pass feature_schema in "
                "the registration metadata (see MERGE_GUIDE.md §6)."
            )
        return [values[f] for f in CANONICAL_FEATURES], list(schema)

    # name-based mapping for custom schemas
    row: list[float] = []
    for name in schema:
        if name in values:
            row.append(values[name])
        else:
            # tolerate common aliases
            alias = {
                "LapTime(s)": "LapTime",
                "LapTime_s": "LapTime",
                "TyreLife(laps)": "TyreLife",
            }.get(name)
            if alias and alias in values:
                row.append(values[alias])
            else:
                raise FeatureError(
                    f"Model expects feature '{name}' which this serving layer "
                    f"does not produce. Known features: {', '.join(CANONICAL_FEATURES)}. "
                    "Extend build_feature_row() in services/features.py."
                )
    return row, list(schema)


def rows_for_batch(
    inputs_list: list[PredictInputs],
    encoders: dict | None,
    feature_schema: list[str],
) -> np.ndarray:
    rows = [build_feature_row(i, encoders, feature_schema)[0] for i in inputs_list]
    return np.asarray(rows, dtype=np.float64)


def inputs_from_state(
    *,
    driver: str,
    lap_number: int,
    total_laps: int,
    stint: int,
    tyre_life: int,
    position: int,
    lap_time_s: float,
    lap_time_delta: float,
    compound: str,
) -> PredictInputs:
    """Convenience constructor used by the strategy simulator."""
    return PredictInputs(
        driver=driver,
        compound=compound,
        lapNumber=lap_number,
        totalLaps=total_laps,
        stint=stint,
        tyreLife=tyre_life,
        position=position,
        lapTimeS=lap_time_s,
        lapTimeDelta=lap_time_delta,
        cumulativeDegradation=0.15 * tyre_life,
        raceProgress=lap_number / max(1, total_laps),
        normalizedTyreLife=tyre_life / 40.0,
        positionChange=0.0,
    )
