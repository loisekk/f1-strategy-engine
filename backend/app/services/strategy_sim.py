"""Strategy simulation — server-side twin of the frontend's
`simulateStrategy()` (frontend/src/services/data.ts), with the addition of
REAL model scoring: every remaining lap of every scenario is passed through
the session's active model to obtain P(box next lap).

Tyre curves come from backend/data/tyre_curves.json (empirical degradation +
pit rates measured from the 101k-lap dataset — same file the frontend uses).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from ..core.config import settings
from ..core.schemas import (
    StrategyScenario,
    StrategyScenarioResult,
    StrategySimulateRequest,
    StintPlan,
)
from ..core.manager import ModelManager
from .features import inputs_from_state, rows_for_batch

_curves_cache: dict[str, Any] | None = None


class StrategyError(Exception):
    pass


def load_curves() -> dict:
    global _curves_cache
    if _curves_cache is None:
        path = Path(settings.tyre_curves_path)
        if not path.exists():
            raise StrategyError(
                f"Tyre curves file missing: {path}. Re-copy it from "
                "frontend/public/data/tyres.json."
            )
        with open(path, "r", encoding="utf-8") as f:
            _curves_cache = json.load(f)
    return _curves_cache


def _curve(compound: str) -> dict:
    c = load_curves().get("compounds", {}).get(compound.upper())
    if c is None:
        raise StrategyError(
            f"No degradation curve for compound '{compound}'. Available: "
            f"{', '.join(load_curves().get('compounds', {}).keys())}"
        )
    return c


def simulate(
    req: StrategySimulateRequest,
    manager: ModelManager,
    model_id: str | None,
) -> tuple[list[StrategyScenarioResult], dict[str, Any] | None]:
    curves = load_curves()
    pit_loss_s = req.pit_loss_s if req.pit_loss_s is not None else float(
        curves.get("pitLossSeconds", 19.9)
    )

    # resolve the model once (warm) — None means empirical-only simulation
    model_ctx: dict[str, Any] | None = None
    if req.use_model and model_id:
        lm = manager.get(model_id)
        model_ctx = {"id": lm.card.id, "name": lm.card.name, "version": lm.card.version}

    results: list[StrategyScenarioResult] = []
    for s in req.scenarios:
        plan: list[dict] = []
        lap = req.current_lap
        age = s.start_age
        compound = s.start_compound.upper()
        stops = sorted(s.stops, key=lambda st: st.lap)
        pit_loss_total = 0.0
        empirical_probs: list[float] = []
        model_rows_states: list[dict] = []  # per-lap state for model scoring

        for i in range(len(stops) + 1):
            stop = stops[i] if i < len(stops) else None
            end_lap = stop.lap - 1 if stop else req.total_laps
            ages: list[int] = []
            cprob = _curve(compound).get("pitProbability", {})
            while lap <= end_lap:
                key = str(min(age, 40))
                empirical_probs.append(float(cprob.get(key, 0.0)))
                ages.append(age)
                model_rows_states.append(
                    dict(lap_number=lap, tyre_life=age, compound=compound)
                )
                age += 1
                lap += 1
            if ages:
                plan.append(
                    dict(compound=compound, from_lap=lap - len(ages), to_lap=lap - 1, ages=ages)
                )
            if stop:
                pit_loss_total += pit_loss_s
                compound = stop.compound.upper()
                age = 1
                lap = stop.lap

        # race time: baseline + degradation delta per lap + pit loss
        race_time = 0.0
        deg_sum = 0.0
        n = 0
        for stint in plan:
            ccurve = _curve(stint["compound"]).get("lapTimeDelta", {})
            for a in stint["ages"]:
                key = str(min(a, 40))
                delta = float(ccurve.get(key, ccurve.get("40", 0.4)))
                race_time += req.baseline_lap_s + delta
                deg_sum += delta
                n += 1
        race_time += pit_loss_total

        # model scoring — one warm batch call per scenario
        model_mean: float | None = None
        box_lap: int | None = None
        if model_ctx is not None:
            lm = manager.get(model_id)  # cache hit — warm
            inputs = [
                inputs_from_state(
                    driver=req.driver,
                    lap_number=st["lap_number"],
                    total_laps=req.total_laps,
                    stint=2,
                    tyre_life=st["tyre_life"],
                    position=req.position,
                    lap_time_s=req.lap_time_s,
                    lap_time_delta=0.15,
                    compound=st["compound"],
                )
                for st in model_rows_states
            ]
            X = rows_for_batch(inputs, lm.encoders, lm.card.feature_schema)
            probas = manager.predict_proba_batch(model_id, X)
            if probas:
                model_mean = round(float(np.mean(probas)), 4)
                threshold = lm.card.threshold
                for st, p in zip(model_rows_states, probas):
                    if p >= threshold:
                        box_lap = st["lap_number"]
                        break

        results.append(
            StrategyScenarioResult(
                label=s.label,
                stops=len(stops),
                predictedRaceTimeS=round(race_time, 1),
                pitLossTotalS=round(pit_loss_total, 1),
                stintPlan=[StintPlan(**sp) for sp in plan],
                avgDegPerLap=round(deg_sum / n, 3) if n else 0.0,
                finalTyreAge=plan[-1]["ages"][-1] if plan else 0,
                meanPitProbability=round(float(np.mean(empirical_probs)), 4) if empirical_probs else 0.0,
                modelMeanPitProbability=model_mean,
                modelRecommendedBoxLap=box_lap,
            )
        )

    return results, model_ctx
