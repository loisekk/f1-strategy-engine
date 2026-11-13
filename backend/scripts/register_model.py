#!/usr/bin/env python3
"""Register model artifacts into the store from the command line.

This is the CI-friendly twin of POST /api/v1/models/register — identical
validation (load + smoke prediction + sha256), no HTTP required.

Examples
--------
# Register your original artifacts as the new champion:
python scripts/register_model.py \\
    --name "LightGBM Pit-Stop" --version 1.0.0 \\
    --model ../f1_pitstop_model.json \\
    --scaler ../f1_scaler.pkl \\
    --framework lightgbm --threshold 0.64 \\
    --notes "Original artifact from f1-strategy-engine" \\
    --promote

# Or against a RUNNING backend (same validation over HTTP):
python scripts/register_model.py --api http://localhost:8000 ...
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.registry import ModelStore, make_model_id, RegistryError, utc_now  # noqa: E402
from app.core.schemas import ModelCard, Sha256Info  # noqa: E402
from app.core.validator import validate_registration  # noqa: E402


def register_local(args) -> int:
    store = ModelStore(Path(args.store) if args.store else None)
    model_path = Path(args.model).expanduser().resolve()
    if not model_path.exists():
        print(f"error: model file not found: {model_path}", file=sys.stderr)
        return 1

    scaler_path = Path(args.scaler).expanduser().resolve() if args.scaler else None
    if scaler_path and not scaler_path.exists():
        print(f"error: scaler file not found: {scaler_path}", file=sys.stderr)
        return 1

    encoders_path = Path(args.encoders).expanduser().resolve() if args.encoders else None
    if encoders_path and not encoders_path.exists():
        print(f"error: encoders file not found: {encoders_path}", file=sys.stderr)
        return 1

    feature_schema = []
    if args.feature_schema:
        fs = Path(args.feature_schema)
        if fs.exists():
            feature_schema = json.loads(fs.read_text())
        elif args.feature_schema == "canonical":
            feature_schema = []
        else:
            feature_schema = [s.strip() for s in args.feature_schema.split(",") if s.strip()]

    staging = store.new_staging_dir()
    try:
        # copy into staging with canonical names
        model_file = "model" + model_path.suffix.lower()
        shutil.copy2(model_path, staging / model_file)
        scaler_file = None
        if scaler_path:
            scaler_file = "scaler" + scaler_path.suffix.lower()
            shutil.copy2(scaler_path, staging / scaler_file)
        encoders_file = None
        if encoders_path:
            encoders_file = "encodings.json"
            shutil.copy2(encoders_path, staging / encoders_file)

        report = validate_registration(
            staging / model_file,
            staging / scaler_file if scaler_file else None,
            staging / encoders_file if encoders_file else None,
            framework=args.framework,
            allowed_model_ext=settings.allowed_model_extensions,
            allowed_scaler_ext=settings.allowed_scaler_extensions,
            feature_schema=feature_schema,
        )
        metrics = json.loads(args.metrics) if args.metrics else {}

        card = ModelCard(
            id=make_model_id(args.name, args.version),
            name=args.name,
            framework=report["framework"],
            version=args.version,
            status="candidate",
            threshold=args.threshold,
            artifact=model_file,
            scaler=scaler_file,
            encoders=encoders_file,
            feature_schema=report["feature_names"],
            metrics=metrics,
            notes=args.notes,
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
            promote=args.promote,
        )
        print(json.dumps({
            "registered": card.id,
            "status": card.status,
            "framework": card.framework,
            "smoke": report["smoke"],
            "sha256": report["sha256"],
        }, indent=2))
        if not args.promote:
            print(f"\nNext: promote when ready →  python scripts/promote_model.py --id {card.id}")
        return 0
    except (RegistryError, Exception) as exc:  # noqa: BLE001
        shutil.rmtree(staging, ignore_errors=True)
        print(f"error: {exc}", file=sys.stderr)
        return 1


def register_http(args) -> int:
    import urllib.error
    import urllib.request
    import uuid

    boundary = uuid.uuid4().hex
    meta = json.dumps({
        "name": args.name, "version": args.version, "framework": args.framework,
        "threshold": args.threshold, "notes": args.notes,
        "metrics": json.loads(args.metrics) if args.metrics else {},
    })

    def field(name: str, value: str) -> bytes:
        return (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
        ).encode()

    def file_field(name: str, path: Path) -> bytes:
        return (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
            f"filename=\"{path.name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).encode() + path.read_bytes() + b"\r\n"

    body = field("meta", meta) + file_field("model", Path(args.model))
    if args.scaler:
        body += file_field("scaler", Path(args.scaler))
    if args.encoders:
        body += file_field("encoders", Path(args.encoders))
    body += f"--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"{args.api.rstrip('/')}/api/v1/models/register",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            **({"X-API-Key": args.api_key} if args.api_key else {}),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            print(json.dumps(json.loads(resp.read()), indent=2))
            return 0
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code}: {exc.read().decode()}", file=sys.stderr)
        return 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", required=True, help="Display name, e.g. 'LightGBM Pit-Stop'")
    ap.add_argument("--version", default="1.0.0")
    ap.add_argument("--model", required=True, help="Path to the model artifact")
    ap.add_argument("--scaler", help="Optional path to a fitted scaler (.pkl/.joblib)")
    ap.add_argument("--encoders", help="Optional encodings.json ({drivers:[], compounds:[]})")
    ap.add_argument("--framework", default="auto", choices=["auto", "lightgbm", "xgboost", "sklearn"])
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--metrics", help="JSON string of test metrics, e.g. '{\"f1\":0.86}'")
    ap.add_argument("--notes")
    ap.add_argument("--promote", action="store_true", help="Make it champion immediately")
    ap.add_argument("--feature-schema", help="'canonical' (default), comma list, or JSON file")
    ap.add_argument("--store", help="Override store dir (default: backend/model_store)")
    ap.add_argument("--api", help="Register against a running backend via HTTP instead of the local store")
    ap.add_argument("--api-key", help="X-API-Key when using --api with ML_API_KEY set")
    args = ap.parse_args()

    if args.api:
        return register_http(args)
    return register_local(args)


if __name__ == "__main__":
    sys.exit(main())
