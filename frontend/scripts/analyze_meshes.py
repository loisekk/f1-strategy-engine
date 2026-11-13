#!/usr/bin/env python3
"""Analyze mega-meshes: image sizes + vertex distributions to plan the split."""
import sys

sys.path.insert(0, ".")
from glblib import Glb
import numpy as np

glb = Glb("/upload/f1_2022_generic.glb")
j = glb.json

print("=== IMAGES ===")
total_img = 0
for i, img in enumerate(j["images"]):
    bv = j["bufferViews"][img["bufferView"]]
    size = bv["byteLength"]
    total_img += size
    print(f"img[{i:2d}] mime={img.get('mimeType','?'):10s} size={size:10,d} bytes")
print(f"TOTAL image bytes: {total_img:,} ({total_img/1e6:.1f} MB)")

print("\n=== SAMPLER/TEXTURES ===")
for i, t in enumerate(j.get("textures", [])):
    print(f"tex[{i}] source=img[{t.get('source')}]")

def analyze_mesh(mesh_idx, label, nbins=24):
    arr = glb.mesh_arrays(mesh_idx)
    pos, idx = arr["pos"], arr["idx"]
    print(f"\n=== MESH {mesh_idx} ({label}) verts={len(pos)} tris={len(idx)//3} ===")
    # per-Y-bin stats: z-range and x-range
    y = pos[:, 1]
    ymin, ymax = y.min(), y.max()
    # triangle centroids
    tri = pos[idx.reshape(-1, 3)]
    cent = tri.mean(axis=1)
    cy, cz, cx = cent[:, 1], cent[:, 2], cent[:, 0]
    print(f"{'Y-range':>22s} {'tris':>7s} {'zmin':>6s} {'zmax':>6s} {'xmin':>6s} {'xmax':>6s}")
    bins = np.linspace(ymin, ymax, nbins + 1)
    for b in range(nbins):
        sel = (cy >= bins[b]) & (cy < bins[b + 1])
        n = sel.sum()
        if n == 0:
            continue
        print(
            f"[{bins[b]:7.2f},{bins[b+1]:7.2f}) {n:7d} {cz[sel].min():6.2f} {cz[sel].max():6.2f} "
            f"{cx[sel].min():6.2f} {cx[sel].max():6.2f}"
        )

analyze_mesh(4, "Livery_Wings mega")
analyze_mesh(18, "carbon mega", nbins=20)
analyze_mesh(10, "Livery body", nbins=16)
analyze_mesh(22, "chrome", nbins=16)
analyze_mesh(14, "rims (all 4)", nbins=12)
