# Data preparation & baseline — notes

Owner: Ananya (data preparation & baseline).

## Status: no DataNova dataset file received yet

No DN-SI-01 dataset file or link has reached the team as of this writing. Rather than
block on it, this defines a concrete input schema from `context.md` / the technical
plan PDF, builds the cleaning pipeline and baseline engine against that schema, and
ships three clearly-labeled **synthetic** sample datasets so every other workstream
(engine/evaluator, UI, API) has something real to run against today. When the real
dataset arrives, only `src/preprocessing.ts`'s column-mapping step should need to
change — the cleaned shape (`RegionInputRow[]` + `stockKits`) stays the same.

## Input schema (one explicit period, whole kits)

Two logical inputs, modeled as two CSVs for now (a DB import will later map to the
same shape — see `supabase/migrations` and `POST /api/v1/periods/imports` in the plan).

### `regions.csv` — one row per region, per period

| Column | Type | Unit | Notes |
|---|---|---|---|
| `period_id` | string | — | Which planning period this row belongs to. |
| `region_id` | string | — | Stable ID, used for tie-breaking (lowest ID wins ties). |
| `region_name` | string | — | Display name; not used for identity. |
| `center_id` | string | — | One assigned center per region (current scope). |
| `demand_kits` | non-negative integer | whole kits | Estimated need, **not** historical collection. `0` is valid (coverage shows N/A, not a gap). |
| `capacity_kits` | non-negative integer | whole kits | Usable distribution capacity at the center. `0` means closed — region stays visible but ineligible for new allocation. |
| `prior_dispatched_kits` | non-negative integer | whole kits | Already-committed dispatch for this period; both the baseline and the fairness engine must preserve this, never silently reassign it. |
| `status` | `"open" \| "closed"` | — | Redundant with `capacity_kits == 0` today; kept explicit because closure and zero-capacity can in principle be reported separately later. |
| `reported_or_simulated` | `"reported" \| "simulated"` | — | Provenance label. Demo/synthetic rows must say `simulated`. |

### `stock.csv` — one row per period (today; could extend to multiple batches)

| Column | Type | Unit | Notes |
|---|---|---|---|
| `period_id` | string | — | Matches `regions.csv`. |
| `stock_kits` | non-negative integer | whole kits | **Confirmed** stock only. Hypothetical/promised stock is a separate concept and must never be merged in here. |
| `stock_type` | `"confirmed" \| "hypothetical"` | — | Rows other than `confirmed` are excluded from the baseline/fairness input by the cleaner. |
| `source` | string | — | Free text provenance (e.g. "warehouse count 09 Nov"). |
| `as_of_date` | ISO date | — | Date the count was taken, stored UTC, displayed IST per the plan. |

## Cleaning rules implemented in `packages/domain/src/preprocessing.ts`

- **Missing values**: a missing `demand_kits`/`capacity_kits`/`prior_dispatched_kits`/`stock_kits`
  is rejected, not defaulted to `0` — "missing is not zero" is a hard SRS rule. Missing
  `region_id`/`center_id`/`period_id` rows are rejected outright.
- **Duplicates**: duplicate `(period_id, region_id)` rows are flagged; the cleaner keeps
  none of them silently — it surfaces a `DataIssue` so a human resolves which row is
  authoritative, rather than guessing (first-wins/last-wins would hide a real conflict).
- **Inconsistent names**: `region_name`/`center_id` are trimmed and whitespace-collapsed;
  `region_id` is treated as the identity key, name drift alone is not an error.
- **Invalid quantities**: non-integer, negative, or non-numeric quantity fields are
  rejected with the row number and column named. Quantities above a sanity ceiling
  (100,000 kits) are flagged as suspicious rather than silently accepted.
- **Impossible balances**: a region whose `prior_dispatched_kits` exceeds its
  `capacity_kits` is flagged (can't have already dispatched more than the center can
  hold), as is total `prior_dispatched_kits` exceeding `stock_kits`.
- **Closed-but-nonzero**: `status: "closed"` with `capacity_kits > 0` is flagged as an
  inconsistency for a human to resolve, not silently overridden either way.

Everything the cleaner rejects or flags is returned as a structured `DataIssue[]`
(row, column, kind, message) rather than thrown away — so the UI/import endpoint in
`POST /api/v1/periods/imports` can show "preview errors before saving" as the plan requires.

## Sample scenarios (`data/samples/`)

All three reuse `context.md`'s hand-checkable numbers so the baseline output is
verifiable by eye, and all rows are labeled `reported_or_simulated = simulated`:

1. **`normal.csv`** — 120 kits; regions A/B/C each demand 60; capacities 60/40/60.
   Expected baseline: **40/40/40**.
2. **`shortage.csv`** — same demand/capacity, stock cut to 90 kits (demand > stock
   overall). Exercises the "not enough to go around" path.
3. **`reduced-capacity.csv`** — 120 kits; B's capacity cut to 20. Expected baseline:
   **50/20/50** (B capped at its capacity, A and C split the rest proportionally).

## Baseline algorithm (`packages/domain/src/baseline.ts`)

Implements PDF §02 / context.md "B. Baseline": capacity-aware proportional allocation
with Hamilton largest-remainder, kept deliberately separate from the (not-yet-built)
progressive max-min fairness engine so the two can be compared honestly:

1. Entitlement per eligible region (capacity > 0, demand > 0) is `min(demand, capacity)`.
2. Stock available to distribute = `stock_kits − Σ prior_dispatched_kits` (commitments
   are preserved, not re-offered).
3. Proportional shares ∝ demand, computed as exact integer fractions (`BigInt`
   numerator/denominator, no floats) so capping and remainder comparisons are exact.
4. Any region whose share would exceed its entitlement is capped at the entitlement and
   removed from the pool; the excess stock is redistributed proportionally among the
   remaining uncapped regions. Repeats until no further capping occurs.
5. Remaining uncapped shares are floored (Hamilton), then leftover whole kits are handed
   out one at a time by descending fractional remainder, ties broken by lowest `region_id`.
6. Every region's final allocation is `prior_dispatched_kits + newly_allocated_kits`, and
   never exceeds its capacity or demand.

An independent validity evaluator (`isValidAllocation` in the same file) re-checks the
output against the SRS invariants (non-negative integers, within capacity/demand,
total ≤ stock, closed regions get 0 new allocation) without re-running the allocation
logic itself, per the plan's "independent validity evaluator" requirement.
