#!/usr/bin/env python3
"""Identify car parts by computing per-mesh bounding boxes from accessor min/max."""
import json
import struct

path = "/upload/f1_2022_generic.glb"

with open(path, "rb") as f:
    data = f.read()

magic, version, length = struct.unpack_from("<III", data, 0)
chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
gltf = json.loads(data[20 : 20 + chunk_len].decode("utf-8"))

accessors = gltf["accessors"]
meshes = gltf["meshes"]
materials = gltf["materials"]
nodes = gltf["nodes"]

# Node transforms: check if any node has translation/rotation/scale (besides root)
print("=== NODE TRANSFORMS ===")
for i, n in enumerate(nodes):
    for key in ("translation", "rotation", "scale", "matrix"):
        if key in n:
            print(f"node[{i}] {n.get('name')}: {key}={n[key]}")

print("\n=== MESH BOUNDING BOXES (accessor min/max, raw model space) ===")
rows = []
for i, m in enumerate(meshes):
    p = m["primitives"][0]
    pos_acc_idx = p["attributes"]["POSITION"]
    acc = accessors[pos_acc_idx]
    mn, mx = acc["min"], acc["max"]
    mat_idx = p.get("material", -1)
    mat_name = materials[mat_idx]["name"] if mat_idx >= 0 else "?"
    # which node uses this mesh
    node_name = next((n["name"] for n in nodes if n.get("mesh") == i), "?")
    size = [mx[k] - mn[k] for k in range(3)]
    center = [(mx[k] + mn[k]) / 2 for k in range(3)]
    rows.append((i, node_name, mat_name, mn, mx, size, center))
    print(
        f"mesh[{i:2d}] node={node_name:10s} mat={mat_name:16s} "
        f"min=[{mn[0]:8.3f},{mn[1]:8.3f},{mn[2]:8.3f}] max=[{mx[0]:8.3f},{mx[1]:8.3f},{mx[2]:8.3f}] "
        f"size=[{size[0]:7.3f},{size[1]:7.3f},{size[2]:7.3f}] center=[{center[0]:8.3f},{center[1]:8.3f},{center[2]:8.3f}]"
    )

# Overall bounds
all_mn = [min(r[3][k] for r in rows) for k in range(3)]
all_mx = [max(r[4][k] for r in rows) for k in range(3)]
print(f"\nOVERALL bounds: min={[round(x,2) for x in all_mn]} max={[round(x,2) for x in all_mx]}")
print(f"OVERALL size:   {[round(all_mx[k]-all_mn[k],2) for k in range(3)]}")
