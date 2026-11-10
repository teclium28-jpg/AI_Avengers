# FairShare optimization engine

Implemented policy: `fairshare-discrete-progressive/1`; engine `1.0.0`.
This is FairShare's specified discrete progressive policy. No global
lexicographic integer optimality claim is made.

## Inputs and decisions

The existing `PeriodInput` DTO is unchanged. Only confirmed stock selected by the
owning input pipeline belongs in `stockKits`; this field is the inclusive period
total, not remaining warehouse stock. The engine cannot independently attest the
source's truth or distinguish hypothetical stock once a caller puts it in this field.
Demand is estimated period need. Capacity is the current usable inclusive period
allowance. Prior dispatches consume both stock and capacity once.

- Total allocation = prior dispatch + newly allocated kits.
- Available new stock = stock - sum(prior dispatch).
- Coverage = total allocation / demand. Zero demand has null (N/A) coverage.
- Initial eligible headroom = open ? min(demand, capacity) - prior : 0.
- Closed capacity must be zero; open zero capacity is allowed.
- Prior greater than stock, demand or capacity returns an `input_conflict`, with
  supporting quantities. This includes closure after dispatch: the original prior
  is retained in the conflict, and no supposedly feasible plan is manufactured.

The last rule follows the new optimization assignment. The older Hamilton
`isValidAllocation` helper permits grandfathered commitments after closure.
That implementation and preprocessing remain unchanged. Acceptance consumers must
use the new engine union and `evaluateAllocation`; the legacy helper is insufficient
for this contract. A coordinator must reconcile the contradictory inputs before
this engine generates a plan. Never erase dispatch records to resolve a conflict.

Validate required IDs/names, period membership, status/provenance, quantities and
uniqueness at the public boundary. No missing value becomes zero. Quantities are
integers in [0, Number.MAX_SAFE_INTEGER]; negative zero is rejected to keep JSON
round trips exact. Aggregate commitments are checked with BigInt before conversion.
At most 100 regions and distinct centers are supported; an empty region list is valid.

The current DTO puts capacity on each region row. Repeated center IDs are rejected
with `SHARED_CENTER_UNSUPPORTED`, because interpreting each as a separate budget
would multiply the shared center's capacity. A future multi-region-per-center model
needs an explicit budget contract with the data owner. This library's numerical
range exceeds the database's current 2,147,483,647-kit domain; persistence validation
remains necessary.

At each one-kit step, among eligible rows:

1. Select the lowest total current coverage using BigInt cross-products.
2. On equal coverage select the larger coverage after adding one kit.
3. On a remaining tie select the lowest region ID.

IDs use JavaScript string `<`/`>` ordering (UTF-16 code units), with no locale,
case folding or Unicode normalization. Output rows are sorted by the same ordering.
Closed, zero-demand and capped regions stay visible but leave the eligible set.
The engine and comparison do not mutate their inputs, access IO, read clocks, or
use random numbers. All allocation decisions are exact; decimal coverage is display-only.

## Why rank selection matches the reference

For row i, imagine its new-kit awards as a sorted stream. Its event indexed by
integer k has current coverage k/d_i, next coverage (k+1)/d_i, and its stable ID,
where prior_i <= k < min(demand_i, capacity_i). Closed rows have no stream.
Each stream is strictly increasing by its first key. The reference merges the
stream heads one kit at a time; taking the first K events in the total stream order
therefore gives exactly the same result, including prior commitments and all ties.

Production selects this prefix by rank. For a rational threshold t/S, each stream's
event count is clamp(floor(t*d_i/S) - prior_i + 1, 0, stream length). It uses exact
BigInt division, not approximate water filling. Let S=2^108. Distinct current
coverages with denominators less than 2^53 differ by at least 1/(d_i*d_j), which is
greater than 2^-106. Thus a grid interval of width 2^-108 cannot contain two distinct
coverage levels, or two events from one stream. Binary search finds the first grid
threshold whose cumulative count reaches K. All events at or below the preceding
threshold are awarded. At most one event per stream lies in the boundary bucket;
sort those by the original exact three-key ordering and take the remainder.

This proves equivalence to the reference's event order, not a stronger optimization
objective. K is the smaller of available new stock and total useful headroom.
Zero-award and full-saturation cases avoid binary search.

Production costs O(n*B + n log n) time and O(n) space, B=108 (at most 109 search
iterations). BigInt operands are bounded by the documented safe integer range;
there is no loop proportional to stock. Reference costs O(K*n) time and O(n) space,
and returns `REFERENCE_WORK_LIMIT` above 100,000 useful new kits. This oracle limit
does not apply to production. The independent evaluator costs O(n^2) time/O(n)
space for policy frontier pairs and does not call any allocator or renderer.

## Result and independent evaluation

`optimizeAllocation(unknown)` returns a discriminated JSON union. Failure contains
`kind`, versions and actionable `findings` (code, path, message, quantities).
Success contains period, versions, inclusive stock, commitments, total/new kits,
leftover stock, and per-region total/new kits, demand/capacity, initial headroom,
unmet demand, exact fraction strings, display coverage and structured explanations.
No BigInt escapes. Fractions are exact but not necessarily reduced.

`ZERO_DEMAND`, `CENTER_CLOSED`, `CAPACITY_LIMIT_REACHED`, `DEMAND_SATISFIED` and
`COMMITMENT_PRESERVED` describe observed facts. `STOCK_EXHAUSTED` records the stop
condition only where useful headroom remains. A capacity fact does not assert that
capacity caused a region's comparative disadvantage. Normal output contains no
per-kit trace. The reference and fixture files are intended for small debugging cases.

`evaluateAllocation(input, result)` first validates input and result shape,
whole quantities, one result per region, commitments, limits, totals, coverage,
metadata/explanation consistency and no avoidable leftover stock. It returns
actionable `feasibility` findings separately from `policy.status` and findings.
If infeasible, policy is `not_checked`. `strongerOptimality` is always `not_claimed`.

The policy test inspects the last selected and first unselected event of each stream.
If any unselected event precedes a selected event, the result violates the prefix
policy. Otherwise the feasible result is the exact prefix: strictly increasing
streams ensure all internal events lie on the corresponding side of these frontiers.
This does not rerun an allocator. Set `checkPolicy:false` when evaluating another
policy. Set `detailed:false` to validate a basic `BaselineResult` without new-engine
metadata; this mode still checks stock, limits, coverage and region completeness.

`allocateFairness(PeriodInput)` remains for current valid frontend callers. It now
declares the original basic result type for frontend compatibility (the runtime
object is enriched and sorted by ID), and throws `AllocationInputError`
with `.details` on invalid/conflicting input. The UI owner must handle this error
or adopt the union; no frontend handling is implemented in this task.

## Backend usage

Files and responsibilities:

- `optimization-contract.ts`: boundary validation, versioned types and result facts.
- `optimization.ts`: production exact rank selection.
- `optimization-reference.ts`: independent one-kit scan oracle.
- `optimization-evaluator.ts`: independent feasibility and policy frontier checks.
- `optimization-comparison.ts`: unchanged Hamilton comparison and named populations.
- `fairness.ts` / `index.ts`: compatibility wrapper and public exports.
- `test/optimization.test.ts` and ten fixture JSON files: correctness evidence.
- `bench/optimization.bench.ts` / package `bench` script: reproducible measurements.

```ts
import { optimizeAllocation, evaluateAllocation, compareAllocations } from '@fairshare/domain';

// authoritativeInput is the teammate's cleaned PeriodInput from a consistent snapshot.
const plan = optimizeAllocation(authoritativeInput);
if (!plan.ok) {
  // Return validation/conflict findings for review; do not accept a plan.
  console.log(plan.kind, plan.findings);
} else {
  const checked = evaluateAllocation(authoritativeInput, plan);
  if (!checked.feasible || checked.policy.status !== 'conforms') {
    throw new Error('Computed allocation failed independent validation');
  }
  const comparison = compareAllocations(authoritativeInput);
  const json = JSON.stringify({ plan, comparison }); // no BigInt serialization error
  // Server-owned acceptance/revision locking is a separate task.
}
```

The comparison sends identical input values to the unchanged Hamilton function,
on a sorted copy. It returns each method's own validity report and quantities,
allocation differences, and equality when allocations coincide. `allPositiveDemand`
includes every positive-demand row, including closed/capped rows. `eligiblePositiveDemand`
includes positive-demand open rows with **initial** headroom before allocation, not
only survivors after allocation. Both include explicit region IDs, exact minimum
coverage or null for an empty population. No closed row is hidden in the first metric.

## Verification evidence

Run from the project root:

```powershell
npm test
npm run typecheck
npm run build
npm run bench -w @fairshare/domain
```

Ten explicit JSON input/output files live in
`packages/domain/test/fixtures/optimization/`:

| Fixture | Total A/B/C | Leftover |
| --- | --- | --- |
| Base | 40/40/40 | 0 |
| Disruption | 50/20/50 | 0 |
| Capacity restored | 40/40/40 | 0 |
| Extra stock 140 | 60/20/60 | 0 |
| Zero stock | 0/0/0 | 0 |
| Zero demand A | 0/3/2 | 0 |
| C closed | 60/40/0 | 20 |
| Saturation | 3/2/0 | 95 |
| Commitments 4/0/0, stock 9 | 4/3/2 | 0 |
| Equal coverage and stable-ID ties | 2/2/1 | 0 |

Tests compare complete production/reference results and independently evaluate each
fixture. Exhaustive two-region enumeration covers demands/capacities 0..3, every
feasible prior 0..min(demand,capacity), open rows and closed zero-capacity rows, and
stock from total prior through useful saturation +2: **4,828 inputs**. Enumerated
**11,664 feasible vectors** check maximum useful throughput only. No assertion of
global lexicographic optimality is inferred from this enumeration.

LCG seeds 1..2000 cover 0..12 rows, demands/capacities 0..100, feasible commitments
and additional stock 0..1000. Each checks determinism, shuffled input ordering,
deep-frozen input immutability, conservation, commitment preservation, reference
equality, evaluator conformance and JSON round trips. A further 500 seeds exercise
five near-10^15 denominators with prior commitments and small remaining stock.
Failures include seed and reproducible input. Targeted tests cover MAX_SAFE_INTEGER,
fractions differing by 1/(d*(d-1)) for d=3*10^15, unsafe/missing quantities,
contradictory history, sparse runtime arrays, ID ties and corrupt evaluator results.
No Hamilton stock-monotonicity property is asserted.

## Measured performance, 10 November 2026

Windows x64, Intel Core Ultra 7 155H, Node v24.18.0. Production: 25 warmup calls,
100 timed samples per case. Median and p95 use nearest-rank sorted observations.
Timed section includes validation, allocation and explanations; evaluator is outside
the timer but checks every workload once. Reference: 3 warmups/15 samples.

| 100-region workload | Confirmed stock | Median ms | p95 ms |
| --- | ---: | ---: | ---: |
| Mostly equal demands 1000..1002 | 50,000 | 3.005 | 4.184 |
| Unequal: 10+i², last 10^9 | 50,000 | 1.097 | 1.744 |
| 25 closed, 25 cap 5, 50 cap 10,000 | 50,000 | 2.473 | 3.432 |
| Equal demands 1000, many ties | 50,037 | 2.879 | 3.745 |
| Demands 10^14+i, safe maximum stock | 9,007,199,254,740,991 | 3.232 | 4.286 |
| Demands/caps 1000, commitments total 10,000 | 50,000 | 3.229 | 3.920 |
| Reference, same mostly-equal input | 50,000 | 835.268 | 1508.753 |

Measured production p95 is below both 100 ms preview target and 16 ms budget in
this Node environment. This is not browser responsiveness evidence. Profile the
browser with real rendering, low-end hardware and repeated previews before deciding
on a Web Worker; no Worker is added here. Timing includes ordinary run-to-run/GC/OS
variation and is evidence for these workloads/environment only.

Optional intervention helper is deferred; stock/capacity hypothetical scenarios
must remain explicitly labelled outside confirmed authoritative input. No API,
frontend, authentication, database or acceptance transaction is implemented here.
