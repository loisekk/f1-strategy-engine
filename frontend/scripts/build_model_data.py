#!/usr/bin/env python3
"""Replicate the documented F1 pit-stop prediction pipeline locally.

Trains all 5 documented models on the published dataset (same features, same
labels as the original project), and exports verified metrics, confusion
matrices, ROC curves, threshold sweeps, feature importance and a model
inference grid for the Strategy Simulator.

Output: ../public/data/models.json
"""
import csv
import json
import time
from collections import defaultdict

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, roc_curve, roc_auc_score,
)
import lightgbm as lgb
import xgboost as xgb

csv.field_size_limit(10**9)
CSV_PATH = "../../data/f1_strategy_dataset_v4.csv"
OUT = "../public/data/models.json"
SEED = 42

# ---------------- load ----------------
rows = []
with open(CSV_PATH, newline="") as f:
    for r in csv.DictReader(f):
        rows.append(r)
print(f"loaded {len(rows):,} rows")

def fnum(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default

X_raw = defaultdict(list)
for r in rows:
    X_raw["Driver"].append(r["Driver"])
    X_raw["Compound"].append(r["Compound"])
    X_raw["LapNumber"].append(fnum(r["LapNumber"]))
    X_raw["Stint"].append(fnum(r["Stint"]))
    X_raw["TyreLife"].append(fnum(r["TyreLife"]))
    X_raw["Position"].append(fnum(r["Position"]))
    X_raw["LapTime"].append(fnum(r["LapTime (s)"]))
    X_raw["LapTime_Delta"].append(fnum(r["LapTime_Delta"]))
    X_raw["Cumulative_Degradation"].append(fnum(r["Cumulative_Degradation"]))
    X_raw["RaceProgress"].append(fnum(r["RaceProgress"]))
    X_raw["Normalized_TyreLife"].append(fnum(r["Normalized_TyreLife"]))
    X_raw["Position_Change"].append(fnum(r["Position_Change"]))
X_raw["PitNextLap"] = [int(r["PitNextLap"]) for r in rows]

driver_le = LabelEncoder().fit(X_raw["Driver"])
comp_le = LabelEncoder().fit(X_raw["Compound"])

FEATURES_TREE = [
    "LapNumber", "Stint", "TyreLife", "Position", "LapTime", "LapTime_Delta",
    "Cumulative_Degradation", "RaceProgress", "Normalized_TyreLife",
    "Position_Change", "Driver_enc", "Compound_enc",
]

def build_matrix(one_hot_compound=False, one_hot_driver=False):
    n = len(rows)
    cols = {}
    for k in ["LapNumber", "Stint", "TyreLife", "Position", "LapTime",
              "LapTime_Delta", "Cumulative_Degradation", "RaceProgress",
              "Normalized_TyreLife", "Position_Change"]:
        cols[k] = np.array(X_raw[k], dtype=np.float64)
    cols["Driver_enc"] = driver_le.transform(X_raw["Driver"]).astype(np.float64)
    cols["Compound_enc"] = comp_le.transform(X_raw["Compound"]).astype(np.float64)
    mat = np.column_stack([cols[k] for k in FEATURES_TREE])
    names = list(FEATURES_TREE)
    if one_hot_compound:
        # append one-hot compound columns
        comps = sorted(set(X_raw["Compound"]))
        for c in comps:
            col = (np.array(X_raw["Compound"]) == c).astype(np.float64)
            mat = np.column_stack([mat, col])
            names.append(f"Compound_{c}")
    return mat, names, cols

y = np.array(X_raw["PitNextLap"])
X_tree, names_tree, cols = build_matrix()

# split 80/20 stratified (documented: 81,104 / 20,267)
idx = np.arange(len(y))
X_tr, X_te, y_tr, y_te, idx_tr, idx_te = train_test_split(
    X_tree, y, idx, test_size=0.20, stratify=y, random_state=SEED
)
print(f"train {len(X_tr):,} / test {len(X_te):,} | pos rate train {y_tr.mean():.3f}")

results = {}

def eval_model(name, model, Xtr, Xte, threshold, model_type="sklearn"):
    t0 = time.time()
    if model_type == "lgbm":
        model.fit(Xtr, y_tr, feature_name=[f"f{i}" for i in range(Xtr.shape[1])])
        proba = model.predict_proba(Xte)[:, 1]
    elif model_type == "xgb":
        model.fit(Xtr, y_tr)
        proba = model.predict_proba(Xte)[:, 1]
    else:
        model.fit(Xtr, y_tr)
        proba = model.predict_proba(Xte)[:, 1]
    fit_s = round(time.time() - t0, 1)
    pred = (proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_te, pred).ravel()
    metrics = {
        "accuracy": round(accuracy_score(y_te, pred), 4),
        "precision": round(precision_score(y_te, pred), 4),
        "recall": round(recall_score(y_te, pred), 4),
        "f1": round(f1_score(y_te, pred), 4),
        "threshold": threshold,
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "fitSeconds": fit_s,
    }
    auc = roc_auc_score(y_te, proba)
    metrics["rocAuc"] = round(auc, 4)
    print(f"{name:22s} acc={metrics['accuracy']:.4f} P={metrics['precision']:.4f} "
          f"R={metrics['recall']:.4f} F1={metrics['f1']:.4f} AUC={auc:.4f} (t={threshold}) fit={fit_s}s")
    return metrics, proba

# LightGBM champion (documented: is_unbalance=True, threshold 0.64)
lgbm = lgb.LGBMClassifier(
    n_estimators=400, num_leaves=63, learning_rate=0.05,
    is_unbalance=True, min_child_samples=40, random_state=SEED,
    subsample=0.9, subsample_freq=1, colsample_bytree=0.9, verbosity=-1,
)
lgbm_metrics, lgbm_proba = eval_model("LightGBM", lgbm, X_tr, X_te, 0.64, "lgbm")
results["lightgbm"] = lgbm_metrics

# XGBoost (documented: scale_pos_weight, threshold 0.60, best CV AUC 0.9869)
spw = (y_tr == 0).sum() / (y_tr == 1).sum()
xgbm = xgb.XGBClassifier(
    n_estimators=400, max_depth=6, learning_rate=0.05,
    scale_pos_weight=spw, random_state=SEED, eval_metric="logloss",
    subsample=0.9, colsample_bytree=0.9, verbosity=0,
)
xgb_metrics, xgb_proba = eval_model("XGBoost", xgbm, X_tr, X_te, 0.60, "xgb")
results["xgboost"] = xgb_metrics

# Random Forest (class_weight balanced)
rf = RandomForestClassifier(
    n_estimators=300, max_depth=14, class_weight="balanced",
    random_state=SEED, n_jobs=-1, min_samples_leaf=5,
)
rf_metrics, _ = eval_model("Random Forest", rf, X_tr, X_te, 0.50)
results["random_forest"] = rf_metrics

# Decision Tree
dt = DecisionTreeClassifier(max_depth=8, class_weight="balanced", random_state=SEED)
dt_metrics, _ = eval_model("Decision Tree", dt, X_tr, X_te, 0.50)
results["decision_tree"] = dt_metrics

# Logistic Regression (scaled + one-hot compound)
sc = StandardScaler().fit(X_tr)
X_tr_s, X_te_s = sc.transform(X_tr), sc.transform(X_te)
lr = LogisticRegression(C=1.0, max_iter=2000, random_state=SEED)
lr_metrics, _ = eval_model("Logistic Regression", lr, X_tr_s, X_te_s, 0.50)
results["logistic_regression"] = lr_metrics

# ---------------- threshold sweep for LightGBM ----------------
sweep = []
for t in np.arange(0.05, 0.96, 0.02):
    pred = (lgbm_proba >= t).astype(int)
    if pred.sum() == 0:
        continue
    sweep.append({
        "threshold": round(float(t), 2),
        "precision": round(precision_score(y_te, pred, zero_division=0), 4),
        "recall": round(recall_score(y_te, pred, zero_division=0), 4),
        "f1": round(f1_score(y_te, pred, zero_division=0), 4),
    })

# ---------------- ROC curves ----------------
fpr_l, tpr_l, _ = roc_curve(y_te, lgbm_proba)
fpr_x, tpr_x, _ = roc_curve(y_te, xgb_proba)
def sample_roc(fpr, tpr, n=60):
    idxs = np.linspace(0, len(fpr) - 1, n).astype(int)
    return [[round(fpr[i], 4), round(tpr[i], 4)] for i in idxs]
roc_lgbm = sample_roc(fpr_l, tpr_l)
roc_xgb = sample_roc(fpr_x, tpr_x)

# ---------------- feature importance (LGBM gain) ----------------
imp = lgbm.booster_.feature_importance(importance_type="gain")
imp_pct = imp / imp.sum() * 100
feat_imp = sorted(
    [{"feature": n, "importance": round(float(v), 2)} for n, v in zip(names_tree, imp_pct)],
    key=lambda d: -d["importance"],
)

# ---------------- inference grid (for strategy simulator) ----------------
# P(pit) over tyreLife x raceProgress per compound, other features at median state
def make_row(compound, tyre_life, race_progress):
    median_laptime = float(np.median(X_raw["LapTime"]))
    lap_number = max(1.0, round(race_progress * 55))
    return [
        lap_number,          # LapNumber
        2.0,                 # Stint
        float(tyre_life),    # TyreLife
        10.0,                # Position
        median_laptime,      # LapTime
        0.15,                # LapTime_Delta (median-ish)
        0.15 * tyre_life,    # Cumulative_Degradation
        race_progress,       # RaceProgress
        tyre_life / 40.0,    # Normalized_TyreLife
        0.0,                 # Position_Change
        float(driver_le.transform(["VER"])[0]),
        float(comp_le.transform([compound])[0]),
    ]

grid = {}
for compound in ["SOFT", "MEDIUM", "HARD"]:
    lives = list(range(1, 41))
    progs = [round(i / 20, 2) for i in range(21)]
    rows_g = [make_row(compound, tl, rp) for rp in progs for tl in lives]
    proba = lgbm.predict_proba(np.array(rows_g))[:, 1]
    grid[compound] = {
        "tyreLife": lives,
        "raceProgress": progs,
        "p": [round(float(v), 4) for v in proba],
    }

# ---------------- reported metrics from the original project README ----------------
reported = {
    "lightgbm": {"accuracy": 0.97, "precision": 0.95, "recall": 0.93, "f1": 0.9445, "threshold": 0.64},
    "xgboost": {"accuracy": 0.96, "precision": 0.91, "recall": 0.92, "f1": 0.91, "rocAuc": 0.9869, "threshold": 0.60},
    "random_forest": {"accuracy": 0.94, "precision": 0.92, "recall": 0.81, "f1": 0.87, "threshold": 0.50},
    "decision_tree": {"accuracy": 0.73, "precision": 0.49, "recall": 0.81, "f1": 0.61, "threshold": 0.50},
    "logistic_regression": {"accuracy": 0.70, "precision": 0.45, "recall": 0.71, "f1": 0.55, "threshold": 0.50},
}

doc = {
    "reported": {
        "source": "Original project README (f1-strategy-engine) — metrics as published",
        "models": reported,
    },
    "verified": {
        "source": "Local replication of the documented pipeline (this build): same dataset, features, labels, split ratio 80/20, documented thresholds. LightGBM hyperparameters approximated from documentation.",
        "testRows": int(len(X_te)),
        "trainRows": int(len(X_tr)),
        "features": names_tree,
        "models": results,
    },
    "thresholdSweep": sweep,
    "roc": {"lightgbm": roc_lgbm, "xgboost": roc_xgb},
    "featureImportance": feat_imp,
    "inferenceGrid": grid,
    "dataQuality": {
        "labelNote": "PitNextLap in the published dataset marks laps inside pit-decision windows (25.1% positive rate). True stint-break pit events occur on 3.3% of laps; the replay and strategy surfaces in this app use true stint breaks for pit events, while model metrics use the published labels for comparability with the original training runs.",
    },
    "champion": {
        "name": "LightGBM",
        "family": "Gradient-boosted decision trees (leaf-wise growth)",
        "artifact": "f1_lgbm_model.pkl (documented)",
        "threshold": 0.64,
    },
}
with open(OUT, "w") as f:
    json.dump(doc, f, separators=(",", ":"))
print(f"\nwrote {OUT} ({len(json.dumps(doc))//1024} KB)")
print("top features:", [(d['feature'], d['importance']) for d in feat_imp[:6]])
