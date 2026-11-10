# Database foundation

Implemented as four ordered SQL migrations in `supabase/migrations`. All 20 business tables live in the private `fairshare` schema. Development fixtures live separately in `supabase/seed.sql`. No Supabase project was available or modified during this implementation.

## Table map

| Area | Tables | Responsibility |
| --- | --- | --- |
| Organization and staff | `organizations`, `memberships`, `center_operators` | Tenant identity, Supabase user linkage, role and center assignments |
| Geography and periods | `centers`, `regions`, `planning_periods`, `period_regions` | Stable codes, explicit time boundaries, revision and one assigned center per region per period |
| Input history | `stock_records`, `demand_records`, `capacity_records` | Append-only observations, entity revision, period revision, source, observation/recording instants, unit, actor and provenance |
| Decisions | `input_snapshots`, `plans`, `allocations`, `reservations`, `decision_receipts` | Immutable inputs/accepted outputs, versions/reasons, new versus previously dispatched allocation, reservation fulfillment/release and receipt hashes |
| Reconciliation | `movements`, `movement_events`, `reviews` | Shipment identity, append-only facts/reversals, discrepancies and reasoned review resolution |
| Reliability and evidence | `idempotency_records`, `audit_events` | Organization-scoped request keys, immutable actor/hash/result binding and append-only audit facts |

UUID keys identify database rows. Organization-scoped `code` values preserve external period/region/center IDs. API mapping must consistently preserve the shared engine's stable region ID/tie-break convention; it must not silently change frontend A/B/C identifiers into different tie-break ordering. Each foreign key between tenant records carries organization identity; relationships involving plans/reservations/movements also carry the period where needed.

## Quantities, revisions and provenance

- `kit_quantity` is unscaled numeric with checks for whole, non-negative, finite values up to 2,147,483,647. An integer column alone could round a fractional numeric assignment. Null remains rejected by the column's NOT NULL constraint. Zero stock/demand/capacity is valid; a movement fact must have a positive quantity.
- postgres.js normally returns numeric values as strings. Repository snapshot queries must cast already-checked quantities to integers or explicitly validate/convert them before returning the shared TypeScript DTO. Do not stringify arbitrary numeric/database rows as a substitute for DTO mapping.
- Stock records are period totals, inclusive of dispatched commitments. Confirmed and hypothetical observations are separate histories. Select the latest confirmed revision rather than summing revisions or treating warehouse balance as the period total.
- Capacity observations are inclusive period allowances. A closure records zero usable capacity without deleting demand or earlier dispatch events. Center capacity must be evaluated across all assigned regions, not independently duplicated per region.
- Entity revisions are unique per stock type/region/center and period. Input inserts lock/update the period row and assign a new global `period_revision`; a failed insert rolls that increment back. Do not use `INSERT ... ON CONFLICT DO NOTHING` for input retries: BEFORE INSERT revision triggers run even when an insert is later skipped. Replay idempotency before attempting writes.
- Dispatch events and their reversals also lock/advance that period revision. Receipt/collection facts do not change the planning revision. Accepted-plan transactions must still explicitly lock/check/increment the period revision as designed in `integration-contract.md`.
- All observation/event/creation timestamps use `timestamptz` (instants); the seed uses explicit Z-suffixed UTC timestamps. PostgreSQL may display the same instant using the session time zone; the frontend formats IST. No naive business timestamps are used.
- Sources are nonempty, unit is fixed to `kit`, and provenance is either `reported` or `simulated`. Child allocations/reservations inherit their parent plan's provenance.

## Immutability and checks

Input revisions, period-region assignments, snapshots, plans, allocations, receipts, movement identities/events and audit events reject UPDATE, DELETE and TRUNCATE. Changes append a revision, a replacement plan or an exact event reversal. Reversals must reference an original event in the same organization/movement, match its type and quantity, and may occur only once per original. Reversal-of-reversal is rejected; a replacement is a new ordinary event.

An allocation's total must equal prior dispatch plus newly allocated kits. A reservation references the exact same allocation's new amount and cannot fulfill/release more than it reserved. Plan/snapshot revision linkage and organization/period relationships are checked by foreign keys. Snapshots/receipts must contain object JSON, match their stored serialized text semantically and have its exact SHA-256 hash. The server is still responsible for canonical key ordering and the complete payload contract; a hash verifies the text, not the truth or fairness of its contents.

Idempotency uniqueness is `(organization_id, request_key)`. `actor_id` is a membership ID, and the payload hash is immutable. A pending claim may transition to completed once; a deferred constraint prevents committing a claim without its saved response. Missing RLS visibility at constraint time also rejects the transaction. Completed records cannot be rewritten, deleted or truncated. The API must still compare the current caller/hash before replaying a response and map mismatches to the agreed 403/422 behavior.

Indexes cover latest input revisions, organization/period plans and receipts, outstanding center reservations, movement/event chronology, unresolved reviews, active user membership and audit lookup.

## Isolation and remaining application work

Every business table enables and forces RLS with organization and nonempty actor context checks for reads and writes. Public schema/table/function privileges are revoked. No runtime role, passwords or production grants are created. This intentionally leaves the schema inaccessible to ordinary callers until approved repository functions and restricted role grants are implemented.

The Worker must verify JWT/current membership and operation/center permissions before setting transaction-local `app.org_id` and `app.actor_id`. Those settings are trusted server context, not authentication in themselves. `app.actor_id` is the verified Auth user ID; persisted `recorded_by`, `accepted_by` and `actor_id` FKs refer to the corresponding membership row ID. Never grant browser/anonymous/authenticated clients arbitrary SQL or let them choose those context settings. Synthetic membership rows have no `user_id` and cannot represent a verified login.

This schema does not yet implement approved repository functions, acceptance, stock overbooking prevention across concurrent plans, cumulative movement balance checks, reservation/event synchronization, automatic review/audit creation or the service's 409/422 semantics. Those operations must validate aggregates and update related rows together under the period lock. A reservation field is not by itself proof that an event was recorded. RLS does not replace those checks. Database administrators can disable protections; this is not a tamper-proof register against administrators.

## Local verification

```powershell
npm install
npm run test:db
```

The test runs the actual migration SQL and seed in PGlite's embedded PostgreSQL, with no network/database secrets or native PostgreSQL installation. Its minimal `auth.users` stub is test-only, solely to check membership FKs; Supabase supplies the real table. RLS tests switch to a NOSUPERUSER/NOBYPASSRLS role instead of running only as the test administrator.

Tests cover fresh schema creation, opt-in/repeatable synthetic seeding, scenario values and balances, whole quantities, required fields, scoped foreign keys, revision rollback, immutable history, hashes, reversals, complete-once idempotency, missing context, tenant read/write denial and time-zone invariance. Embedded tests do not prove hosted Supabase privileges/Auth behavior, multiple-client concurrency, pooler TLS or Cloudflare networking. Those remain live acceptance checks after project setup.

## Synthetic seed

The seed contains two clearly named demo organizations, fictional coordinator/operator/reviewer memberships with no Auth users, three centers/regions and normal/shortage/reduced-capacity periods. Stock values are 120/90/120; normal capacities are 60/40/60, reduced B capacity is 20. One hand-checked baseline plan allocates 40/40/40 with reservations and a simulated receipt. A simulated shipment records 40 dispatched, 35 received and 25 collected: 5 remain unresolved in transit and 10 remain at the center. It is not evidence of a live server acceptance. An open review, saved synthetic idempotency result and audit event complete the example.

Run the seed only in a disposable development/staging project, as its migration/seed owner, after explicitly setting `app.allow_synthetic_seed` to `true` on the same SQL session. Re-running it is tested not to change counts or period revisions. The opt-in is a deliberate confirmation, not an automatic detector of production.

## What the project owner needs to do later

1. Create the team's Supabase development project; choose Mumbai if offered and appropriate. Keep database passwords private.
2. Initialize/link Supabase CLI configuration for this repo after choosing the project. Use the CLI migration runner to apply these files in timestamp order and track them. These migrations are intended for a fresh project, not blindly applied to an unknown existing schema.
3. Load `seed.sql` only with the explicit development opt-in. Do not seed `auth.users`; create real staff accounts through approved Supabase administration and link their user IDs to reported memberships.
4. Implement restricted runtime/approved-function grants and API authorization before exposing business data. Disable public signup for the staff-only project. Configure the private pooler URL for the existing Worker transaction probe and run the hosted checks.

Nothing is needed from the user to run the local schema suite. Hosted project credentials and staff-user IDs are needed only for hosted migration/auth/connection verification.

Primary references: [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [trigger and deferred constraint behavior](https://www.postgresql.org/docs/17/sql-createtrigger.html), [PGlite API](https://pglite.dev/docs/api).
