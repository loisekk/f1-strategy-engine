#!/usr/bin/env python3
"""Synthesize physics-based telemetry traces from real circuit geometry.

Quasi-steady lap simulation: curvature -> corner speed limits -> forward/backward
acceleration pass -> throttle/brake/gear/rpm channels. Two driving styles per
circuit (reference / attack). Clearly labelled as synthesised in the UI.

Output: ../public/data/telemetry.json
"""
import json
import math

import numpy as np

CIRCUITS_PATH = "./f1-circuits.geojson"
OUT = "../public/data/telemetry.json"

CIRCUITS = {
    "Autodromo Nazionale Monza": "monza",
    "Circuit de Monaco": "monaco",
    "Bahrain International Circuit": "bahrain",
    "Silverstone Circuit": "silverstone",
}

with open(CIRCUITS_PATH) as f:
    geo = json.load(f)
feats = {ft["properties"]["Name"]: ft for ft in geo["features"]}


def centerline_meters(name):
    coords = feats[name]["geometry"]["coordinates"]
    lon0, lat0 = coords[0]
    pts = np.array([
        [(lon - lon0) * math.cos(math.radians(lat0)) * 111320.0,
         (lat - lat0) * 110540.0]
        for lon, lat in coords
    ])
    return pts

def resample(pts, step=8.0):
    # close loop
    seg = np.diff(np.vstack([pts, pts[:1]]), axis=0)
    seglen = np.hypot(seg[:, 0], seg[:, 1])
    total = seglen.sum()
    n = int(total // step)
    out = []
    target = 0.0
    acc = 0.0
    i = 0
    while len(out) < n:
        while acc + seglen[i] < target:
            acc += seglen[i]
            i = (i + 1) % len(seglen)
        t = (target - acc) / max(seglen[i], 1e-9)
        p0 = pts[i % len(pts)]
        p1 = pts[(i + 1) % len(pts)]
        out.append(p0 + (p1 - p0) * t)
        target += step
    return np.array(out), total


def curvature(pts):
    n = len(pts)
    k = np.zeros(n)
    for i in range(n):
        a = pts[(i - 1) % n]
        b = pts[i % n]
        c = pts[(i + 1) % n]
        A = np.linalg.norm(b - a)
        B = np.linalg.norm(c - b)
        C = np.linalg.norm(c - a)
        area2 = abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]))
        denom = A * B * C
        k[i] = 2 * area2 / denom if denom > 1e-9 else 0.0
    # smooth curvature
    kernel = np.ones(5) / 5
    k = np.convolve(np.concatenate([k[-2:], k, k[:2]]), kernel, mode="same")[2:-2]
    return k


def simulate(pts, style):
    n = len(pts)
    ds = 8.0
    k = curvature(pts)
    if style == "attack":
        a_lat, a_brake, v_min, noise = 42.0, 50.0, 14.0, 0.006
    else:  # reference
        a_lat, a_brake, v_min, noise = 37.5, 44.0, 15.0, 0.004

    def a_accel(v):
        return np.minimum(11.0, 520.0 / max(v, 8.0))

    vcorner = np.sqrt(a_lat / np.maximum(k, 1e-6))
    vcorner = np.clip(vcorner, v_min, 95.0)
    # forward pass (acceleration limit)
    v = vcorner.copy()
    for i in range(1, 3 * n):
        j = i % n
        jp = (j - 1) % n
        v[j] = min(v[j], math.sqrt(v[jp] ** 2 + 2 * a_accel(v[jp]) * ds))
    # backward pass (braking limit)
    for i in range(3 * n - 1, -1, -1):
        j = i % n
        jn = (j + 1) % n
        v[j] = min(v[j], math.sqrt(v[jn] ** 2 + 2 * a_brake * ds))
    # noise
    rng = np.random.RandomState(7 if style == "attack" else 13)
    v = v * (1 + rng.randn(n) * noise)

    # channels
    throttle = np.zeros(n)
    brake = np.zeros(n)
    for i in range(n):
        jn = (i + 1) % n
        dv = v[jn] - v[i]
        if dv > 0.15:
            throttle[i] = 1.0
        elif dv < -0.35:
            brake[i] = 1.0
            throttle[i] = 0.0
        else:
            throttle[i] = 0.45 if v[i] > 0.85 * vcorner[i] else 0.25
    # gear: 8 gears up to ~360 km/h
    vmax_gears = np.array([15, 22, 30, 39, 49, 61, 76, 100])  # m/s upper bounds
    gear = np.ones(n, dtype=int)
    rpm = np.zeros(n)
    for i, vv in enumerate(v):
        g = int(np.searchsorted(vmax_gears, vv)) + 1
        g = max(1, min(8, g))
        gear[i] = g
        lo = vmax_gears[g - 2] if g > 1 else 9.0
        hi = vmax_gears[g - 1]
        frac = np.clip((vv - lo) / max(hi - lo, 1e-3), 0, 1)
        rpm[i] = 5200 + frac * 6300
    lap_time = ds / v.mean() * n  # rough
    # precise time: integrate ds/v
    t = np.cumsum(ds / np.maximum(v, 5.0))
    lap_time = t[-1] + ds / v[0]
    return {
        "speed": np.round(v * 3.6, 1).tolist(),       # km/h
        "throttle": np.round(throttle, 2).tolist(),
        "brake": np.round(brake, 2).tolist(),
        "gear": gear.tolist(),
        "rpm": np.round(rpm, 0).tolist(),
        "lapTimeS": round(float(lap_time), 2),
    }


out = {"circuits": {}}
for name, key in CIRCUITS.items():
    pts = centerline_meters(name)
    pts_r, total_r = resample(pts, 8.0)
    dist = [round(i * 8) for i in range(len(pts_r))]
    ref = simulate(pts_r, "reference")
    atk = simulate(pts_r, "attack")
    # sector splits (by time)
    t_ref = np.array(ref["lapTimeS"]) * 0  # placeholder
    out["circuits"][key] = {
        "name": name,
        "lengthM": round(total_r),
        "resolutionM": 8,
        "dist": dist,
        "laps": {
            "reference": ref,
            "attack": atk,
        },
        "note": "Synthesised quasi-steady lap simulation from circuit geometry (curvature-limited corner speeds, power-limited acceleration, braking-distance pass). Representative demo telemetry — not recorded car data.",
    }
    print(f"{key:12s} {name:35s} {total_r:6.0f}m  ref {ref['lapTimeS']:6.1f}s  atk {atk['lapTimeS']:6.1f}s")

out["source"] = "Circuit geometry: f1-circuits (bacinger/f1-circuits). Physics synthesis by f1-strategy-engine frontend pipeline."
with open(OUT, "w") as f:
    json.dump(out, f, separators=(",", ":"))
import os
print(f"wrote {OUT} ({os.path.getsize(OUT)//1024} KB)")
