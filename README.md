<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Rajdhani&weight=700&size=42&duration=3000&pause=1000&color=E30000&center=true&vCenter=true&width=750&lines=F1+STRATEGY+INTELLIGENCE;Pit+Stop+Prediction+%7C+Race+Telemetry+ML" alt="Typing SVG" />

<br/>

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Streamlit](https://img.shields.io/badge/Streamlit-Dashboard-FF4B4B?style=for-the-badge&logo=streamlit&logoColor=white)
![XGBoost](https://img.shields.io/badge/XGBoost-Tuned-0084d6?style=for-the-badge)
![LightGBM](https://img.shields.io/badge/LightGBM-Champion-9ACD32?style=for-the-badge)
![Scikit-Learn](https://img.shields.io/badge/Scikit--Learn-RandomForest-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white)
![Plotly](https://img.shields.io/badge/Plotly-3D+Viz-3F4F75?style=for-the-badge&logo=plotly&logoColor=white)

<br/>

> **Production-grade binary classification pipeline on 101,371 real F1 telemetry laps — predicting optimal pit stop windows using tyre degradation signals, race position dynamics, and lap time decay. Deployed as a dark-themed Streamlit app with 3D visualisations, live pit probability inference, and threshold-optimised multi-model comparisons.**

<br/>

![Best F1](https://img.shields.io/badge/Best%20F1%20Score-0.9445-e30000?style=flat-square)
![Accuracy](https://img.shields.io/badge/Accuracy-97%25%20(LightGBM)-f0a500?style=flat-square)
![Dataset](https://img.shields.io/badge/Telemetry%20Laps-101%2C371-3b82f6?style=flat-square)
![AUC](https://img.shields.io/badge/Best%20CV%20AUC-0.9869%20(XGBoost)-22c55e?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-888888?style=flat-square)

</div>

---

## Overview

Real F1 pit strategy is decided in seconds under pressure — wrong call costs 20+ seconds or a race. This project builds a machine learning system that learns pit stop patterns from historical race telemetry and predicts, lap-by-lap, whether a driver should pit on the next lap.

This is not a tutorial notebook. It is a **full data science product** covering:

- Telemetry feature engineering (degradation curves, lap delta, race progress)
- Class imbalance handling (75/25 split between No Pit and Pit laps)
- Three production-grade classifiers trained, tuned via RandomizedSearchCV, and threshold-optimised
- Serialised model artefacts in size-efficient formats (XGBoost native `.json`)
- A Streamlit dashboard with F1 dark theme, 3D Plotly explorers, and live inference UI

---

![F1 Strategy Intelligence Demo](assets/f1_strategy_app.gif)

---

## The Problem

### Why pit stop prediction is hard

Pit stop timing is a multi-variable optimisation problem under real-time uncertainty:

- **Tyre degradation is non-linear.** Lap time doesn't degrade at a fixed rate — there is a cliff where grip collapses suddenly, and the model must learn where that cliff is per compound and circuit.
- **Class imbalance is severe.** In any race, a driver pits 2–3 times across ~50–70 laps. That means roughly 75% of laps are No-Pit laps. A naive classifier learns to predict No-Pit always and achieves 75% accuracy while being completely useless.
- **Timing context matters.** A pit at Lap 15 is different from a pit at Lap 45. Race progress, position, and gap to competitors all interact with tyre state.

This project addresses all three explicitly — through engineered features, imbalance-aware training, and threshold optimisation.

---

## Dataset

| Attribute | Details |
|---|---|
| **Source** | Real F1 race telemetry (2023 season) |
| **Total Laps** | 101,371 |
| **Test Split** | 20,267 laps held out |
| **Train Split** | 81,104 laps |
| **Races** | Multiple 2023 Grand Prix events |
| **Class Ratio** | ~75% No Pit / ~25% Pit (imbalanced) |

### Features

| Feature | Type | Description |
|---|---|---|
| `Driver` | Categorical | Driver code (ALB, VER, HAM…) |
| `LapNumber` | Numeric | Lap number within the race |
| `Compound` | Categorical | Tyre compound (SOFT / MEDIUM / HARD) |
| `Stint` | Numeric | Current stint number |
| `TyreLife` | Numeric | Laps on current set of tyres |
| `Position` | Numeric | Track position at lap end |
| `LapTime (s)` | Numeric | Lap time in seconds |
| `LapTime_Delta` | Engineered | Lap-over-lap time change (degradation signal) |
| `Cumulative_Degradation` | Engineered | Sum of LapTime_Delta over the current stint |
| `RaceProgress` | Engineered | Current lap / total laps (0–1) |
| `Normalized_TyreLife` | Engineered | TyreLife normalised within compound group |
| `Position_Change` | Engineered | Position delta vs previous lap |

### Target

`PitNextLap` — binary flag: `1` if the driver pits on the following lap, `0` otherwise.

---

## ML Pipeline

```
Raw Telemetry  (101,371 laps × 16 features)
        │
        ▼
┌───────────────────────┐
│  1. Data Inspection    │  Shape · dtypes · null audit · class distribution
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  2. EDA                │  LapTime degradation curves per compound
│                        │  Position vs pit frequency · stint length histograms
│                        │  Correlation heatmap · compound pit rate analysis
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  3. Feature Engineering│  LapTime_Delta (lag-1 diff per driver per stint)
│                        │  Cumulative_Degradation (cumsum per stint)
│                        │  RaceProgress (LapNumber / max laps)
│                        │  Normalized_TyreLife (within-compound min-max)
│                        │  Position_Change (lag-1 diff on Position)
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  4. Encoding           │  Label Encoding: Compound, Driver (XGBoost path)
│                        │  One-Hot: Compound (RF / LGBM path)
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  5. Imbalance Handling │  XGBoost: scale_pos_weight = neg/pos ratio
│                        │  Random Forest: class_weight='balanced'
│                        │  LightGBM: is_unbalance=True
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  6. Scaling            │  StandardScaler → LapTime, TyreLife, Position,
│                        │  LapTime_Delta, Cumulative_Degradation
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  7. Baseline Training  │  Logistic Regression · Decision Tree
│                        │  Random Forest · Base XGBoost
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  8. Hyperparameter     │  RandomizedSearchCV: 50 candidates × 5-fold CV
│     Tuning             │  XGBoost Best CV AUC: 0.9869
│                        │  LightGBM Best F1 threshold: 0.64
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  9. Threshold          │  Sweep thresholds 0.10 → 0.90 (step 0.02)
│     Optimisation       │  Select threshold maximising F1 on Pit class
│                        │  XGBoost: 0.60 · LightGBM: 0.64
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│  10. Serialisation     │  XGBoost → f1_xgboost_model.json (native, ~10× smaller)
│                        │  LightGBM, RF → joblib .pkl
│                        │  Scaler → f1_scaler.pkl
└───────────────────────┘
```

---

## Results

| Model | Accuracy | Pit Precision | Pit Recall | Pit F1 | Best CV AUC | Optimal Threshold |
|---|---|---|---|---|---|---|
| Logistic Regression | 0.70 | 0.45 | 0.71 | 0.55 | — | 0.50 |
| Decision Tree | 0.73 | 0.49 | 0.81 | 0.61 | — | 0.50 |
| Random Forest | 0.94 | 0.92 | 0.81 | 0.87 | — | 0.50 |
| XGBoost (Tuned) | 0.96 | 0.91 | 0.92 | 0.91 | **0.9869** | 0.60 |
| **LightGBM (Tuned)** | **0.97** | **0.95** | **0.93** | **0.9445** | — | **0.64** |

### Why LightGBM wins

LightGBM uses **leaf-wise tree growth** — it splits the leaf with the highest loss gain regardless of depth, creating asymmetric trees that capture the sharp, non-linear tyre degradation cliff. XGBoost's **level-wise growth** splits all leaves at the same depth uniformly, smoothing over these sharp boundaries. On a dataset where the signal is concentrated in a narrow degradation window, leaf-wise wins by ~3% F1 with 40% faster training.

### Why threshold optimisation matters

At default threshold 0.50, both tuned models leave significant Pit recall on the table because the imbalanced training distribution biases the probability estimates toward No-Pit. Sweeping to the F1-optimal threshold recovers **6–8 points of F1 on the Pit class** — the class that actually matters for race strategy decisions.

---

## App Features

| Feature | Description |
|---|---|
| 🎯 **Live Pit Prediction** | Input current race state → instant pit probability with confidence band |
| ⚡ **Probability Gauge** | Visual pit urgency meter: Safe / Watch / Box This Lap tiers |
| 🔬 **3D Telemetry Explorer** | TyreLife × LapTime × Position · RaceProgress × Degradation × PitProbability |
| 📊 **Degradation Analysis** | Per-compound lap time decay curves · cumulative degradation histograms |
| 🎬 **Animated Race Replay** | Lap-by-lap pit window visualisation across all drivers in a selected race |
| 🕸️ **Model Comparison Radar** | Precision / Recall / F1 / AUC spider chart across all three models |
| 📉 **Threshold Optimiser** | Interactive F1 vs threshold curve — drag to see decision boundary shift live |
| 🏆 **Driver Strategy Board** | Per-driver stint breakdown · undercut window detection · pit frequency ranking |

---

## Project Structure

```
F1-Strategy-Pit-Stop-Prediction/
│
├── 📓 F1_Strategy_Pit-Stop_Prediction.ipynb   # Full EDA, feature engineering, modelling
├── 🚀 app.py                                   # Streamlit dashboard (F1 dark theme)
├── 📊 f1_strategy_dataset_v4.csv              # Processed telemetry dataset
│
├── 🤖 f1_xgboost_model.json                   # XGBoost — native format (size-efficient)
├── 🌿 f1_lgbm_model.pkl                       # LightGBM — champion model
├── 🌲 f1_rf_model.pkl                         # Random Forest — baseline
├── ⚖️  f1_scaler.pkl                           # StandardScaler for numeric features
│
├── 📁 assets/
│   └── f1_strategy_app.gif                    # Dashboard demo GIF
│
└── 📄 README.md
```

---

## Getting Started

### Prerequisites

```bash
Python 3.10+
```

### 1. Clone

```bash
git clone https://github.com/yashbrahmankar/F1-Strategy-Pit-Stop-Prediction.git
cd F1-Strategy-Pit-Stop-Prediction
```

### 2. Install

```bash
pip install streamlit plotly pandas numpy scikit-learn xgboost lightgbm joblib seaborn matplotlib
```

### 3. Run dashboard

```bash
streamlit run app.py
```

### 4. Run notebook

```bash
jupyter notebook F1_Strategy_Pit-Stop_Prediction.ipynb
```

---

## Engineering Decisions

### XGBoost serialised as `.json`, not `.pkl`

XGBoost's native `.json` format is ~10× smaller than joblib `.pkl` for the same model. It is also version-agnostic — a `.pkl` saved with XGBoost 1.7 may silently break on 2.x. The `.json` format is the correct production choice for any XGBoost model.

### Imbalance handled at the algorithm level, not the data level

SMOTE and random oversampling were deliberately avoided. Synthetic pit stop laps do not reflect real race strategy distributions — they introduce artificial patterns that inflate validation metrics without generalising. Instead, imbalance is handled natively (`scale_pos_weight`, `class_weight='balanced'`, `is_unbalance=True`) so the models learn the true data geometry.

### Threshold set per model, not shared

A single shared threshold across models assumes all three produce calibrated probability outputs. They do not — tree ensembles are known to produce poorly calibrated probabilities, and the optimal decision boundary differs between XGBoost's boosting approach and LightGBM's leaf-wise growth. Per-model F1-optimal thresholds are the correct approach.

---

## Tech Stack

| Layer | Tools |
|---|---|
| **Data** | Pandas · NumPy |
| **Visualisation** | Plotly · Seaborn · Matplotlib |
| **ML** | Scikit-learn · XGBoost · LightGBM |
| **Serialisation** | XGBoost native `.json` · joblib `.pkl` |
| **Dashboard** | Streamlit |
| **Styling** | Custom CSS · Rajdhani · Exo 2 · F1 dark theme |

---

## Author

<div align="center">

**Yash Brahmankar**
B.Tech AI & ML · OIST (2024–2028)

[![GitHub](https://img.shields.io/badge/GitHub-yashbrahmankar-181717?style=for-the-badge&logo=github)](https://github.com/yashbrahmankar)
[![Email](https://img.shields.io/badge/Email-yashbrahmankar95@gmail.com-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:yashbrahmankar95@gmail.com)

</div>

---

## License

[MIT License](LICENSE)

---

<div align="center">
<sub>Built with 🏎️ and way too much LightGBM · F1 Strategy Intelligence · 2026</sub>
</div>
