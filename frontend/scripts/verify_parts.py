#!/usr/bin/env python3
"""Render part classification verification views (top / side / rear)."""
import pickle
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

with open("./centroids.pkl", "rb") as f:
    cent = pickle.load(f)

COLORS = {
    "front_wing": "#e10600", "nose": "#ff7a00", "monocoque": "#ffb000",
    "sidepod_l": "#00d26a", "sidepod_r": "#00b8d4", "engine_cover": "#7b61ff",
    "floor": "#8a8f98", "diffuser": "#ff4d6d", "rear_wing": "#e10600",
    "front_susp": "#ffe600", "rear_susp": "#ffe600",
    "wheel_fl": "#5aa9ff", "wheel_fr": "#5aa9ff", "wheel_rl": "#5aa9ff", "wheel_rr": "#5aa9ff",
}

fig, axes = plt.subplots(3, 1, figsize=(10, 22), facecolor="#111")
titles = [
    ("TOP  (x vs y)  — front of car at TOP", lambda p: (p[:, 1], p[:, 0]), (-4.0, 4.0), (-1.5, 1.5)),
    ("SIDE  (y vs z)", lambda p: (p[:, 1], p[:, 2]), (-4.0, 4.0), (-0.2, 1.7)),
    ("REAR  (x vs z)", lambda p: (p[:, 0], p[:, 2]), (-1.5, 1.5), (-0.2, 1.7)),
]
for ax, (title, proj, xlim, ylim) in zip(axes, titles):
    ax.set_facecolor("#181818")
    for part, pts in cent.items():
        if len(pts) == 0:
            continue
        # subsample
        if len(pts) > 12000:
            sel = np.random.RandomState(42).choice(len(pts), 12000, replace=False)
            pts = pts[sel]
        px, py = proj(pts)
        ax.scatter(px, py, s=0.6, c=COLORS.get(part, "#ffffff"), alpha=0.55, linewidths=0)
    ax.set_title(title, color="w", fontsize=11)
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_aspect("equal")
    ax.tick_params(colors="w", labelsize=7)
    for s in ax.spines.values():
        s.set_color("#444")

# legend
from matplotlib.lines import Line2D
handles = [Line2D([0], [0], marker="o", color="w", markerfacecolor=c, markersize=7, label=p)
           for p, c in COLORS.items()]
axes[0].legend(handles=handles, loc="upper left", fontsize=7, facecolor="#222",
               labelcolor="w", ncol=2)
plt.tight_layout()
plt.savefig("./parts_verify.png", dpi=90)
print("saved parts_verify.png")
