#!/usr/bin/env python3
"""Train the three REFERENCE models from the published dataset and register
them in the model store, so the platform serves REAL predictions out of the
box (before you register your own original artifacts).

Reference models (all trained on f1_strategy_dataset_v4.csv — 101,371 laps,
same 12 features and 80/20 stratified split as the documented pipeline):

  lightgbm-pitstop-1.0.0   champion    threshold 0.64  (documented champion)
  xgboost-pitstop-1.0.0    candidate   threshold 0.60
  logreg-pitstop-1.0.0     candidate   threshold 0.50  (with StandardScaler —
                                    demonstrates the scaler serving path)

Also writes backend/data/encodings.json (sorted driver/compound classes —
LabelEncoder-compatible) used to encode names at inference time.

Usage:
  python scripts/train_reference_models.py [--dataset PATH] [--keep-models]
  --keep-models: never delete existing reference entries (default: replace
                 reference models that are not champion and not session-bound)

Run from backend/:  python scripts/train_reference_models.py
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

# make `app` importable when run from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
from sklearn.ensemble import RandomForestClassifier  # noqa: F401 (kept parity)
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split  # noqa: E402
from sklearn.preprocessing import StandardScaler, LabelEncoder  # noqa: E402
import joblib  # noqa: E402
import lightgbm as lgb  # noqa: E402
import xgboost as xgb  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.registry import ModelStore, make_model_id, utc_now  # noqa: E402
from app.core.schemas import ModelCard, Sha256Info  # noqa: E402
from app.core.validator import sha256_of, validate_registration  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = BACKEND.parent / "data" / "f1_strategy_dataset_v4.csv"
FALLBACK_DATASET = BACKEND.parent / "frontend" / "scripts" / "f1_strategy_dataset_v4.csv"

FEATURES = [
    "LapNumber", "Stint", "TyreLife", "Position", "LapTime", "LapTime_Delta",
    "Cumulative_Degradation", "RaceProgress", "Normalized_TyreLife",
    "Position_Change", "Driver_enc", "Compound_enc",
]
SEED = 42


def load_dataset(path: Path):
    csv.field_size_limit(10**9)
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)

    def fnum(v, default=0.0):
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    drivers = [r["Driver"] for r in rows]
    compounds = [r["Compound"] for r in rows]
    driver_le = LabelEncoder().fit(drivers)
    comp_le = LabelEncoder().fit(compounds)

    cols = {
        "LapNumber": [fnum(r["LapNumber"]) for r in rows],
        "Stint": [fnum(r["Stint"]) for r in rows],
        "TyreLife": [fnum(r["TyreLife"]) for r in rows],
        "Position": [fnum(r["Position"]) for r in rows],
        "LapTime": [fnum(r["LapTime (s)"]) for r in rows],
        "LapTime_Delta": [fnum(r["LapTime_Delta"]) for r in rows],
        "Cumulative_Degradation": [fnum(r["Cumulative_Degradation"]) for r in rows],
        "RaceProgress": [fnum(r["RaceProgress"]) for r in rows],
        "Normalized_TyreLife": [fnum(r["Normalized_TyreLife"]) for r in rows],
        "Position_Change": [fnum(r["Position_Change"]) for r in rows],
        "Driver_enc": driver_le.transform(drivers).astype(np.float64),
        "Compound_enc": comp_le.transform(compounds).astype(np.float64),
    }
    X = np.column_stack([np.asarray(cols[k], dtype=np.float64) for k in FEATURES])
    y = np.array([int(r["PitNextLap"]) for r in rows])
    print(f"dataset: {len(rows):,} rows · {X.shape[1]} features · positive rate {y.mean():.3f}")
    return X, y, driver_le, comp_le


def evaluate(y_true, proba, threshold):
    pred = (proba >= threshold).astype(int)
    return {
        "accuracy": round(float(accuracy_score(y_true, pred)), 4),
        "precision": round(float(precision_score(y_true, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, pred, zero_division=0)), 4),
        "rocAuc": round(float(roc_auc_score(y_true, proba)), 4),
        "threshold": threshold,
        "testRows": int(len(y_true)),
    }


def register(store: ModelStore, staging: Path, *, name, version, framework, threshold,
             metrics, notes, model_file, scaler_file=None, encoders_file=None,
             promote=False):
    model_id = make_model_id(name, version)
    # replace a previous non-champion reference of the same id
    existing = [c for c in store.list_cards() if c.id == model_id]
    for card in existing:
        if card.status == "champion":
            print(f"  !! {model_id} is champion — registering new version instead")
            return None
        store.delete(model_id, bound_models=set())

    report = validate_registration(
        staging / model_file,
        staging / scaler_file if scaler_file else None,
        staging / encoders_file if encoders_file else None,
        framework=framework,
        allowed_model_ext=settings.allowed_model_extensions,
        allowed_scaler_ext=settings.allowed_scaler_extensions,
        feature_schema=FEATURES,
    )
    card = ModelCard(
        id=model_id,
        name=name,
        framework=report["framework"],
        version=version,
        status="candidate",
        threshold=threshold,
        artifact=model_file,
        scaler=scaler_file,
        encoders=encoders_file,
        feature_schema=report["feature_names"] or FEATURES,
        metrics=metrics,
        notes=notes,
        registered_at=utc_now(),
        sha256=Sha256Info(**report["sha256"]),
        size_bytes=(staging / model_file).stat().st_size,
    )
    store.register(
        staging_dir=staging,
        model_filename=model_file,
        scaler_filename=scaler_file,
        encoders_filename=encoders_file,
        card=card,
        promote=promote,
    )
    return card


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dataset", type=Path, default=None)
    ap.add_argument("--keep-models", action="store_true")
    args = ap.parse_args()

    dataset = args.dataset or next(
        (p for p in (DEFAULT_DATASET, FALLBACK_DATASET) if p.exists()), None
    )
    if dataset is None:
        sys.exit(
            f"Dataset not found at {DEFAULT_DATASET} or {FALLBACK_DATASET}.\n"
            "Pass --dataset /path/to/f1_strategy_dataset_v4.csv"
        )

    X, y, driver_le, comp_le = load_dataset(dataset)

    # write encodings.json (LabelEncoder-compatible class lists)
    data_dir = BACKEND / "data"
    data_dir.mkdir(exist_ok=True)
    encodings = {
        "drivers": sorted(driver_le.classes_.tolist()),
        "compounds": sorted(comp_le.classes_.tolist()),
        "note": "Sorted unique values of the published dataset — identical to "
                "sklearn LabelEncoder fitted on the full column.",
    }
    (data_dir / "encodings.json").write_text(json.dumps(encodings, indent=1))
    print(f"encodings: {len(encodings['drivers'])} drivers, {len(encodings['compounds'])} compounds")

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=SEED
    )
    print(f"split: {len(X_tr):,} train / {len(X_te):,} test")

    store = ModelStore()

    # ---------------- LightGBM (champion) ----------------
    t0 = time.time()
    lgbm = lgb.LGBMClassifier(
        n_estimators=400, num_leaves=63, learning_rate=0.05,
        is_unbalance=True, min_child_samples=40, random_state=SEED,
        subsample=0.9, subsample_freq=1, colsample_bytree=0.9, verbosity=-1,
    )
    lgbm.fit(X_tr, y_tr)
    proba = lgbm.predict_proba(X_te)[:, 1]
    lgb_metrics = evaluate(y_te, proba, 0.64)
    print(f"lightgbm : {lgb_metrics} ({time.time()-t0:.1f}s)")

    staging = store.new_staging_dir()
    booster_file = staging / "model.json"
    lgbm.booster_.save_model(str(booster_file), num_iteration=lgbm.booster_.num_trees())
    (staging / "encodings.json").write_text(json.dumps(encodings, indent=1))
    card = register(
        store, staging, name="LightGBM Pit-Stop", version="1.0.0",
        framework="lightgbm", threshold=0.64, metrics=lgb_metrics,
        notes="Reference champion — verified replica of the documented pipeline "
              "(same dataset, features, split, threshold).",
        model_file="model.json", encoders_file="encodings.json", promote=True,
    )
    print(f"registered: {card.id} [{card.status}]" if card else "skipped")

    # ---------------- XGBoost (candidate) ----------------
    t0 = time.time()
    spw = (y_tr == 0).sum() / (y_tr == 1).sum()
    xgbm = xgb.XGBClassifier(
        n_estimators=400, max_depth=6, learning_rate=0.05,
        scale_pos_weight=spw, random_state=SEED, eval_metric="logloss",
        subsample=0.9, colsample_bytree=0.9, verbosity=0,
    )
    xgbm.fit(X_tr, y_tr)
    proba = xgbm.predict_proba(X_te)[:, 1]
    xgb_metrics = evaluate(y_te, proba, 0.60)
    print(f"xgboost  : {xgb_metrics} ({time.time()-t0:.1f}s)")

    staging = store.new_staging_dir()
    xgbm.get_booster().save_model(str(staging / "model.json"))
    (staging / "encodings.json").write_text(json.dumps(encodings, indent=1))
    card = register(
        store, staging, name="XGBoost Pit-Stop", version="1.0.0",
        framework="xgboost", threshold=0.60, metrics=xgb_metrics,
        notes="Reference candidate — level-wise boosting baseline for comparison.",
        model_file="model.json", encoders_file="encodings.json",
    )
    print(f"registered: {card.id} [{card.status}]" if card else "skipped")

    # ---------------- Logistic Regression + scaler (candidate) ----------------
    t0 = time.time()
    scaler = StandardScaler().fit(X_tr)
    lr = LogisticRegression(C=1.0, max_iter=2000, random_state=SEED)
    lr.fit(scaler.transform(X_tr), y_tr)
    proba = lr.predict_proba(scaler.transform(X_te))[:, 1]
    lr_metrics = evaluate(y_te, proba, 0.50)
    print(f"logreg   : {lr_metrics} ({time.time()-t0:.1f}s)")

    staging = store.new_staging_dir()
    joblib.dump(lr, staging / "model.joblib")
    joblib.dump(scaler, staging / "scaler.joblib")
    (staging / "encodings.json").write_text(json.dumps(encodings, indent=1))
    card = register(
        store, staging, name="LogReg Pit-Stop", version="1.0.0",
        framework="sklearn", threshold=0.50, metrics=lr_metrics,
        notes="Reference candidate — linear baseline, demonstrates the scaler "
              "serving path (features are standardised before inference).",
        model_file="model.joblib", scaler_file="scaler.joblib",
        encoders_file="encodings.json",
    )
    print(f"registered: {card.id} [{card.status}]" if card else "skipped")

    print("\nstore:", store.dir)
    for c in store.list_cards():
        print(f"  {c.id:34s} {c.status:10s} threshold={c.threshold} f1={c.metrics.get('f1')}")


if __name__ == "__main__":
    main()
