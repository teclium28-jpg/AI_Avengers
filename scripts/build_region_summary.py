#!/usr/bin/env python3
"""Build region_summary.csv: donation volume, center capacity and demand estimate by region.

Reads regions.csv and stock.csv from a generated dataset folder and writes region_summary.csv
next to them. SYNTHETIC: each period's confirmed stock is split across regions (weighted by demand
with noise, largest-remainder so the split sums exactly to that period's stock_kits).

Usage: python3 scripts/build_region_summary.py DIR [SEED]
"""
import csv, random, sys
from collections import defaultdict
from pathlib import Path

d = Path(sys.argv[1]); seed = int(sys.argv[2]) if len(sys.argv) > 2 else 20261110
rng = random.Random(seed)
regions = list(csv.DictReader(open(d / "regions.csv")))
stock = {r["period_id"]: int(r["stock_kits"]) for r in csv.DictReader(open(d / "stock.csv"))}
by_period = defaultdict(list)
for r in regions: by_period[r["period_id"]].append(r)

out = []
for pid, rows in by_period.items():
    total = stock[pid]
    w = [max(int(r["demand_kits"]), 20) * rng.uniform(0.5, 1.5) for r in rows]
    s = sum(w); raw = [total * x / s for x in w]
    base = [int(x) for x in raw]
    left = total - sum(base)
    for i in sorted(range(len(rows)), key=lambda i: raw[i] - base[i], reverse=True)[:left]:
        base[i] += 1
    for r, don in zip(rows, base):
        out.append(dict(period_id=pid, state_code=r["region_id"].split("-")[0], region_id=r["region_id"],
            region_name=r["region_name"], center_id=r["center_id"], donation_volume_kits=don,
            center_capacity_kits=r["capacity_kits"], demand_estimate_kits=r["demand_kits"],
            status=r["status"], reported_or_simulated="simulated"))
f = ["period_id","state_code","region_id","region_name","center_id","donation_volume_kits",
     "center_capacity_kits","demand_estimate_kits","status","reported_or_simulated"]
with open(d / "region_summary.csv", "w", newline="") as fh:
    w_ = csv.DictWriter(fh, fieldnames=f); w_.writeheader(); w_.writerows(out)
print(d, len(out), "rows")
