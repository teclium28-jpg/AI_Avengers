# Large synthetic India datasets

All quantities are invented (seeded) and labeled `simulated`; district names are real,
population figures are rough and only scale the invented demand.

| Folder | Regions per period | Periods | Region rows | Use |
|---|---|---|---|---|
| `india-large/` | 100 (the app's stated limit) | 12 (monthly, Dec 2025 - Nov 2026) | 1,200 | demos, preview-timing tests |
| `india-stress/` | 1,000 | 12 | 12,000 | beyond-scope stress/load tests |

Files in each: `periods.csv` (explicit start/end), `regions.csv`, `stock.csv` (one confirmed row per period),
`donations.csv` (batches summing to each period's stock), `movement_events.csv`
(dispatch/receipt/collection/loss/transit/return with realistic dispatch-vs-receipt gaps).

Regenerate or scale: `python3 scripts/generate_india_large.py OUT_DIR [REGIONS] [PERIODS] [SEED]`

Verified: every period cleans with zero region issues and the baseline returns a valid allocation
(100 regions: ~1 ms per period; 1,000 regions: ~4 ms average, 12 ms worst). The stress stock file
raises "suspicious magnitude" flags (>100,000 kits) by design; they are warnings, not rejections.
