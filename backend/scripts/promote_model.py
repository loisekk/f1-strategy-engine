#!/usr/bin/env python3
"""Promote / archive / delete a model from the CLI (or over HTTP).

Examples
--------
python scripts/promote_model.py --id lightgbm-pitstop-1.1.0
python scripts/promote_model.py --id lightgbm-pitstop-1.0.0        # rollback
python scripts/promote_model.py --list
python scripts/promote_model.py --archive --id xgboost-pitstop-1.0.0
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.registry import ModelStore, RegistryError  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--id", dest="model_id")
    ap.add_argument("--archive", action="store_true", help="Archive instead of promote")
    ap.add_argument("--delete", action="store_true", help="Delete an ARCHIVED model")
    ap.add_argument("--list", action="store_true", help="List registry entries")
    ap.add_argument("--store", help="Override store dir")
    ap.add_argument("--api", help="Act against a running backend via HTTP")
    ap.add_argument("--api-key")
    args = ap.parse_args()

    if args.api:
        if args.list:
            url = f"{args.api.rstrip('/')}/api/v1/models"
            with urllib.request.urlopen(url, timeout=30) as r:
                print(json.dumps(json.loads(r.read()), indent=2))
            return 0
        if not args.model_id:
            print("error: --id is required", file=sys.stderr)
            return 1
        action = "archive" if args.archive else ("delete" if args.delete else "promote")
        url = f"{args.api.rstrip('/')}/api/v1/models/{args.model_id}/{action}"
        req = urllib.request.Request(
            url,
            method="DELETE" if args.delete else "POST",
            headers={"X-API-Key": args.api_key} if args.api_key else {},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.status == 204:
                    print(f"deleted {args.model_id}")
                else:
                    print(json.dumps(json.loads(r.read()), indent=2))
            return 0
        except urllib.error.HTTPError as exc:
            print(f"HTTP {exc.code}: {exc.read().decode()}", file=sys.stderr)
            return 1

    store = ModelStore(Path(args.store) if args.store else None)

    if args.list or not args.model_id:
        for c in store.list_cards():
            print(f"{c.id:40s} {c.status:10s} threshold={c.threshold:<5} f1={c.metrics.get('f1', '—')}")
        return 0

    try:
        if args.delete:
            store.delete(args.model_id, bound_models=set())
            print(f"deleted {args.model_id}")
        elif args.archive:
            card = store.set_status(args.model_id, "archived")
            print(f"archived {card.id}")
        else:
            card, previous = store.promote(args.model_id)
            print(f"champion: {card.id}")
            if previous:
                print(f"previous champion archived: {previous.id}  (rollback: python scripts/promote_model.py --id {previous.id})")
        return 0
    except RegistryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
