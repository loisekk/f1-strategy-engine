#!/usr/bin/env python3
"""Build all frontend data files from the real f1_strategy_dataset_v4.csv
+ f1-circuits.geojson.

Outputs to ../public/data/:
  races.json              — race index
  races/{slug}.json       — per-race replay data (laps, stints, circuit path)
  tyres.json              — empirical degradation curves + pit probabilities + pit loss
  drivers.json            — per-driver aggregates
"""
import csv
import json
import math
import os
from collections import defaultdict

import numpy as np

csv.field_size_limit(10**9)

CSV_PATH = "../../data/f1_strategy_dataset_v4.csv"
CIRCUITS_PATH = "./f1-circuits.geojson"
OUT_DIR = "../public/data"
RACE_DIR = os.path.join(OUT_DIR, "races")
os.makedirs(RACE_DIR, exist_ok=True)

COMPOUNDS = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"]
COMPOUND_IDX = {c: i for i, c in enumerate(COMPOUNDS)}

CIRCUIT_MAP = {
    "Australian Grand Prix": "Albert Park Circuit",
    "Austrian Grand Prix": "Red Bull Ring",
    "Azerbaijan Grand Prix": "Baku City Circuit",
    "Bahrain Grand Prix": "Bahrain International Circuit",
    "Belgian Grand Prix": "Circuit de Spa-Francorchamps",
    "British Grand Prix": "Silverstone Circuit",
    "Canadian Grand Prix": "Circuit Gilles-Villeneuve",
    "Dutch Grand Prix": "Circuit Zandvoort",
    "Hungarian Grand Prix": "Hungaroring",
    "Italian Grand Prix": "Autodromo Nazionale Monza",
    "Japanese Grand Prix": "Suzuka International Racing Course",
    "Mexico City Grand Prix": "Autódromo Hermanos Rodríguez",
    "Miami Grand Prix": "Miami International Autodrome",
    "Monaco Grand Prix": "Circuit de Monaco",
    "Saudi Arabian Grand Prix": "Jeddah Corniche Circuit",
    "Singapore Grand Prix": "Marina Bay Street Circuit",
    "Spanish Grand Prix": "Circuit de Barcelona-Catalunya",
    "United States Grand Prix": "Circuit of the Americas",
    "Emilia Romagna Grand Prix": "Autodromo Enzo e Dino Ferrari",
    "French Grand Prix": "Circuit Paul Ricard",
    "Pre-Season Test": "Circuit de Barcelona-Catalunya",
    "Pre-Season Track Session": "Bahrain International Circuit",
    "Abu Dhabi Grand Prix": "Yas Marina Circuit",
    "Las Vegas Grand Prix": "Las Vegas Street Circuit",
    "Pre-Season Testing": "Bahrain International Circuit",
    "Qatar Grand Prix": "Losail International Circuit",
    "São Paulo Grand Prix": "Autódromo José Carlos Pace - Interlagos",
    "Chinese Grand Prix": "Shanghai International Circuit",
}

# Driver metadata (2022 grid confident; others minimal — no fabricated teams)
DRIVERS_2022 = {
    "VER": ("Max Verstappen", "Red Bull Racing"),
    "PER": ("Sergio Pérez", "Red Bull Racing"),
    "LEC": ("Charles Leclerc", "Ferrari"),
    "SAI": ("Carlos Sainz", "Ferrari"),
    "HAM": ("Lewis Hamilton", "Mercedes"),
    "RUS": ("George Russell", "Mercedes"),
    "NOR": ("Lando Norris", "McLaren"),
    "RIC": ("Daniel Ricciardo", "McLaren"),
    "ALO": ("Fernando Alonso", "Alpine"),
    "OCO": ("Esteban Ocon", "Alpine"),
    "BOT": ("Valtteri Bottas", "Alfa Romeo"),
    "ZHO": ("Zhou Guanyu", "Alfa Romeo"),
    "VET": ("Sebastian Vettel", "Aston Martin"),
    "STR": ("Lance Stroll", "Aston Martin"),
    "MAG": ("Kevin Magnussen", "Haas"),
    "MSC": ("Mick Schumacher", "Haas"),
    "SCHU": ("Mick Schumacher", "Haas"),
    "ALB": ("Alexander Albon", "Williams"),
    "LAT": ("Nicholas Latifi", "Williams"),
    "HUL": ("Nico Hülkenberg", "Aston Martin"),
}
DRIVERS_2025 = {
    "VER": ("Max Verstappen", None),
    "NOR": ("Lando Norris", None),
    "PIA": ("Oscar Piastri", None),
    "LEC": ("Charles Leclerc", None),
    "HAM": ("Lewis Hamilton", None),
    "RUS": ("George Russell", None),
    "ANT": ("Kimi Antonelli", None),
    "ALO": ("Fernando Alonso", None),
    "SAI": ("Carlos Sainz", None),
    "ALB": ("Alexander Albon", None),
    "GAS": ("Pierre Gasly", None),
    "OCO": ("Esteban Ocon", None),
    "BEA": ("Oliver Bearman", None),
    "HUL": ("Nico Hülkenberg", None),
    "BOR": ("Gabriel Bortoleto", None),
    "LAW": ("Liam Lawson", None),
    "HAD": ("Isack Hadjar", None),
    "TSU": ("Yuki Tsunoda", None),
    "DOO": ("Jack Doohan", None),
    "STR": ("Lance Stroll", None),
    "PER": ("Sergio Pérez", None),
    "COL": ("Franco Colapinto", None),
}


def slugify(s):
    s = s.lower().replace(" grand prix", "").strip()
    s = "".join(ch if ch.isalnum() else "-" for ch in s)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")


# ---------------- load circuits ----------------
with open(CIRCUITS_PATH) as f:
    circuits_geo = json.load(f)

circuit_features = {ft["properties"]["Name"]: ft for ft in circuits_geo["features"]}


def circuit_path(name, n_points=220, box=1000.0):
    """Convert lon/lat LineString to normalized [x,y] pixel path."""
    ft = circuit_features[name]
    coords = ft["geometry"]["coordinates"]
    lon0, lat0 = coords[0]
    pts = []
    for lon, lat in coords:
        x = (lon - lon0) * math.cos(math.radians(lat0)) * 111320.0
        y = (lat - lat0) * 110540.0
        pts.append((x, y))
    # resample by arc length (handle closed loop)
    seglens = [math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    total = sum(seglens)
    densified = [pts[0]]
    acc = 0.0
    step = total / n_points
    target = step
    for i, L in enumerate(seglens):
        a = pts[i]
        b = pts[(i + 1) % len(pts)]
        while acc + L >= target and L > 0:
            t = (target - acc) / L
            densified.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            target += step
        acc += L
    pts = densified[:n_points]
    # fit to box preserving aspect
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    scale = box * 0.92 / max(w, h)
    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2
    norm = [
        [round(500 + (x - cx) * scale, 1), round(500 - (y - cy) * scale, 1)]
        for x, y in pts
    ]  # y flip for svg
    return norm, round(total, 0)


# ---------------- load laps ----------------
races_data = defaultdict(lambda: defaultdict(list))  # race -> driver -> rows
with open(CSV_PATH, newline="") as f:
    reader = csv.DictReader(f)
    for r in reader:
        race_key = (r["Race"], r["Year"])
        races_data[race_key][r["Driver"]].append(r)

race_index = []
tyre_samples = defaultdict(lambda: defaultdict(list))  # compound -> tyrelife -> [deltas]
pit_at_tyrelife = defaultdict(lambda: defaultdict(lambda: [0, 0]))  # compound -> tyrelife -> [pits, laps]
pit_deltas = []
driver_agg = defaultdict(lambda: {
    "races": set(), "laps": 0, "pos_sum": 0, "pos_n": 0, "best_finish": 99,
    "wins": 0, "podiums": 0, "dnfs": 0, "finish_sum": 0, "finish_n": 0,
    "pits": 0, "pace_deltas": [], "stint_lengths": [], "compounds": defaultdict(int),
})

for (race_name, year), drivers in sorted(
    races_data.items(), key=lambda kv: (kv[0][1], kv[0][0])
):
    year = int(year)
    slug = f"{slugify(race_name)}-{year}"
    is_test = "pre-season" in race_name.lower() or "track session" in race_name.lower()
    circuit_name = CIRCUIT_MAP.get(race_name)
    if circuit_name is None:
        print(f"  !! no circuit for {race_name}; skipping")
        continue

    # parse driver laps
    parsed = {}
    race_laps = 0
    for code, rows in drivers.items():
        laps = []
        for r in rows:
            try:
                ln = int(float(r["LapNumber"]))
                pos = int(float(r["Position"])) if r["Position"] not in ("", "None") else None
                lt = float(r["LapTime (s)"]) if r["LapTime (s)"] not in ("", "None") else None
                stint = int(float(r["Stint"])) if r["Stint"] not in ("", "None") else 0
            except ValueError:
                continue
            comp = COMPOUND_IDX.get(r["Compound"], 5)
            try:
                tl = int(float(r["TyreLife"]))
            except ValueError:
                tl = 0
            laps.append((ln, pos, lt, comp, tl, stint))
        if not laps:
            continue
        laps.sort(key=lambda x: x[0])
        # derive TRUE pit events from stint breaks (PitStop flag is a window marker,
        # not an event marker — validated against stint increments: 6.5% precision)
        fixed = []
        prev_stint = None
        prev_tl = 0
        for i, (ln, pos, lt, comp, tl, stint) in enumerate(laps):
            is_pit = 1 if (prev_stint is not None and stint > prev_stint) else 0
            if is_pit:
                tlife = 1
            else:
                tlife = tl if tl > 0 else prev_tl + 1
            fixed.append((ln, pos, lt, comp, tlife, is_pit, stint))
            prev_stint = stint
            prev_tl = tlife
        parsed[code] = fixed
        race_laps = max(race_laps, fixed[-1][0])

    # driver baseline (median non-pit, non-first-lap time) for deltas
    baselines = {}
    for code, laps in parsed.items():
        times = [l[2] for l in laps if l[2] and l[0] > 1 and l[5] == 0]
        baselines[code] = float(np.median(times)) if times else None

    # build driver entries
    driver_entries = []
    for code, laps in parsed.items():
        base = baselines[code]
        stint_bounds = []
        stint_compound = []
        stint_start = 1
        stint_c = laps[0][3]
        lap_records = []
        for i, (ln, pos, lt, comp, tl, pit, stint) in enumerate(laps):
            if i > 0 and laps[i - 1][5] == 1:
                stint_bounds.append((stint_start, laps[i - 1][0]))
                stint_compound.append(stint_c)
                stint_start = ln
                stint_c = comp
            lap_records.append([
                pos if pos is not None else 0,
                int(round((lt or 0) * 10)),
                comp,
                tl,
                pit,
            ])
            # tyre curve samples (clean non-pit laps)
            if base and lt and ln > 1 and pit == 0 and comp < 5:
                delta = lt - base
                if abs(delta) < base * 0.25:  # exclude SC/VSC-ish outliers
                    tyre_samples[comp][tl].append(delta)
        # second pass: pit prob (true next-lap stint break) + pit deltas
        for i, (ln, pos, lt, comp, tl, pit, stint) in enumerate(laps):
            if comp < 5 and i + 1 < len(laps):
                next_pit = laps[i + 1][5]
                rec = pit_at_tyrelife[comp][tl]
                rec[1] += 1
                if next_pit == 1:
                    rec[0] += 1
            if pit == 1 and base and lt:
                pit_deltas.append(lt - base)

        stint_bounds.append((stint_start, laps[-1][0]))
        stint_compound.append(stint_c)

        laps_completed = laps[-1][0]
        finish_pos = laps[-1][1]
        status = "FIN" if laps_completed >= race_laps - 1 else "DNF"

        # driver aggregates
        agg = driver_agg[code]
        agg["races"].add((race_name, year))
        agg["laps"] += len(laps)
        for _, pos, *_ in laps:
            if pos:
                agg["pos_sum"] += pos
                agg["pos_n"] += 1
        if status == "FIN" and finish_pos:
            agg["best_finish"] = min(agg["best_finish"], finish_pos)
            agg["finish_sum"] += finish_pos
            agg["finish_n"] += 1
            if finish_pos == 1:
                agg["wins"] += 1
            if finish_pos <= 3:
                agg["podiums"] += 1
        else:
            agg["dnfs"] += 1
        agg["pits"] += sum(1 for l in laps if l[5] == 1)
        if base:
            for ln, pos, lt, comp, tl, pit, stint in laps:
                if lt and ln > 1 and pit == 0 and abs(lt - base) < base * 0.25:
                    agg["pace_deltas"].append(lt - base)
        for a, b in stint_bounds:
            if b - a + 1 >= 3:
                agg["stint_lengths"].append(b - a + 1)
        for c in stint_compound:
            agg["compounds"][COMPOUNDS[c] if c < 5 else "UNKNOWN"] += 1

        meta = (DRIVERS_2022 if year == 2022 else DRIVERS_2025).get(code, (None, None))
        driver_entries.append({
            "code": code,
            "name": meta[0],
            "team": meta[1],
            "laps": lap_records,
            "stints": [
                {"c": c, "from": a, "to": b}
                for (a, b), c in zip(stint_bounds, stint_compound)
            ],
            "status": status,
            "lapsCompleted": laps_completed,
            "finishPos": finish_pos or 99,
        })

    # sort drivers by finishing order
    driver_entries.sort(key=lambda d: (d["status"] != "FIN", d["finishPos"]))

    # race summary
    fastest = None
    leader_changes = 0
    prev_leader = None
    for ln in range(1, race_laps + 1):
        lead = None
        for d in driver_entries:
            idx = ln - 1
            if idx < len(d["laps"]):
                rec = d["laps"][idx]
                if rec[0] and (lead is None or rec[0] < lead[1]):
                    lead = (d["code"], rec[0])
        if lead:
            if prev_leader and lead[0] != prev_leader:
                leader_changes += 1
            prev_leader = lead[0]
    for d in driver_entries:
        for i, rec in enumerate(d["laps"]):
            lt = rec[1] / 10
            ln = i + 1
            if lt > 30 and ln > 1:  # plausible flying lap
                if fastest is None or lt < fastest["time"]:
                    fastest = {"driver": d["code"], "lap": ln, "time": round(lt, 3)}
    winner = driver_entries[0]["code"] if driver_entries and driver_entries[0]["status"] == "FIN" else None

    path, length_m = circuit_path(circuit_name)

    race_doc = {
        "id": slug,
        "name": race_name,
        "year": year,
        "isTest": is_test,
        "circuit": {"name": circuit_name, "lengthM": length_m, "path": path},
        "laps": race_laps,
        "compounds": COMPOUNDS,
        "summary": {
            "winner": winner,
            "fastestLap": fastest,
            "leaderChanges": leader_changes,
            "totalPits": sum(sum(1 for r in d["laps"] if r[4] == 1) for d in driver_entries),
        },
        "drivers": driver_entries,
    }
    with open(os.path.join(RACE_DIR, f"{slug}.json"), "w") as f:
        json.dump(race_doc, f, separators=(",", ":"))
    size_kb = os.path.getsize(os.path.join(RACE_DIR, f"{slug}.json")) / 1024
    race_index.append({
        "id": slug,
        "name": race_name,
        "year": year,
        "isTest": is_test,
        "circuit": circuit_name,
        "laps": race_laps,
        "drivers": len(driver_entries),
        "winner": winner,
        "fastestLap": fastest,
        "leaderChanges": leader_changes,
        "totalPits": race_doc["summary"]["totalPits"],
    })
    print(f"{slug:38s} laps={race_laps:3d} drivers={len(driver_entries):2d} {size_kb:7.1f} KB")

with open(os.path.join(OUT_DIR, "races.json"), "w") as f:
    json.dump({"races": sorted(race_index, key=lambda r: (r["year"], r["name"]))}, f, separators=(",", ":"))

# ---------------- tyre curves ----------------
curves = {}
for comp_idx in sorted(tyre_samples):
    life_to_delta = {}
    life_to_n = {}
    for life, deltas in sorted(tyre_samples[comp_idx].items()):
        if len(deltas) >= 25 and life <= 45:
            life_to_delta[str(life)] = round(float(np.median(deltas)), 3)
            life_to_n[str(life)] = len(deltas)
    pit_prob = {}
    for life, (pits, laps_total) in sorted(pit_at_tyrelife[comp_idx].items()):
        if laps_total >= 40 and life <= 45:
            pit_prob[str(life)] = round(pits / laps_total, 4)
    curves[COMPOUNDS[comp_idx]] = {
        "lapTimeDelta": life_to_delta,
        "samples": life_to_n,
        "pitProbability": pit_prob,
    }

tyre_doc = {
    "source": "f1_strategy_dataset_v4.csv — 101,371 laps (2022–2025). Median lap-time delta vs driver baseline, aggregated across all races.",
    "pitLossSeconds": round(float(np.median(pit_deltas)), 2),
    "pitLossSample": len(pit_deltas),
    "compounds": curves,
}
with open(os.path.join(OUT_DIR, "tyres.json"), "w") as f:
    json.dump(tyre_doc, f, separators=(",", ":"))
print(f"\ntyres.json: pit loss {tyre_doc['pitLossSeconds']}s from {len(pit_deltas)} pit laps")

# ---------------- drivers ----------------
drivers_out = []
for code, agg in driver_agg.items():
    if agg["pos_n"] < 50:
        continue
    drivers_out.append({
        "code": code,
        "name": (DRIVERS_2022.get(code) or DRIVERS_2025.get(code) or (None,))[0],
        "team": (DRIVERS_2022.get(code) or (None, None))[1],
        "races": len(agg["races"]),
        "laps": agg["laps"],
        "avgPosition": round(agg["pos_sum"] / agg["pos_n"], 2),
        "avgFinish": round(agg["finish_sum"] / agg["finish_n"], 2) if agg["finish_n"] else None,
        "bestFinish": agg["best_finish"] if agg["best_finish"] < 99 else None,
        "wins": agg["wins"],
        "podiums": agg["podiums"],
        "dnfs": agg["dnfs"],
        "pitsPerRace": round(agg["pits"] / max(1, len(agg["races"])), 2),
        "avgPaceDelta": round(float(np.mean(agg["pace_deltas"])), 3) if agg["pace_deltas"] else None,
        "avgStintLength": round(float(np.mean(agg["stint_lengths"])), 1) if agg["stint_lengths"] else None,
        "compoundMix": dict(agg["compounds"]),
    })
drivers_out.sort(key=lambda d: -(d["wins"] * 100 + d["podiums"] * 10 - d["avgPosition"]))
with open(os.path.join(OUT_DIR, "drivers.json"), "w") as f:
    json.dump({"source": "aggregated from f1_strategy_dataset_v4.csv", "drivers": drivers_out}, f, separators=(",", ":"))
print(f"drivers.json: {len(drivers_out)} drivers")
print("\nDONE")
