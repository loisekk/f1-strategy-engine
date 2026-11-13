#!/usr/bin/env bash
# F1 Strategy Platform — one-command dev launcher.
# Starts the ML backend (FastAPI, :8000) and the frontend (Next.js, :3000).
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;36m[f1]\033[0m %s\n' "$1"; }

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  say "shutting down…"
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ---- backend ----
if curl -sf -o /dev/null http://localhost:8000/api/v1/health; then
  say "ML backend already running on :8000"
else
  say "starting ML backend on :8000"
  ( cd backend
    if [ -x .venv/bin/python ]; then PY=.venv/bin/python
    else PY=python3; fi
    if ! $PY -c "import fastapi" 2>/dev/null; then
      say "installing backend dependencies…"
      $PY -m pip install -q -r requirements.txt
    fi
    nohup $PY run.py > ../backend.log 2>&1 &
    echo $! > ../backend.pid )
  BACKEND_PID=$(cat backend.pid 2>/dev/null || true)
  for i in $(seq 1 20); do
    curl -sf -o /dev/null http://localhost:8000/api/v1/health && break
    sleep 1
  done
  curl -sf -o /dev/null http://localhost:8000/api/v1/health \
    && say "backend ready — http://localhost:8000  (docs: /docs)" \
    || say "WARNING: backend not healthy yet — check backend.log"
fi

# ---- frontend ----
if curl -sf -o /dev/null http://localhost:3000; then
  say "frontend already running on :3000"
else
  say "starting frontend on :3000"
  ( cd frontend
    command -v bun >/dev/null 2>&1 || { say "bun not found — install: https://bun.sh (or run 'npm run dev' manually)"; exit 1; }
    [ -d node_modules ] || { say "installing frontend dependencies (bun install)…"; bun install; }
    nohup bun run dev > ../frontend.log 2>&1 &
    echo $! > ../frontend.pid )
  FRONTEND_PID=$(cat frontend.pid 2>/dev/null || true)
  for i in $(seq 1 40); do
    curl -sf -o /dev/null http://localhost:3000 && break
    sleep 1
  done
  curl -sf -o /dev/null http://localhost:3000 \
    && say "frontend ready — http://localhost:3000" \
    || say "WARNING: frontend not up yet — check frontend.log"
fi

say "platform up. ML docs: http://localhost:8000/docs · UI: http://localhost:3000"
say "press Ctrl+C to stop both"

wait
