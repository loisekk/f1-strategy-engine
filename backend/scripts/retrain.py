#!/usr/bin/env python3
"""MLOps retraining template — the "time to time" pipeline.

Trains a fresh LightGBM on the current dataset, evaluates on the held-out
split, and registers it as the NEXT candidate version (auto-increments the
minor version). Promotion stays a human decision.

Wire this into cron / GitHub Actions / Airflow:

    # monthly retrain
    python scripts/retrain.py --dataset ../data/f1_strategy_dataset_v4.csv
    # then promote after review:
    python scripts/promote_model.py --id lightgbm-pitstop-<new-version>
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import lightgbm as lgb  # noqa: E402
import joblib  # noqa: E402
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score, accuracy_score  # noqa: E402
from sklearn.model_selection import train_test_split  # noqa: E402

from app.core.registry import ModelStore  # noqa: E402

HERE = Path(__file__).resolve().parent
FEATURES = [
    "LapNumber", "Stint", "TyreLife", "Position", "LapTime", "LapTime_Delta",
    "Cumulative_Degradation", "RaceProgress", "Normalized_TyreLife",
    "Position_Change", "Driver_enc", "Compound_enc",
]
SEED = 42


def next_version(store: ModelStore, base_name: str) -> str:
    """Find the highest existing minor version for this model name."""
    prefix = base_name.lower().replace(" ", "-") + "-"
    best = (1, 0, 0)
    for card in store.list_cards():
        if card.id.startswith(prefix):
            try:
                maj, mi, _ = card.version.split(".")[:3]
                v = (int(maj), int(mi.split("-")[0]), 0)
                if v > best:
                    best = v
            except (ValueError, IndexError):
                continue
    return f"{best[0]}.{best[1] + 1}.0"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--name", default="LightGBM Pit-Stop")
    ap.add_argument("--version", default=None, help="Default: auto-increment (e.g. 1.1.0)")
    ap.add_argument("--threshold", type=float, default=0.64)
    ap.add_argument("--test-size", type=float, default=0.2)
    args = ap.parse_args()

    csv.field_size_limit(10**9)
    rows = []
    with open(args.dataset, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    print(f"loaded {len(rows):,} rows")

    def col(key):
        return np.array([float(r[key]) for r in rows], dtype=np.float64)

    X = np.column_stack([
        col("LapNumber"), col("Stint"), col("TyreLife"), col("Position"),
        col("LapTime (s)"), col("LapTime_Delta"), col("Cumulative_Degradation"),
        col("RaceProgress"), col("Normalized_TyreLife"), col("Position_Change"),
        col("Driver_enc") if "Driver_enc" in rows[0] else np.zeros(len(rows)),
        col("Compound_enc") if "Compound_enc" in rows[0] else np.zeros(len(rows)),
    ])
    y = np.array([int(r["PitNextLap"]) for r in rows])

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=args.test_size, stratify=y, random_state=SEED
    )

    model = lgb.LGBMClassifier(
        n_estimators=400, num_leaves=63, learning_rate=0.05,
        is_unbalance=True, min_child_samples=40, random_state=SEED,
        subsample=0.9, subsample_freq=1, colsample_bytree=0.9, verbosity=-1,
    )
    model.fit(X_tr, y_tr)
    proba = model.predict_proba(X_te)[:, 1]
    pred = (proba >= args.threshold).astype(int)
    metrics = {
        "accuracy": round(float(accuracy_score(y_te, pred)), 4),
        "precision": round(float(precision_score(y_te, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_te, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_te, pred, zero_division=0)), 4),
        "rocAuc": round(float(roc_auc_score(y_te, proba)), 4),
        "threshold": args.threshold,
    }
    print("metrics:", metrics)

    # register via the CLI (identical validation as HTTP upload)
    store = ModelStore()
    version = args.version or next_version(store, args.name)
    tmp_model = Path("/tmp") / f"retrained_model_{version}.json"
    model.booster_.save_model(str(tmp_model), num_iteration=model.booster_.num_trees())
    encoders = Path(__file__).resolve().parents[1] / "data" / "encodings.json"

    import subprocess
    import json as _json

    cmd = [
        sys.executable, str(HERE / "register_model.py"),
        "--name", args.name, "--version", version,
        "--model", str(tmp_model),
        "--encoders", str(encoders),
        "--framework", "lightgbm",
        "--threshold", str(args.threshold),
        "--metrics", _json.dumps(metrics),
        "--notes", f"Retrained by retrain.py on {Path(args.dataset).name} "
                   f"({len(rows):,} rows, test_size={args.test_size}).",
    ]
    rc = subprocess.call(cmd)
    if rc == 0:
        print(f"\nCandidate registered: {args.name} {version}")
        print(f"Promote after review: python scripts/promote_model.py --id "
              f"{args.name.lower().replace(' ', '-')}-{version}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
