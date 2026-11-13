#!/usr/bin/env bash
# Assemble the f1-strategy-platform package from the sandbox project.
set -euo pipefail
ROOT=/home/z/my-project
PKG=$ROOT/package/f1-strategy-platform

rm -rf "$ROOT/package"
mkdir -p "$PKG"/{data,frontend,backend}

cd "$ROOT"

# ---------- root files ----------
cp README.md MERGE_GUIDE.md AGENT_MERGE_GUIDE.md MLOPS_PLAYBOOK.md API_REFERENCE.md "$PKG/"
cp .env.example dev.sh docker-compose.yml "$PKG/"
chmod +x "$PKG/dev.sh"
cp data/f1_strategy_dataset_v4.csv "$PKG/data/"

# ---------- backend ----------
cp -r backend/app backend/scripts backend/data backend/model_store \
      backend/run.py backend/requirements.txt backend/pyproject.toml \
      backend/README.md backend/Dockerfile backend/.env.example "$PKG/backend/"
find "$PKG/backend" -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
rm -rf "$PKG/backend/model_store/.staging"/* 2>/dev/null || true

# ---------- frontend ----------
mkdir -p "$PKG/frontend"
cp -r src public prisma scripts "$PKG/frontend/"
cp package.json bun.lock next.config.ts tsconfig.json eslint.config.mjs \
   postcss.config.mjs components.json tailwind.config.ts next-env.d.ts .gitignore \
   "$PKG/frontend/" 2>/dev/null || true

# heavy 3D-pipeline intermediates stay out (26 MB); the shipped Draco asset is public/models
rm -f "$PKG/frontend/scripts/f1_car_parts_raw.glb" "$PKG/frontend/scripts/f1_step1.glb"
# sandbox-only artifacts
rm -rf "$PKG/frontend/scripts/shots" "$PKG/frontend/scripts/centroids.pkl" \
       "$PKG/frontend/scripts/parts_meta.npy" "$PKG/frontend/scripts/f1_car_parts.glb" \
       "$PKG/frontend/scripts/f1_strategy_dataset_v4.csv" "$PKG/frontend/scripts/parts_verify.png"
# csv now lives at ../data (shared with backend scripts)
mkdir -p "$PKG/frontend/scripts"

# patch absolute sandbox paths → package-relative
for f in "$PKG/frontend/scripts/"*.py; do
  sed -i 's#/home/z/my-project/scripts/f1_strategy_dataset_v4.csv#../../data/f1_strategy_dataset_v4.csv#g' "$f"
  sed -i 's#/home/z/my-project/public#../public#g' "$f"
  sed -i 's#/home/z/my-project/scripts#.#g' "$f"
  sed -i 's#/home/z/my-project##g' "$f"
done

echo "package assembled at $PKG"
du -sh "$PKG"
