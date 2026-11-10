#!/usr/bin/env python3
"""Generate a SYNTHETIC India-wide FairShare sample dataset.

All numbers are invented (seeded, reproducible). District names are real places so the
demo looks realistic, but demand, capacity, stock and donations are NOT real statistics.
Every row is labeled reported_or_simulated = simulated.

Usage: python3 scripts/generate_india_dataset.py [out_dir]
Writes regions.csv, stock.csv, donations.csv (clean) and regions_dirty.csv (messy,
for exercising the cleaning pipeline).
"""
import csv
import random
import sys
from pathlib import Path

SEED = 20261110
PERIOD = "p1"
AS_OF = "2026-11-10"

# (region_id, region_name, state, approx population in lakh -> drives demand)
REGIONS = [
    ("MH-MUM", "Mumbai Suburban", "Maharashtra", 93),
    ("MH-THN", "Thane", "Maharashtra", 110),
    ("MH-PUN", "Pune", "Maharashtra", 94),
    ("MH-NAG", "Nagpur", "Maharashtra", 47),
    ("MH-GAD", "Gadchiroli", "Maharashtra", 10),
    ("DL-NWD", "North West Delhi", "Delhi", 36),
    ("DL-SED", "South East Delhi", "Delhi", 27),
    ("UP-LKO", "Lucknow", "Uttar Pradesh", 45),
    ("UP-VNS", "Varanasi", "Uttar Pradesh", 37),
    ("UP-BAH", "Bahraich", "Uttar Pradesh", 35),
    ("BR-PAT", "Patna", "Bihar", 58),
    ("BR-KIS", "Kishanganj", "Bihar", 17),
    ("WB-KOL", "Kolkata", "West Bengal", 45),
    ("WB-MUR", "Murshidabad", "West Bengal", 71),
    ("TN-CHE", "Chennai", "Tamil Nadu", 70),
    ("TN-MDU", "Madurai", "Tamil Nadu", 30),
    ("KA-BLR", "Bengaluru Urban", "Karnataka", 96),
    ("KA-RCH", "Raichur", "Karnataka", 20),
    ("TS-HYD", "Hyderabad", "Telangana", 39),
    ("AP-VSK", "Visakhapatnam", "Andhra Pradesh", 20),
    ("GJ-AMD", "Ahmedabad", "Gujarat", 72),
    ("RJ-JPR", "Jaipur", "Rajasthan", 66),
    ("RJ-BAR", "Barmer", "Rajasthan", 26),
    ("OD-KAL", "Kalahandi", "Odisha", 16),
    ("OD-BBS", "Khordha (Bhubaneswar)", "Odisha", 23),
    ("AS-GUW", "Kamrup Metropolitan", "Assam", 13),
    ("KL-TVM", "Thiruvananthapuram", "Kerala", 33),
    ("MP-BPL", "Bhopal", "Madhya Pradesh", 24),
    ("CG-BST", "Bastar", "Chhattisgarh", 14),
    ("JH-RAN", "Ranchi", "Jharkhand", 29),
]

# Hand-picked edge cases so every cleaning/baseline path gets exercised.
CLOSED = {"MH-GAD", "AS-GUW"}          # closed: capacity 0, demand kept
ZERO_DEMAND = {"KL-TVM"}               # valid zero demand -> coverage N/A
PRIOR_DISPATCH = {"UP-LKO": 150, "TN-CHE": 200, "BR-PAT": 100}


def build(rng):
    rows = []
    for rid, name, state, pop in REGIONS:
        center = "CTR-" + rid.split("-")[1]
        demand = 0 if rid in ZERO_DEMAND else int(pop * rng.uniform(18, 26))
        if rid in CLOSED:
            capacity, status = 0, "closed"
        else:
            capacity, status = int(demand * rng.uniform(0.55, 1.10)), "open"
            if demand == 0:
                capacity = int(pop * 10)
        prior = min(PRIOR_DISPATCH.get(rid, 0), capacity)
        rows.append(
            dict(period_id=PERIOD, region_id=rid, region_name=name, center_id=center,
                 demand_kits=demand, capacity_kits=capacity,
                 prior_dispatched_kits=prior, status=status,
                 reported_or_simulated="simulated", _state=state)
        )
    return rows


def donations(rng, total):
    """Split `total` confirmed kits across donor batches (supporting detail only)."""
    donors = [("Corporate CSR", 0.35), ("Individual drive", 0.15), ("Retail surplus", 0.25),
              ("Government scheme", 0.20), ("NGO partner", 0.05)]
    cities = ["Mumbai", "Delhi", "Chennai", "Kolkata", "Bengaluru", "Hyderabad", "Ahmedabad", "Pune"]
    out, left = [], total
    for i, (donor, share) in enumerate(donors):
        qty = left if i == len(donors) - 1 else int(total * share)
        left -= qty
        out.append(dict(period_id=PERIOD, donation_id=f"D{i+1:03d}", donor_type=donor,
                        received_at=rng.choice(cities), donated_kits=qty,
                        stock_type="confirmed", as_of_date=AS_OF))
    return out


def write(path, rows, fields):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r[k] for k in fields})


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "data/samples/india")
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)

    rows = build(rng)
    fields = ["period_id", "region_id", "region_name", "center_id", "demand_kits",
              "capacity_kits", "prior_dispatched_kits", "status", "reported_or_simulated"]
    write(out / "regions.csv", rows, fields)

    # Stock ~70% of what regions could actually absorb -> a real shortage.
    absorbable = sum(min(r["demand_kits"], r["capacity_kits"]) for r in rows)
    stock = int(absorbable * 0.70)
    write(out / "stock.csv",
          [dict(period_id=PERIOD, stock_kits=stock, stock_type="confirmed",
                source="synthetic sample", as_of_date=AS_OF)],
          ["period_id", "stock_kits", "stock_type", "source", "as_of_date"])
    write(out / "donations.csv", donations(rng, stock),
          ["period_id", "donation_id", "donor_type", "received_at", "donated_kits",
           "stock_type", "as_of_date"])

    # Messy copy: injected problems the cleaner must catch (first 3 are fixable by trimming).
    dirty = [dict(r) for r in rows]
    dirty[0]["region_name"] = "  Mumbai   Suburban "          # whitespace drift (cleaned)
    dirty[1]["demand_kits"] = ""                              # missing (rejected)
    dirty[2]["capacity_kits"] = "-40"                         # negative (rejected)
    dirty[3]["demand_kits"] = "12.5"                          # non-integer (rejected)
    dirty[6]["status"] = "closed"                             # closed but capacity > 0 (flagged)
    dirty.append(dict(dirty[5]))                              # duplicate region row (flagged)
    dirty[9]["capacity_kits"] = "10"
    dirty[9]["prior_dispatched_kits"] = "400"                 # dispatched > capacity (flagged)
    dirty[10]["demand_kits"] = "9999999"                      # absurd magnitude (flagged)
    write(out / "regions_dirty.csv", dirty, fields)

    print(f"regions={len(rows)} stock={stock} absorbable={absorbable} -> {out}")


if __name__ == "__main__":
    main()
