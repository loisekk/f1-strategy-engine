# Data & asset pipeline (Python)

These scripts built the bundled datasets and the 3D vehicle asset. They are
documentation of provenance — the app ships their OUTPUTS (`public/data/*`,
`public/models/f1_car_parts.glb`), so you never need to run them to use the
platform. They are included so every number on every page stays reproducible.

| Script | Output | What it does |
|---|---|---|
| `analyze_dataset.py` | console report | dataset sanity: rows, splits, pit-event rates |
| `build_model_data.py` | `../public/data/models.json` | replicates the documented training pipeline (5 models), exports verified metrics, threshold sweep, ROC, feature importance and the champion's inference grid |
| `build_race_data.py` | `../public/data/races/*.json` | lap records, stints, pit events, circuit paths from the dataset + `f1-circuits.geojson` |
| `build_telemetry_data.py` | `../public/data/telemetry.json` | quasi-steady lap simulation over real circuit geometry (speed/throttle/brake/gear/RPM) |
| `inspect_glb.py`, `analyze_meshes.py`, `identify_parts.py`, `split_car.py`, `verify_parts.py`, `glblib.py` | `../public/models/f1_car_parts.glb` | splits the "F1 2022 Generic" model (TheoDevF1, CC-BY-NC-ND-4.0 — download separately from Sketchfab) into 14 controllable engineering groups for the exploded view |

Dataset lives at `../../data/f1_strategy_dataset_v4.csv` (shared with the
backend retraining scripts). All paths are package-relative — run from this
directory with `python <script>.py`.

The **live** ML pipeline (training + registry + serving) lives in `../../backend`
— see its README and the root MERGE_GUIDE.md.
