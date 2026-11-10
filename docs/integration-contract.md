# Data, frontend and API integration decisions

Updated 10 November 2026. Reviewed commits: data 024d57f; frontend 1e57c8d. These decisions describe the local integration baseline. Neither teammate has acknowledged them in this session; no message has been sent on their behalf.

Follow-up: frontend implementation 84b962b is now merged locally. `apps/web/src/types.ts` imports the shared domain types directly and adds demo receipt/movement types. The older specification differences below are historical design gaps, not all present in the current implementation. Hosted receipt/identity/revision DTO mapping and human confirmation of stock semantics still need completion. Database storage/mapping decisions are in `database.md`.

## Shared types and remaining frontend differences

Use the exports from `@fairshare/domain` (`packages/domain/src/types.ts`) for the implemented data/engine boundary. Do not copy those types into the frontend or API.

| Boundary | Existing shape | Meaning |
| --- | --- | --- |
| CSV intake | `RawRegionRow[]`, `RawStockRow[]` | Strings; snake_case CSV names |
| Cleaned calculation input | `PeriodInput` | `periodId`, `stockKits`, `regions: RegionInputRow[]` |
| Region input | `RegionInputRow` | IDs, demand/capacity/prior-dispatched kits, open/closed status, provenance |
| Baseline output | `BaselineResult` | Totals and `allocations: RegionAllocation[]` |
| Per-region output | `RegionAllocation` | Total allocated, new allocation, numeric display coverage or null, capacity flag |
| Validation feedback | `DataIssue[]` | Row, column, issue kind and message; findings require review before persistence |

`FRONTEND.md` currently proposes different models: region/center records instead of arrays, `active/constrained/closed` center statuses, a separate administrative eligibility flag, `confirmedStock` as warehouse stock, and a richer `PlanCalculationOutput`. Those types are a UI proposal, not an implemented shared wire contract. A view adapter can supply names/display summaries, but must not invent eligibility, revision, provenance, reservations or stock facts missing from the source. Keep organization/revision/receipt envelopes separate from calculator input.

`Rational` containing BigInt is internal only. API JSON must use string numerator/denominator DTOs if exact coverage is exposed. Existing numeric `coverage` is display-only; zero demand remains null. The frontend proposal's `PlanCalculationOutput` embeds a BigInt-bearing type, so it cannot be returned directly as JSON. Snapshot plan/receipt fields must allow null before first acceptance. These wire decisions need teammate acknowledgment before building those routes.

## Stock and capacity convention

Adopt the data engine's inclusive period totals for `PeriodInput` so existing behavior is preserved:

- `stockKits` includes kits already committed by dispatch in this period. New planning pool is `stockKits - sum(priorDispatchedKits)`.
- `capacityKits` is the center's total usable allowance for this period, including prior dispatches. New headroom is `max(0, min(demandKits, capacityKits) - priorDispatchedKits)` when open.
- `allocatedKits` includes prior dispatches; `newlyAllocatedKits` excludes them. Prior dispatches are preserved during replanning.
- Existing undispatched reservations being replaced are not subtracted a second time from a fresh complete plan. Fixed reservations outside the replaceable set need explicit accounting before this model can represent them.

Example: one region has total stock 100, total capacity/demand 80 and prior dispatch 20. New pool is 80; region headroom is 60; total plan is 80 (20 dispatched + 60 new); 20 stock remains unallocated.

The frontend's physical warehouse count is a different quantity and must have a different label. Do not map it directly to `stockKits`. A conversion requires an audited ledger including returns/losses; the current input shape does not define those adjustments. The data and frontend owners must confirm that their incoming numbers follow the inclusive convention before real imports are accepted.

Closure after a dispatch is a pending domain edge case: the baseline preserves the old dispatch when capacity is zero, while its evaluator rejects a total allocation above zero capacity. Do not erase commitments or claim this case is validated. A follow-up must distinguish immutable consumed capacity from zero capacity for new work, with a golden test.

## Acceptance decision: final PDF v3 takes precedence

1. Verify JWT, current membership, organization and operation permissions.
2. Validate/canonicalize request and bind its hash to algorithm, period, expected revision, overrides and reason. Do not accept browser allocations or hypothetical stock as confirmed stock.
3. Check for a completed idempotency replay before recomputation or stale-revision rejection; verify actor and hash. Reload identity permissions on every request.
4. Read authoritative inputs and revision consistently in one bounded SQL statement inside an organization-scoped read transaction; compute and independently validate outside the short write transaction. Pending overrides must pass authorization and validation.
5. Start a READ COMMITTED write transaction; set transaction-local actor/org, 2-second lock timeout and bounded statement timeout. Claim the unique `(organization_id, request_key)` record. On a duplicate, check actor and hash and return the saved result before evaluating the revision.
6. Lock the period with `SELECT ... FOR UPDATE`. Compare both expected revision and the revision used for recomputation against the locked revision. On any mismatch return 409 and roll back. Every stock/capacity/demand/dispatch mutation must lock this same row and advance its revision.
7. Persist plan, allocations, replaceable reservations, immutable receipt, audit and idempotency response; increment revision; commit atomically. A failed transaction must leave no standalone claimed key.

Idempotency scope is **organization + request key**. The actor and canonical request hash are bound values, not uniqueness columns. Same actor and payload returns the saved result even if its revision is now old; same actor and different payload is 422; another actor is denied (403). Concurrent duplicate claims serialize through the unique constraint. This follows PDF section 04 and resolves the older context's ambiguous actor-in-key wording.

This is a design decision; the acceptance endpoint and its concurrency/isolation tests are not implemented in this task.

## Confirmation needed

- Data owner (Ananya): inclusive totals and closure-after-dispatch policy; current cleaner can return rows alongside blocking issues, so imports must not persist solely because `input` is non-null.
- Frontend owner: consume shared exports, distinguish warehouse from period-total stock, and agree on an explicit JSON DTO/envelope and null states.
- No teammate contact channel was supplied. Ask the coordinator to relay this document and return acknowledgment or corrections.
