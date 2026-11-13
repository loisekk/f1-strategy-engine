#!/usr/bin/env python3
"""Inspect GLB structure: nodes, meshes, materials, hierarchy, sizes."""
import json
import struct
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "/upload/f1_2022_generic.glb"

with open(path, "rb") as f:
    data = f.read()

magic, version, length = struct.unpack_from("<III", data, 0)
print(f"GLB magic: {magic:#x} version: {version} total length: {length:,}")
assert magic == 0x46546C67, "Not a GLB file"

# JSON chunk
chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
json_data = json.loads(data[20 : 20 + chunk_len].decode("utf-8"))
print(f"JSON chunk: {chunk_len:,} bytes")

bin_offset = 20 + chunk_len
if bin_offset + 8 <= length:
    bin_len, bin_type = struct.unpack_from("<II", data, bin_offset)
    print(f"BIN chunk: {bin_len:,} bytes")

gltf = json_data

# Asset info
print("\n=== ASSET ===")
print(json.dumps(gltf.get("asset", {}), indent=2))

print("extensionsUsed:", gltf.get("extensionsUsed", []))
print("extensionsRequired:", gltf.get("extensionsRequired", []))

# Counters
print("\n=== COUNTERS ===")
print(f"scenes: {len(gltf.get('scenes', []))}")
print(f"nodes: {len(gltf.get('nodes', []))}")
print(f"meshes: {len(gltf.get('meshes', []))}")
print(f"materials: {len(gltf.get('materials', []))}")
print(f"textures: {len(gltf.get('textures', []))}")
print(f"images: {len(gltf.get('images', []))}")
print(f"accessors: {len(gltf.get('accessors', []))}")
print(f"animations: {len(gltf.get('animations', []))}")
print(f"skins: {len(gltf.get('skins', []))}")

# Mesh details
print("\n=== MESHES ===")
accessors = gltf.get("accessors", [])
for i, m in enumerate(gltf.get("meshes", [])):
    prims = m.get("primitives", [])
    vcounts = []
    total_indices = 0
    for p in prims:
        pos_acc = p.get("attributes", {}).get("POSITION")
        idx_acc = p.get("indices")
        vc = accessors[pos_acc]["count"] if pos_acc is not None else 0
        ic = accessors[idx_acc]["count"] if idx_acc is not None else 0
        vcounts.append(vc)
        total_indices += ic
    print(f"[{i:3d}] {m.get('name','(unnamed)')!r:50s} prims={len(prims)} verts={vcounts} indices={total_indices:,}")

# Materials
print("\n=== MATERIALS (first 40) ===")
for i, mat in enumerate(gltf.get("materials", [])[:40]):
    pbr = mat.get("pbrMetallicRoughness", {})
    base = pbr.get("baseColorFactor", "-")
    metal = pbr.get("metallicFactor", "-")
    rough = pbr.get("roughnessFactor", "-")
    tex = "TEX" if pbr.get("baseColorTexture") else "   "
    print(f"[{i:3d}] {mat.get('name','(unnamed)')!r:45s} {tex} base={base} m={metal} r={rough}")

# Node hierarchy
print("\n=== NODE HIERARCHY (scene 0) ===")
nodes = gltf.get("nodes", [])
scene = gltf.get("scenes", [{}])[0]
root_nodes = scene.get("nodes", [])

def node_summary(ni, depth=0, max_depth=2):
    n = nodes[ni]
    name = n.get("name", "(unnamed)")
    mesh = n.get("mesh")
    children = n.get("children", [])
    t = n.get("translation", None)
    r = n.get("rotation", None)
    s = n.get("scale", None)
    extras = []
    if mesh is not None:
        mname = gltf["meshes"][mesh].get("name", "?")
        extras.append(f"mesh={mesh}:{mname}")
    if t: extras.append(f"t={[round(x,3) for x in t]}")
    if r: extras.append(f"r={[round(x,3) for x in r]}")
    if s: extras.append(f"s={[round(x,3) for x in s]}")
    if depth <= max_depth:
        print("  " * depth + f"- [{ni}] {name} {' '.join(extras)}")
    for c in children:
        node_summary(c, depth + 1, max_depth)

for rn in root_nodes:
    node_summary(rn, 0, 2)

# Full flat node list
print("\n=== ALL NODES (flat) ===")
for i, n in enumerate(nodes):
    mesh = n.get("mesh")
    mname = ""
    if mesh is not None:
        mname = f" MESH({gltf['meshes'][mesh].get('name','?')})"
    print(f"[{i:3d}] {n.get('name','(unnamed)')!r:50s} children={n.get('children', [])}{mname}")
