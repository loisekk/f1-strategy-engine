#!/usr/bin/env python3
"""Analyze the F1 strategy dataset: races, drivers, laps, stints, pit stops."""
import csv
import sys
from collections import defaultdict

csv.field_size_limit(10**9)
path = "../../data/f1_strategy_dataset_v4.csv"

races = defaultdict(lambda: {"drivers": set(), "laps": 0, "year": None, "pit_laps": 0})
rows = 0
compounds = defaultdict(int)
drivers = set()

with open(path, newline="") as f:
    reader = csv.DictReader(f)
    for r in reader:
        rows += 1
        race = r["Race"]
        year = r["Year"]
        races[race]["drivers"].add(r["Driver"])
        races[race]["year"] = year
        ln = int(float(r["LapNumber"]))
        races[race]["laps"] = max(races[race]["laps"], ln)
        if r["PitStop"] == "1":
            races[race]["pit_laps"] += 1
        compounds[r["Compound"]] += 1
        drivers.add(r["Driver"])

print(f"Total rows: {rows:,}")
print(f"Unique races: {len(races)}")
print(f"Unique drivers: {len(drivers)}")
print(f"Compounds: {dict(compounds)}")
print()

for race, info in sorted(races.items(), key=lambda x: x[1]["year"] or ""):
    print(f"{info['year']} | {race:35s} | drivers={len(info['drivers']):2d} | laps={info['laps']:3d} | pitlaps={info['pit_laps']}")
