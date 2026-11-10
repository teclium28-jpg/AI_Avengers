# Optimization engine implementation plan

User specification: attached “Implement FairShare’s Optimization Engine”.
Scope: domain library, tests, benchmarks and documentation only. Existing frontend,
cleaner, Hamilton baseline, authentication, API and database remain owned by teammates.

## Frozen contract and design

Confirmed stock and capacity are inclusive period totals. Demand is estimated need.
Total allocation = immutable prior dispatch + newly allocated kits. Coverage uses
total allocation/demand; zero demand has null coverage. Eligible remaining headroom
is open ? min(demand, capacity) - prior : 0, after conflict checks. Prior greater
than stock, demand or current capacity is a structured conflict, including closure
after dispatch. This follows the new assignment's explicit conflict requirement;
the older baseline evaluator still permits grandfathered commitments. Neither path
erases dispatch facts. No preprocessing or baseline semantics are rewritten.

The shared DTO has region rows carrying center capacity and cannot express shared
center allocation budgets independently. Reject repeated center IDs explicitly
rather than multiply a center's budget. Support at most 100 distinct regions/centers,
safe integer quantities, safe total commitments and confirmed stock. No implicit zero.
Sort IDs by ECMAScript UTF-16 code units (< / >), without locale or normalization.

Reference: scan eligible rows once per kit using exact current coverage, descending
next coverage and ascending ID. Production: merge each row's increasing sequence of
kit priorities by exact rational rank counting on a sufficiently fine dyadic grid.
Denominators are <2^53, so distinct coverage values differ by >2^-106; a 2^-108 grid
isolates a single tied coverage level. Binary search its boundary, take all earlier
events and order the at-most-100 boundary events by exact tie rules. This preserves
the sequence without a stock-sized loop. See final engine guide for proof/cost.

## Tasks and acceptance

- [x] Boundary validation and versioned JSON success/failure result; compatibility
  allocateFairness wrapper throws a structured error only on invalid/conflicting input.
- [x] Independent scan reference, measured rank implementation, structured facts
  and exact fractions. Reference explicitly limited to 100,000 new kits.
- [x] Independent evaluator: feasibility separate from policy; pairwise last-selected
  versus next-unselected event frontier checks, without calling an allocator.
- [x] Hamilton comparison on identical sorted copies; explicit metric populations,
  exact minimum fractions, output differences and honest equality.
- [x] Ten golden fixture files, malformed/conflict/corruption tests, exhaustive small
  states and seeded reproducible property checks. Enumerated vector objective is
  maximum useful throughput only; no stronger lexicographic optimality claim.
- [x] Benchmark 100-region cases with warmup/sample count, Node environment,
  median/p95 and 16/100ms targets; document browser profiling limitation.
- [x] Review touched code, run full tests/typecheck/build, record actual results.

No subagents, new worktrees or dependencies. Implementation proceeds inline under
the user's explicit request. Optional interventions are deferred until core evidence.

## Execution and review evidence

Boundary test initially failed for missing implementation, then passed. Added
sparse-array/negative-zero regression failed then passed after validating holes and
rejecting negative zero. Hand calculations corrected two expected assertions:
the MAX_SAFE_INTEGER split and the unreduced fraction used for a tied zero minimum.
Reference/production agreement, independent frontier evaluation, and exact fraction
arithmetic were checked before correcting those expected values.

Self-review using code-review: checked stream rank proof/bounds, BigInt conversion,
stock/commitment aggregates, eligibility, result serialization and comparison
populations; inspected corrupt-result tests and purity. Kept result renderer and
unvalidated internal headroom helper out of root public exports. No separate agent
review used (subagents are opt-in). Typecheck exposed a real frontend compatibility
issue with inferred enriched row types; restoring the original wrapper's declared
basic shape resolved it without frontend edits.

Verification: full npm test passed (6 API, 54 domain, 44 database reported tests).
Typecheck passed. Build passed after esbuild's filesystem sandbox access denial
was retried with approved escalation. Benchmark: production p95 1.744..4.286 ms;
reference p95 1508.753 ms for equal demands/50,000 stock. Full measurements,
environment, limits, fixture outputs and backend example: ../optimization-engine.md.

Final integration: pulled three teammate commits through 8dd16aa with fast-forward
and autostash; no domain overlap or conflicts. Installed the newly declared Supabase
browser dependency using npm install --ignore-scripts (lockfile unchanged). The full
104 reported tests and typecheck passed against that integrated tree; final frontend
build passed. npm reported one high-severity dependency advisory; no dependency
upgrade or audit fix was performed as part of this domain task. All optimization
changes remain local, uncommitted and unpushed for review.
