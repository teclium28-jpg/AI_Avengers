#!/usr/bin/env python3
"""Generate a LARGE synthetic multi-period India dataset for FairShare.

Usage: python3 scripts/generate_india_large.py OUT_DIR [REGIONS=100] [PERIODS=12] [SEED=20261110]

District names are real; population figures are rough and only used to scale INVENTED
demand. Every quantity is synthetic and labeled simulated. Reproducible via the seed.
Writes: periods.csv regions.csv stock.csv donations.csv movement_events.csv
"""
import csv
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# (state, district, approx population in lakh)
DISTRICTS = """
MH,Mumbai Suburban,93;MH,Mumbai City,31;MH,Thane,111;MH,Pune,94;MH,Nagpur,47;MH,Nashik,61;MH,Chhatrapati Sambhajinagar,37;MH,Solapur,43;MH,Kolhapur,39;MH,Gadchiroli,10;MH,Nanded,33;MH,Raigad,26
DL,North West Delhi,36;DL,South Delhi,27;DL,East Delhi,17;DL,Central Delhi,6;DL,West Delhi,25
UP,Lucknow,45;UP,Varanasi,37;UP,Kanpur Nagar,46;UP,Agra,44;UP,Prayagraj,59;UP,Meerut,34;UP,Ghaziabad,47;UP,Gorakhpur,44;UP,Bahraich,35;UP,Sitapur,48;UP,Azamgarh,46
BR,Patna,58;BR,Gaya,44;BR,Muzaffarpur,48;BR,Darbhanga,39;BR,Kishanganj,17;BR,Purnia,32;BR,Bhagalpur,30
WB,Kolkata,45;WB,Howrah,49;WB,North 24 Parganas,100;WB,Murshidabad,71;WB,Darjeeling,18;WB,Malda,40;WB,Bankura,36
TN,Chennai,70;TN,Coimbatore,35;TN,Madurai,30;TN,Tiruchirappalli,27;TN,Salem,35;TN,Tirunelveli,30;TN,Vellore,39
KA,Bengaluru Urban,96;KA,Mysuru,30;KA,Belagavi,48;KA,Raichur,20;KA,Kalaburagi,25;KA,Dharwad,18;KA,Dakshina Kannada,21
TS,Hyderabad,39;TS,Rangareddy,24;TS,Nizamabad,15;TS,Khammam,14;TS,Medchal-Malkajgiri,25
AP,Visakhapatnam,20;AP,Guntur,20;AP,Krishna,17;AP,Kurnool,23;AP,Anantapur,22;AP,Chittoor,19
GJ,Ahmedabad,72;GJ,Surat,61;GJ,Vadodara,41;GJ,Rajkot,38;GJ,Kutch,21;GJ,Banaskantha,31;GJ,Dahod,21
RJ,Jaipur,66;RJ,Jodhpur,37;RJ,Udaipur,31;RJ,Barmer,26;RJ,Kota,20;RJ,Bikaner,24;RJ,Alwar,37
OD,Khordha,23;OD,Cuttack,26;OD,Ganjam,35;OD,Kalahandi,16;OD,Sundargarh,21;OD,Koraput,14;OD,Mayurbhanj,25
AS,Kamrup Metropolitan,13;AS,Dibrugarh,13;AS,Cachar,18;AS,Nagaon,28;AS,Barpeta,17
KL,Thiruvananthapuram,33;KL,Ernakulam,33;KL,Kozhikode,31;KL,Thrissur,31;KL,Malappuram,41;KL,Wayanad,8
MP,Bhopal,24;MP,Indore,33;MP,Jabalpur,24;MP,Gwalior,20;MP,Sagar,27;MP,Rewa,24;MP,Dhar,21
CG,Raipur,40;CG,Bilaspur,27;CG,Bastar,14;CG,Durg,33;CG,Surguja,23
JH,Ranchi,29;JH,Dhanbad,26;JH,East Singhbhum,23;JH,Bokaro,21;JH,Dumka,13;JH,Palamu,19
PB,Ludhiana,35;PB,Amritsar,25;PB,Jalandhar,22;PB,Patiala,20;PB,Bathinda,14
HR,Gurugram,15;HR,Faridabad,18;HR,Hisar,17;HR,Rohtak,11;HR,Karnal,15
UK,Dehradun,17;UK,Haridwar,19;UK,Nainital,9;UK,Pithoragarh,5
HP,Shimla,8;HP,Kangra,15;HP,Mandi,10
JK,Srinagar,14;JK,Jammu,16;JK,Anantnag,11;JK,Kupwara,9
GA,North Goa,8;GA,South Goa,6
""".replace("\n", ";")

DONORS = [("Corporate CSR", 0.30), ("Individual drive", 0.12), ("Retail surplus", 0.25),
          ("Government scheme", 0.23), ("NGO partner", 0.10)]


def load_districts():
    out = []
    for item in DISTRICTS.split(";"):
        item = item.strip()
        if item:
            st, name, pop = item.split(",")
            out.append((st, name, int(pop)))
    return out


def make_regions(n, rng):
    base = load_districts()
    rng.shuffle(base)
    regions = []
    for i in range(n):
        st, name, pop = base[i % len(base)]
        lap = i // len(base)
        label = name if lap == 0 else f"{name} Zone {lap + 1}"
        rid = f"{st}-{i + 1:04d}"
        # Per-region traits are fixed across periods so time series look coherent.
        regions.append(dict(
            rid=rid, name=label, center=f"CTR-{i + 1:04d}",
            pop=max(2, int(pop * (1 if lap == 0 else rng.uniform(0.3, 0.9)))),
            cap_ratio=rng.uniform(0.55, 1.10),
            closed_prob=0.02, zero_prob=0.01,
        ))
    return regions


def month_bounds(index):
    """Period index 0 = Dec 2025 ... monthly."""
    y, m = 2025, 12 + index
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    end = datetime(ny, nm, 1, tzinfo=timezone.utc) - timedelta(days=1)
    return start, end


def w(path, rows, fields):
    with open(path, "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=fields)
        wr.writeheader()
        wr.writerows(rows)


def main():
    out = Path(sys.argv[1])
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    periods = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 20261110
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    regions = make_regions(n, rng)

    period_rows, region_rows, stock_rows, donation_rows, event_rows = [], [], [], [], []
    ev = 0
    for p in range(periods):
        pid = f"p{p + 1:02d}"
        start, end = month_bounds(p)
        period_rows.append(dict(period_id=pid, start_date=start.date().isoformat(),
                                end_date=end.date().isoformat()))
        season = rng.uniform(0.85, 1.20)  # lean-season swing, same for all regions in a period
        absorbable = 0
        per_region = []
        for r in regions:
            zero = rng.random() < r["zero_prob"]
            closed = rng.random() < r["closed_prob"]
            demand = 0 if zero else int(r["pop"] * rng.uniform(18, 26) * season)
            if closed:
                cap, status = 0, "closed"
            else:
                cap = int((demand if demand else r["pop"] * 10) * r["cap_ratio"] * rng.uniform(0.9, 1.1))
                status = "open"
            prior = 0
            if status == "open" and cap > 0 and rng.random() < 0.08:
                prior = int(min(cap, demand) * rng.uniform(0.05, 0.4))
            absorbable += min(demand, cap)
            per_region.append((r, demand, cap, status, prior))
            region_rows.append(dict(
                period_id=pid, region_id=r["rid"], region_name=r["name"], center_id=r["center"],
                demand_kits=demand, capacity_kits=cap, prior_dispatched_kits=prior,
                status=status, reported_or_simulated="simulated"))

        stock = int(absorbable * rng.uniform(0.60, 0.85))
        stock_rows.append(dict(period_id=pid, stock_kits=stock, stock_type="confirmed",
                               source="synthetic sample", as_of_date=start.date().isoformat()))

        # Donation batches summing exactly to stock.
        left, batches = stock, max(5, n // 4)
        for b in range(batches):
            qty = left if b == batches - 1 else min(left, int(stock / batches * rng.uniform(0.4, 1.6)))
            left -= qty
            donor = rng.choices([d for d, _ in DONORS], weights=[s for _, s in DONORS])[0]
            when = start + timedelta(days=rng.randint(0, (end - start).days), hours=rng.randint(0, 23))
            donation_rows.append(dict(
                period_id=pid, donation_id=f"{pid}-D{b + 1:05d}", donor_type=donor,
                source_region_id=rng.choice(regions)["rid"], donated_kits=qty,
                stock_type="confirmed", received_at_utc=when.isoformat()))

        # Movement events with believable reconciliation gaps (dispatch > receipt sometimes).
        for r, demand, cap, status, prior in per_region:
            if status == "closed" or demand == 0:
                continue
            planned = int(min(demand, cap) * stock / max(absorbable, 1))
            for _ in range(rng.randint(1, 3)):
                kits = max(1, planned // 2)
                t0 = start + timedelta(days=rng.randint(0, 20), hours=rng.randint(0, 23))
                ev += 1
                event_rows.append(dict(event_id=f"E{ev:08d}", period_id=pid, region_id=r["rid"],
                    center_id=r["center"], event_type="dispatch", kits=kits,
                    occurred_at_utc=t0.isoformat(), reported_or_simulated="simulated"))
                got = kits if rng.random() > 0.2 else int(kits * rng.uniform(0.85, 0.99))
                ev += 1
                event_rows.append(dict(event_id=f"E{ev:08d}", period_id=pid, region_id=r["rid"],
                    center_id=r["center"], event_type="receipt", kits=got,
                    occurred_at_utc=(t0 + timedelta(days=rng.randint(1, 3))).isoformat(),
                    reported_or_simulated="simulated"))
                if got < kits and rng.random() < 0.5:   # half the gaps get an explanation
                    ev += 1
                    event_rows.append(dict(event_id=f"E{ev:08d}", period_id=pid, region_id=r["rid"],
                        center_id=r["center"], event_type=rng.choice(["loss", "transit", "return"]),
                        kits=kits - got, occurred_at_utc=(t0 + timedelta(days=4)).isoformat(),
                        reported_or_simulated="simulated"))
                if rng.random() < 0.7:
                    ev += 1
                    event_rows.append(dict(event_id=f"E{ev:08d}", period_id=pid, region_id=r["rid"],
                        center_id=r["center"], event_type="collection",
                        kits=int(got * rng.uniform(0.4, 1.0)),
                        occurred_at_utc=(t0 + timedelta(days=rng.randint(4, 9))).isoformat(),
                        reported_or_simulated="simulated"))

    w(out / "periods.csv", period_rows, ["period_id", "start_date", "end_date"])
    w(out / "regions.csv", region_rows, ["period_id", "region_id", "region_name", "center_id",
        "demand_kits", "capacity_kits", "prior_dispatched_kits", "status", "reported_or_simulated"])
    w(out / "stock.csv", stock_rows, ["period_id", "stock_kits", "stock_type", "source", "as_of_date"])
    w(out / "donations.csv", donation_rows, ["period_id", "donation_id", "donor_type",
        "source_region_id", "donated_kits", "stock_type", "received_at_utc"])
    w(out / "movement_events.csv", event_rows, ["event_id", "period_id", "region_id", "center_id",
        "event_type", "kits", "occurred_at_utc", "reported_or_simulated"])
    print(f"{out}: regions={len(region_rows)} stock={len(stock_rows)} donations={len(donation_rows)} events={len(event_rows)}")


if __name__ == "__main__":
    main()
