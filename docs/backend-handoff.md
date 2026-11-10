# Backend handoff

Backend implementation is local. Hosted Supabase/Worker connectivity and teammate approval are not established by local tests. No frontend or cleaner code was changed. Research: [pinned evidence](backend-research.md).

## Decisions and contracts

The technical-plan transaction contract owns acceptance: authoritative snapshot and deterministic recomputation **before** the short READ COMMITTED write transaction; period lock and revision check inside it. Every import and dispatch uses that same lock. Input changes release outstanding reservations; acceptance replaces them. Already dispatched kits remain commitments. Stock and capacity are inclusive period totals. Returns do not automatically increase confirmed planning stock.

Idempotency is `(organization, UUID key)` with actor, period and canonical request hash binding. Replay precedes stale-revision checks. Movement `eventKey` is its idempotency key. Changed payloads conflict; actor mismatches are denied. Pending claims cannot commit.

TypeScript schemas and inferred request types: `apps/api/src/contracts.ts`. Snapshot/decision/replay/intervention types: `packages/domain/src/index.ts`. Response structure follows service methods in `apps/api/src/service.ts`. Database UUIDs identify periods/reservations/movements; CSV region/center/period fields remain stable codes. Frontend/data/scenario owners should acknowledge these contracts; no acknowledgment or messages to teammates are implied.

All business requests require `Authorization: Bearer <Supabase JWT>` and `X-Organization-Id: <UUID>`. Writes except events also require `Idempotency-Key: <UUID>`. Tokens require asymmetric ES256/RS256 signature, issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`, expiry and UUID subject. Current active membership is checked in PostgreSQL; operators require center assignment. Legacy HS256 tokens are intentionally unsupported.

| Method | `/api/v1` path | Access / response |
|---|---|---|
| GET | `/health` | Public liveness; existing scaffold response preserved |
| GET | `/periods/{id}/snapshot` | Coordinator/reviewer; authoritative input/revision/source records |
| POST | `/imports` | Coordinator; raw region rows + one confirmed stock row; strict cleaner gate |
| POST | `/plans/accept` | Coordinator; periodId, expectedRevision, algorithm, reason, optional explicit overrides |
| POST | `/movements/{id}/events` | Coordinator dispatch/correction; assigned operator reports; creates movement from reservation |
| GET | `/movements/{id}` | Center-scoped timeline, balances, reviews, conflicting reports, review history |
| PATCH | `/reviews/{id}` | Coordinator/reviewer; periodId, status, reason, provenance |
| GET | `/periods/{id}/summary` | Coordinator/reviewer; reservation page, UUID cursor, limit 1–100 |
| GET | `/receipts/{id}/replay` | Coordinator/reviewer; recorded replay and current-input differences |
| GET | `/receipts/{id}/export?format=csv\|html` | Coordinator/reviewer; escaped attachment |

Errors use `{error:{code,message,requestId,details?}}`: 401 token, 403 membership/role/context, 404 scoped missing record, 409 revision/key conflict, 413 payload, 422 validation/conflicting report, 429 rate, 503 dependency. Conflicting movement reports commit separately with a review and a replayable 422 response; they do not affect ledger balances.

Limits: 256 KiB request, 100 regions, 1,000 events per movement, 100 review/history/conflicting-report rows per movement response, 120 requests per actor/org/minute, 2-second DB lock and 5-second statement timeout. Movement evidence lists are bounded and currently have no continuation cursor; summary has pagination. Full ledger replay is rejected above the event limit. Authentication keys cache for 10 minutes, with a 3-second fetch timeout. Local snapshot/acceptance works without an LLM.

## Accounting

Active originals exclude exactly reversed events. Transport = dispatch − receipt − transit loss − transit return. Center = receipt − collection − center loss − center return. In-transit is a reported subset of transport, not an additive flow; later transport-changing facts make that report unknown. Missing receipt/collection is `null`; confirmed zero is `0`. Source occurrence time never silently reorders append history. Impossible reports are retained separately for review. Discrepancies never imply fraud or reduced demand.

Intervention search is a pure shared function with declared food/capacity increments, optional food+one-center combinations, separate objectives and a maximum 256 evaluations. It reports incomplete search and smallest **tested** target candidates. No costs or monetary objective are invented. Receipts record canonical JSON/SHA-256, exact input evidence, versions, comparison and independent validation. Only the installed engine version is replayable; unavailable versions are explicit. Hash matching is content integrity, not authenticity.

## Teammate Supabase setup

1. Apply all five migrations in order through the migration/admin connection. Do not run synthetic seed against production.
2. Provision real Supabase Auth users, organization, memberships, planning period and center assignments as admin. Runtime functions deliberately cannot administer identities. `fairshare_writer` stays NOLOGIN; it owns only the allow-listed write functions and obeys RLS.
3. Provision a strong password for `fairshare_runtime` and enable LOGIN through the secure administration channel. This role must own no tables, have no role memberships and never bypass RLS. Do not use postgres/service_role credentials in the Worker. Validate custom-role connection format for your Supabase direct/transaction-pooler endpoint.
4. Put runtime `DATABASE_URL` and project `SUPABASE_URL` in ignored `apps/api/.dev.vars`; use Worker secrets for deployment. The production connection requires certificate verification. The database credential is a trusted server credential: never give it to browsers. RLS assumes the server sets the verified JWT identity in transaction-local settings.
5. Run `npm run dev:api`; check `/api/v1/health`. Then run an authenticated synthetic import/acceptance through the deployed Worker. This hosted step remains for the teammate with project access.

Migration 5 requires permission to create restricted roles and transfer function ownership; verify this with the Supabase migration account. Local PostgreSQL superuser installation does not prove hosted role-provisioning permissions.

## Verification and demo

`npm run test:backend` starts disposable native PostgreSQL 17.11 on loopback with generated credentials, applies every migration, uses the actual restricted login and tests API/transaction/RLS behavior. The test-only `auth.users` table is a foreign-key stub, not a Supabase Auth service. No Docker or existing database is required. Cluster directories remain in the system temporary directory for diagnosis; no credentials are printed.

`npm test` retains original regressions, including the first four migrations under PGlite. `npm run test:mutations` mutates disposable source copies and fails on survivors. Set `FAIRSHARE_SEED` to replay a campaign; fast-check failure output includes the minimized counterexample and shrink path. Independent bounded allocation enumeration and conservation equations supply expectations.

Backend demo: `node --experimental-strip-types scripts/backend-demo.ts`. It prints a synthetic capacity disruption, intervention comparison, verified acceptance, partial receipt, discrepancy and replayable receipt. It runs locally against native PostgreSQL; nothing is sent to hosted services.

Remaining delivery limits: hosted Worker/Supabase transaction, teammate contract acknowledgment, complete OpenAPI response schemas, multi-center randomized state-machine/concurrent dispatch campaign, and broader SQL mutation coverage. Local tests do not constitute formal verification or deployment approval.
