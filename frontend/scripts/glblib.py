#!/usr/bin/env python3
"""Minimal GLB reader/writer with numpy support for mesh splitting."""
import json
import struct
import numpy as np

COMPONENT_SIZES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
COMPONENT_NUM = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
DTYPES = {
    5120: np.int8, 5121: np.uint8, 5122: np.int16,
    5123: np.uint16, 5125: np.uint32, 5126: np.float32,
}


class Glb:
    def __init__(self, path):
        with open(path, "rb") as f:
            self.raw = f.read()
        magic, version, length = struct.unpack_from("<III", self.raw, 0)
        assert magic == 0x46546C67, "not a glb"
        self.length = length
        json_len, _ = struct.unpack_from("<II", self.raw, 12)
        self.json = json.loads(self.raw[20 : 20 + json_len].decode("utf-8"))
        self.bin_header_off = 20 + json_len
        bin_len, _ = struct.unpack_from("<II", self.raw, self.bin_header_off)
        self.bin = self.raw[self.bin_header_off + 8 : self.bin_header_off + 8 + bin_len]

    def accessor_data(self, acc_idx):
        """Return numpy array for accessor (supports only buffer 0 = BIN)."""
        acc = self.json["accessors"][acc_idx]
        bv = self.json["bufferViews"][acc["bufferView"]]
        comp_type = acc["componentType"]
        n_comp = COMPONENT_NUM[acc["type"]]
        dtype = DTYPES[comp_type]
        count = acc["count"]
        offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = bv.get("byteStride", 0)
        item_size = COMPONENT_SIZES[comp_type] * n_comp
        if stride == 0 or stride == item_size:
            arr = np.frombuffer(self.bin, dtype=dtype, count=count * n_comp, offset=offset)
        else:
        # strided: gather per element
            arr = np.empty(count * n_comp, dtype=dtype)
            for i in range(count):
                off = offset + i * stride
                arr[i * n_comp : (i + 1) * n_comp] = np.frombuffer(
                    self.bin, dtype=dtype, count=n_comp, offset=off
                )
        return arr.reshape(count, n_comp) if n_comp > 1 else arr.reshape(count, n_comp)

    def mesh_arrays(self, mesh_idx):
        """Extract positions, normals, uvs, indices for first primitive."""
        m = self.json["meshes"][mesh_idx]
        p = m["primitives"][0]
        pos = self.accessor_data(p["attributes"]["POSITION"]).astype(np.float32)
        nrm = (
            self.accessor_data(p["attributes"]["NORMAL"]).astype(np.float32)
            if "NORMAL" in p["attributes"] else None
        )
        uv = (
            self.accessor_data(p["attributes"]["TEXCOORD_0"]).astype(np.float32)
            if "TEXCOORD_0" in p["attributes"] else None
        )
        idx = self.accessor_data(p["indices"]).astype(np.uint32).reshape(-1)
        mat = p.get("material", None)
        return {"pos": pos, "nrm": nrm, "uv": uv, "idx": idx, "material": mat}


class GlbWriter:
    """Builds a new GLB: copies images/materials from a source Glb, adds new meshes."""

    def __init__(self, src: Glb):
        self.src = src
        self.bin = bytearray()
        self.buffer_views = []  # list of dicts
        self.accessors = []
        self.meshes = []
        self.images_copied = False

    def _add_bin(self, data: bytes, alignment=4):
        # align
        while len(self.bin) % alignment != 0:
            self.bin += b"\x00"
        off = len(self.bin)
        self.bin += data
        return off

    def copy_images(self):
        """Copy image bufferViews + textures + images + materials verbatim."""
        j = self.src.json
        self.image_bv_map = {}
        for img_idx, img in enumerate(j.get("images", [])):
            if "bufferView" in img:
                bv_idx = img["bufferView"]
                bv = j["bufferViews"][bv_idx]
                off = self._add_bin(
                    self.src.bin[bv["byteOffset"] : bv["byteOffset"] + bv["byteLength"]],
                    alignment=4,
                )
                self.image_bv_map[bv_idx] = len(self.buffer_views)
                self.buffer_views.append(
                    {"buffer": 0, "byteOffset": off, "byteLength": bv["byteLength"]}
                )
            else:
                raise ValueError("external image uri not supported")
        self.images = []
        for img in j.get("images", []):
            new_img = dict(img)
            new_img["bufferView"] = self.image_bv_map[img["bufferView"]]
            self.images.append(new_img)
        self.textures = j.get("textures", [])
        self.materials = j.get("materials", [])

    def replace_image_data(self, img_idx, new_bytes, new_mime):
        """Replace bytes of a copied image (same bufferView slot)."""
        bv_idx = self.images[img_idx]["bufferView"]
        bv = self.buffer_views[bv_idx]
        # ensure capacity region: we re-add and remap
        off = self._add_bin(new_bytes, alignment=4)
        self.buffer_views[bv_idx] = {
            "buffer": 0,
            "byteOffset": off,
            "byteLength": len(new_bytes),
        }
        self.images[img_idx]["mimeType"] = new_mime

    def _add_accessor(self, arr, target, normalized=False):
        """arr: numpy 2D (count, ncomp) or 1D for SCALAR. Returns accessor idx."""
        flat = np.ascontiguousarray(arr.reshape(-1))
        dtype = flat.dtype
        comp_type = {np.dtype(np.float32): 5126, np.dtype(np.uint32): 5125}.get(dtype)
        if comp_type is None:
            raise ValueError(f"unsupported dtype {dtype}")
        n_comp = arr.shape[1] if arr.ndim == 2 else 1
        typ = {1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4"}[n_comp]
        data = flat.tobytes()
        off = self._add_bin(data, alignment=4)
        bv_idx = len(self.buffer_views)
        self.buffer_views.append(
            {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        )
        acc = {
            "bufferView": bv_idx,
            "componentType": comp_type,
            "count": arr.shape[0] if arr.ndim == 2 else arr.shape[0],
            "type": typ,
        }
        if typ == "SCALAR":
            acc["min"] = [int(flat.min())]
            acc["max"] = [int(flat.max())]
        elif typ == "VEC3":
            a2 = arr.reshape(-1, 3)
            acc["min"] = [float(a2[:, k].min()) for k in range(3)]
            acc["max"] = [float(a2[:, k].max()) for k in range(3)]
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def add_mesh(self, name, pos, nrm, uv, idx, material_idx):
        pos = np.ascontiguousarray(pos, dtype=np.float32)
        idx = np.ascontiguousarray(idx, dtype=np.uint32)
        if nrm is not None:
            nrm = np.ascontiguousarray(nrm, dtype=np.float32)
        if uv is not None:
            uv = np.ascontiguousarray(uv, dtype=np.float32)
        attrs = {"POSITION": self._add_accessor(pos, "POSITION")}
        if nrm is not None:
            attrs["NORMAL"] = self._add_accessor(nrm, "NORMAL")
        if uv is not None:
            attrs["TEXCOORD_0"] = self._add_accessor(uv, "TEXCOORD_0")
        idx_acc = self._add_accessor(idx.reshape(-1, 1), "indices")
        prim = {"attributes": attrs, "indices": idx_acc, "mode": 4}
        if material_idx is not None:
            prim["material"] = material_idx
        self.meshes.append({"name": name, "primitives": [prim]})
        return len(self.meshes) - 1

    def write(self, path, nodes_spec, root_matrix=None):
        """nodes_spec: list of (node_name, mesh_idx) flat under root."""
        nodes = []
        for name, mesh_idx in nodes_spec:
            nodes.append({"name": name, "mesh": mesh_idx})
        root_children = list(range(len(nodes)))
        root = {"name": "root", "children": root_children}
        if root_matrix is not None:
            root["matrix"] = root_matrix
        scene = {"name": "Scene", "nodes": [len(nodes)]}
        gltf = {
            "asset": {
                "version": "2.0",
                "generator": "f1-strategy-engine pipeline",
                "extras": self.src.json.get("asset", {}).get("extras", {}),
            },
            "scene": 0,
            "scenes": [scene],
            "nodes": nodes + [root],
            "meshes": self.meshes,
            "accessors": self.accessors,
            "bufferViews": self.buffer_views,
            "buffers": [{"byteLength": len(self.bin)}],
            "materials": self.materials,
            "textures": self.textures,
            "images": self.images,
            "samplers": self.src.json.get("samplers", []),
        }
        json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        # pad json to 4
        json_pad = (4 - len(json_bytes) % 4) % 4
        json_bytes += b" " * json_pad
        bin_bytes = bytes(self.bin)
        bin_pad = (4 - len(bin_bytes) % 4) % 4
        bin_bytes += b"\x00" * bin_pad
        total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
        out = struct.pack("<III", 0x46546C67, 2, total)
        out += struct.pack("<II", len(json_bytes), 0x4E4F534A)
        out += json_bytes
        out += struct.pack("<II", len(bin_bytes), 0x004E4942)
        out += bin_bytes
        with open(path, "wb") as f:
            f.write(out)
        return total
