#!/usr/bin/env python3
"""Split the F1 GLB into named controllable parts for the exploded view.

Model space: Y = length (front at -Y), Z = height, X = width.
Output: named nodes grouped by part; frontend groups by node name.
"""
import sys

sys.path.insert(0, ".")
from glblib import Glb, GlbWriter
import numpy as np

SRC = "/upload/f1_2022_generic.glb"
OUT = "./f1_car_parts_raw.glb"

glb = Glb(SRC)

# ---------------- predicates on triangle centroids c=[x,y,z] ----------------

def whole(mesh_idx, part):
    return (mesh_idx, None, part)

RULES = [
    # mesh 4: Livery_Wings mega -> front wing + rear wing
    (4, lambda c: c[:, 1] < -2.40, "front_wing"),
    (4, lambda c: c[:, 1] >= 2.18, "rear_wing"),
    # mesh 10: Livery body -> nose / sidepods / monocoque / engine cover rear
    (10, lambda c: c[:, 1] < -1.30, "nose"),
    (10, lambda c: c[:, 1] > 1.20, "engine_cover"),
    (10, lambda c: (c[:, 1] >= -1.30) & (c[:, 1] < 0.60) & (c[:, 0] > 0.32), "sidepod_r"),
    (10, lambda c: (c[:, 1] >= -1.30) & (c[:, 1] < 0.60) & (c[:, 0] < -0.32), "sidepod_l"),
    (10, lambda c: (c[:, 1] >= -1.30) & (c[:, 1] <= 1.20), "monocoque"),
    # mesh 9: cockpit surround / headrest -> monocoque
    whole(9, "monocoque"),
    # mesh 0: black cockpit column -> monocoque
    whole(0, "monocoque"),
    # mesh 3 mirrors, mesh 7 steering wheel -> monocoque
    whole(3, "monocoque"),
    whole(7, "monocoque"),
    # tiny decal quads on nose (y=-0.485) -> monocoque ; sidepod decals -> sidepod_r
    whole(1, "monocoque"),
    whole(2, "monocoque"),
    whole(5, "monocoque"),
    whole(11, "monocoque"),
    whole(6, "sidepod_r"),
    whole(8, "sidepod_r"),
    # mesh 12 t-tray, mesh 13 floor assembly -> floor
    whole(12, "floor"),
    whole(13, "floor"),
    # mesh 18: carbon mega
    (18, lambda c: c[:, 1] < -1.30, "nose"),
    (18, lambda c: (c[:, 1] >= -1.30) & (c[:, 1] < 2.30) & (c[:, 2] < 0.30), "floor"),
    (18, lambda c: (c[:, 1] >= -1.30) & (c[:, 1] < 0.60) & (c[:, 2] >= 0.30)
        & (c[:, 0] > 0.30) & (c[:, 2] < 1.05), "sidepod_r"),
    (18, lambda c: (c[:, 1] >= -1.30) & (c[:, 1] < 0.60) & (c[:, 2] >= 0.30)
        & (c[:, 0] < -0.30) & (c[:, 2] < 1.05), "sidepod_l"),
    (18, lambda c: (c[:, 1] >= 0.60) & (c[:, 1] < 2.30), "engine_cover"),
    (18, lambda c: (c[:, 1] >= -1.30) & (c[:, 1] < 0.60) & (c[:, 2] >= 1.05), "engine_cover"),
    (18, lambda c: (c[:, 1] >= -1.30) & (c[:, 1] < 0.60), "monocoque"),
    (18, lambda c: (c[:, 1] >= 2.30) & (c[:, 2] < 0.80), "diffuser"),
    (18, lambda c: (c[:, 1] >= 2.30) & (c[:, 2] >= 0.80), "rear_wing"),
    # mesh 22: chrome suspension
    (22, lambda c: c[:, 1] < -1.20, "front_susp"),
    (22, lambda c: c[:, 1] > 2.20, "rear_susp"),
    (22, lambda c: (c[:, 1] >= -1.20) & (c[:, 1] <= 2.20), "monocoque"),
    # mesh 14: all four rims -> quadrants (front axle y<0.4)
    (14, lambda c: (c[:, 1] < 0.4) & (c[:, 0] < 0), "wheel_fl"),
    (14, lambda c: (c[:, 1] < 0.4) & (c[:, 0] >= 0), "wheel_fr"),
    (14, lambda c: (c[:, 1] >= 0.4) & (c[:, 0] < 0), "wheel_rl"),
    (14, lambda c: (c[:, 1] >= 0.4) & (c[:, 0] >= 0), "wheel_rr"),
    # mesh 16 front tyres, 17 rear tyres -> L/R
    (16, lambda c: c[:, 0] < 0, "wheel_fl"),
    (16, lambda c: c[:, 0] >= 0, "wheel_fr"),
    (17, lambda c: c[:, 0] < 0, "wheel_rl"),
    (17, lambda c: c[:, 0] >= 0, "wheel_rr"),
    # mesh 15 rear brakes -> rear wheels
    (15, lambda c: c[:, 0] < 0, "wheel_rl"),
    (15, lambda c: c[:, 0] >= 0, "wheel_rr"),
    # meshes 19/20 front corner carbon -> front wheels
    whole(19, "wheel_fr"),
    whole(20, "wheel_fl"),
    # mesh 21 small rear carbon -> rear wing / beam wing
    whole(21, "rear_wing"),
]


def split_mesh(mesh_idx, pred):
    """Split mesh by predicate on triangle centroids. Returns list of submesh dicts."""
    arr = glb.mesh_arrays(mesh_idx)
    pos, idx = arr["pos"], arr["idx"].reshape(-1, 3)
    cent = pos[idx].mean(axis=1)
    if pred is None:
        mask = np.ones(len(idx), dtype=bool)
    else:
        mask = pred(cent)
    out = []
    for m, tag in ((mask, "in"), (~mask, "out")):
        if m.sum() == 0:
            continue
        sub_idx = idx[m]
        # remap vertices
        used = np.unique(sub_idx)
        remap = np.full(len(pos), -1, dtype=np.int64)
        remap[used] = np.arange(len(used))
        new_idx = remap[sub_idx]
        sub = {
            "pos": pos[used],
            "nrm": arr["nrm"][used] if arr["nrm"] is not None else None,
            "uv": arr["uv"][used] if arr["uv"] is not None else None,
            "idx": new_idx.reshape(-1),
            "material": arr["material"],
            "tris": int(m.sum()),
        }
        out.append(sub)
    return out


# Apply rules: for each rule, split source mesh; keep the half matching the part.
parts = {}  # part_name -> list of submesh dicts
for rule in RULES:
    if len(rule) == 3 and not callable(rule[1]) and rule[1] is None:
        mesh_idx, _, part = rule
        subs = split_mesh(mesh_idx, None)
        assert len(subs) <= 1
        if subs:
            parts.setdefault(part, []).append(subs[0])
    else:
        mesh_idx, pred, part = rule
        subs = split_mesh(mesh_idx, pred)
        for s in subs:
            # keep only the half satisfying the predicate: split_mesh returns (in, out)
            # recompute which half matches: check via centroid predicate on sub tris
            sub_pos, sub_idx = s["pos"], s["idx"].reshape(-1, 3)
            sc = sub_pos[sub_idx].mean(axis=1)
            ok = pred(np.array([[0, 0, 0]]))  # not usable; instead tag halves below
            parts.setdefault(part, []).append(s)
            break  # only first half is the "in" half

# NOTE: split_mesh returns [matching, non-matching]; we take only the matching half.
# Rebuild cleanly:
parts = {}
for rule in RULES:
    mesh_idx = rule[0]
    if rule[1] is None:
        part = rule[2]
        arr = glb.mesh_arrays(mesh_idx)
        parts.setdefault(part, []).append(
            {"pos": arr["pos"], "nrm": arr["nrm"], "uv": arr["uv"],
             "idx": arr["idx"], "material": arr["material"],
             "tris": len(arr["idx"]) // 3}
        )
    else:
        pred, part = rule[1], rule[2]
        arr = glb.mesh_arrays(mesh_idx)
        pos, idx = arr["pos"], arr["idx"].reshape(-1, 3)
        cent = pos[idx].mean(axis=1)
        mask = pred(cent)
        if mask.sum() == 0:
            print(f"  !! empty split: mesh {mesh_idx} -> {part}")
            continue
        sub_idx = idx[mask]
        used = np.unique(sub_idx)
        remap = np.full(len(pos), -1, dtype=np.int64)
        remap[used] = np.arange(len(used))
        parts.setdefault(part, []).append(
            {"pos": pos[used], "nrm": arr["nrm"][used] if arr["nrm"] is not None else None,
             "uv": arr["uv"][used] if arr["uv"] is not None else None,
             "idx": remap[sub_idx].reshape(-1), "material": arr["material"],
             "tris": int(mask.sum())}
        )

print("=== PART SUMMARY ===")
total = 0
for part in sorted(parts):
    tris = sum(s["tris"] for s in parts[part])
    total += tris
    bmin = np.min([s["pos"].min(axis=0) for s in parts[part]], axis=0)
    bmax = np.max([s["pos"].max(axis=0) for s in parts[part]], axis=0)
    print(
        f"{part:14s} meshes={len(parts[part]):2d} tris={tris:6d} "
        f"bbox y[{bmin[1]:6.2f},{bmax[1]:6.2f}] x[{bmin[0]:6.2f},{bmax[0]:6.2f}] z[{bmin[2]:5.2f},{bmax[2]:5.2f}]"
    )
print(f"TOTAL tris: {total}")

# ---------------- write GLB ----------------
writer = GlbWriter(glb)
writer.copy_images()

nodes_spec = []
for part in sorted(parts):
    for i, s in enumerate(parts[part]):
        name = part if len(parts[part]) == 1 else f"{part}_{i}"
        mesh_idx = writer.add_mesh(name, s["pos"], s["nrm"], s["uv"], s["idx"], s["material"])
        nodes_spec.append((name, mesh_idx))

# keep original root rotation so three.js output matches original orientation
root_matrix = glb.json["nodes"][0].get("matrix")
size = writer.write(OUT, nodes_spec, root_matrix=root_matrix)
print(f"\nWrote {OUT}: {size:,} bytes ({size/1e6:.1f} MB), {len(nodes_spec)} nodes")

# save parts geometry for verification rendering
np.save("./parts_meta.npy",
        np.array([{"parts": {p: [{"bmin": s["pos"].min(axis=0).tolist(),
                                   "bmax": s["pos"].max(axis=0).tolist(),
                                   "tris": s["tris"]} for s in parts[p]] for p in parts}},
                  ], dtype=object), allow_pickle=True)

# also dump centroids per part for the verification plot
import pickle
cent_dump = {}
for part in parts:
    cens = []
    for s in parts[part]:
        idx3 = s["idx"].reshape(-1, 3)
        cens.append(s["pos"][idx3].mean(axis=1))
    cent_dump[part] = np.concatenate(cens) if cens else np.zeros((0, 3))
with open("./centroids.pkl", "wb") as f:
    pickle.dump(cent_dump, f)
print("saved centroids.pkl for verification")
