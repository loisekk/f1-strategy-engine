#!/usr/bin/env python3
"""One-command merge of YOUR original artifacts into the platform.

Looks for the two files of the original f1-strategy-engine project
(default locations shown; override with flags):

    f1_pitstop_model.json   LightGBM booster (JSON)  — becomes the model
    f1_scaler.pkl           fitted StandardScaler     — optional scaler

Registers them as a NEW model version and (with --promote) makes them the
champion. The reference replica stays available for comparison.

Usage (from backend/):
    python scripts/seed_from_original.py \\
        --model ../f1_pitstop_model.json \\
        --scaler ../f1_scaler.pkl \\
        --version 1.0.0-original --promote
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_MODEL = HERE.parents[1] / "f1_pitstop_model.json"
DEFAULT_SCALER = HERE.parents[1] / "f1_scaler.pkl"
DEFAULT_ENCODERS = HERE.parents[1] / "backend" / "data" / "encodings.json"


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=str(DEFAULT_MODEL), help=f"Path to f1_pitstop_model.json (default: {DEFAULT_MODEL})")
    ap.add_argument("--scaler", default=str(DEFAULT_SCALER), help=f"Path to f1_scaler.pkl (default: {DEFAULT_SCALER})")
    ap.add_argument("--encoders", default=str(DEFAULT_ENCODERS))
    ap.add_argument("--name", default="LightGBM Pit-Stop Original")
    ap.add_argument("--version", default="1.0.0-original")
    ap.add_argument("--threshold", type=float, default=0.64)
    ap.add_argument("--promote", action="store_true", help="Make it champion immediately (recommended)")
    args = ap.parse_args()

    model = Path(args.model)
    if not model.exists():
        print(
            f"Model file not found: {model}\n"
            "Copy f1_pitstop_model.json next to this package (or pass --model).",
            file=sys.stderr,
        )
        return 1
    scaler = Path(args.scaler)
    encoders = Path(args.encoders)

    cmd = [
        sys.executable, str(HERE / "register_model.py"),
        "--name", args.name,
        "--version", args.version,
        "--model", str(model),
        "--framework", "lightgbm",
        "--threshold", str(args.threshold),
        "--notes", "Original artifact from the f1-strategy-engine repository "
                   "(f1_pitstop_model.json + f1_scaler.pkl).",
    ]
    if scaler.exists():
        cmd += ["--scaler", str(scaler)]
    else:
        print(f"note: scaler not found at {scaler} — continuing without it "
              "(LightGBM trees are scale-invariant, predictions are unaffected).")
    if encoders.exists():
        cmd += ["--encoders", str(encoders)]
    if args.promote:
        cmd += ["--promote"]

    return subprocess.call(cmd)


if __name__ == "__main__":
    sys.exit(main())
