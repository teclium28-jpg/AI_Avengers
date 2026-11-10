# Database foundation implementation plan

Goal: versioned PostgreSQL migrations and explicit synthetic development data for the database scope requested on 10 November 2026.

Architecture: normalized tables in a private `fairshare` schema, composite tenant-scoped keys, revisioned input history and immutable decision/movement facts. Follow `context.md` and `docs/integration-contract.md`; migrations do not implement allocation arithmetic or the acceptance API. Supabase Auth users are linked by nullable membership user IDs; synthetic memberships never create login accounts.

Approach: plain SQL migrations fit Supabase and avoid a second ORM model. Application-only validation would miss direct SQL violations; an ORM-generated initial schema adds unnecessary tooling here. Use PGlite to execute PostgreSQL tests because no local PostgreSQL/Docker executable or hosted project is available. A later hosted Supabase smoke test remains required.

## Tasks

- [x] Add core entities, period-region assignments, revisioned inputs and provenance. Test fractional/negative quantities, unique revisions, date ranges and cross-tenant/period relationships.
- [x] Add immutable input snapshots, plans, allocations, reservations and receipts. Test snapshot/plan linkage, reservation bounds, hashes, and history protection.
- [x] Add movements, append-only events/reversals, reviews, idempotency and audit. Test duplicate/reversal events, complete-once idempotency, and update/delete/truncate rejection.
- [x] Add tenant RLS with missing-context denial and revoke default access. Test with a real restricted PostgreSQL role, never just the test superuser.
- [x] Add separate synthetic SQL seed: two demo organizations, three scenarios, fictional memberships, baseline plan/receipt, and 40 dispatched / 35 received / 25 collected reconciliation example.
- [x] Execute migrations and seed from scratch; verify repeat seed safety and run repository tests/typecheck/build. Review final SQL and document exact guarantees and limitations.

## Constraints and decisions

- Quantities use an unscaled numeric domain with explicit whole/non-negative/bounded checks, avoiding PostgreSQL integer assignment's rounding of fractional numeric values. Map checked values to integers at the API boundary.
- All business timestamps are `timestamptz`; calendar boundaries remain explicit instants. UTC is the storage/reference convention; UI formats IST.
- Organization + request key is the idempotency unique key; actor/hash are bound fields. Pending claims must complete in the same transaction.
- Stock and capacity are inclusive period totals. Closure is represented as zero current usable capacity, independent of immutable previous movement facts.
- RLS is the tenant backstop; identity/membership/center authorization and approved repository functions are future API work. No runtime table grants are introduced.
- Preserve existing local API changes and teammate code. No push, deployment, actual user account creation or live schema changes are part of this request.

## Verification and review

`npm test` passes: 6 API tests, 25 domain tests and 44 database tests (including the parent database suite). Typechecking and the merged frontend production build pass. SQL executes in PGlite 0.5.16, not a hosted Supabase project. The repeat seed preserves counts and period revisions. No Auth users are seeded.

Author review covered tenant/period foreign keys, NOT NULL and quantity checks, trigger search paths, default privilege revocation, hash checks, immutability, idempotency and synthetic-data labeling. One deferred-constraint visibility issue was reproduced with a failing restricted-role test and fixed: an invisible pending claim now fails closed rather than passing its completion check. No independent reviewer/subagent was used.

The frontend commit 84b962b was merged before implementation, preserving both frontend dependencies and the existing API PostgreSQL dependency when resolving the lockfile. Git retained the automatic-stash backup. New database work remains local and uncommitted; hosted migrations, API authorization/functions, concurrency and Worker/Supabase checks remain separate follow-up tasks.
