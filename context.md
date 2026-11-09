# FairShare Project Context

Last updated: 10 November 2026, IST

## Product in one sentence
FairShare helps a food-bank coordinator allocate limited food fairly, understand remaining shortages, reconcile what was dispatched, received and collected, and compare the next action that improves access.

Decision loop: PLAN -> EXPLAIN -> RECONCILE -> REPLAN.

Food-bank decision-support prototype for DataNova 2026 problem DN-SI-01. It does not replace India's PDS, determine legal eligibility, certify food safety, detect guilt, or prove household consumption.

## Users
- Coordinator: loads/reviews inputs, compares plans, accepts plan, handles disruptions.
- Center operator: reports usable capacity, receipts, collection and explanations.
- Reviewer: checks decisions, changes, discrepancies and open questions.
- Household feedback is optional and coordinator-assisted; no standalone household app.

## Minimum deliverable
One planning period and one consistent food-kit unit:
1. Load/enter stock, regional demand, center capacity and assignments.
2. Validate inputs.
3. Generate a fair plan plus a strong proportional baseline.
4. Explain allocation, coverage, unmet demand and constraints.
5. Change capacity/stock and compare outcomes.
6. Accept a server-verified plan.
7. Record dispatch, receipt, collection and review status.
8. Reconcile discrepancies.
9. Export/print a readable decision receipt.
Clearly label synthetic demo events.

## SRS rules
- Confirmed stock differs from promised/hypothetical stock.
- Demand is estimated need, not historical collection.
- Closure sets capacity to zero but does not erase need.
- Whole, non-negative kits only; no fractions.
- Never exceed confirmed stock, usable capacity or eligible unmet demand.
- Completed dispatches are commitments; do not silently reassign them.
- Missing is not zero.
- Zero demand is valid and coverage is N/A.
- Mismatch is a review signal, not automatic fraud.
- Low collection does not automatically lower need.
- Software may record safety holds but cannot certify food safety.
- Manual override needs a reason and must pass validity checks.

## Hand-checkable acceptance examples
Base:
- Stock 120 kits; A/B/C each demand 60; capacities 60/40/60.
- Expected fair plan: 40/40/40; each gets 66.7%.

Disruption:
- B capacity becomes 20.
- Expected fair plan: 50/20/50; B gets 33.3%.

Interventions:
- Restore B capacity by 20 -> 40/40/40.
- Add 20 kits while B stays 20 -> 60/20/60.
- Restoring capacity improves fairness; food improves total throughput.

Reconciliation:
- 40 dispatched, 35 received -> 5 unresolved if no return/loss/in-transit explanation.
- If 25 collected, 10 remain at center.
- These are separate balances.

## Final architecture
TypeScript modular monolith: one repository with intake, allocation, reconciliation, reporting and authorization modules.

Frontend:
- React + Vite + TypeScript.
- TanStack Query for server data loading/loading/error state.
- Zod for runtime input validation.
- Start pure allocation function on main browser thread.
- Add Web Worker only if realistic 100-center preview profiling exceeds 16 ms.

Server:
- Hono API on Cloudflare Workers.
- Same shared TypeScript allocation library as frontend.
- Server verifies identity, authorization, latest data and recomputes on acceptance.
- Browser previews are drafts; never accept browser-supplied allocation.

Data/auth:
- Supabase PostgreSQL and Supabase Auth.
- Supabase transaction pooler; postgres.js with max 1, prepare false, TLS.
- Add Hyperdrive only after measured connection overhead proves it is needed.
- If later used, disable query caching for inventory/reconciliation.
- Prefer Mumbai database region, subject to account availability/approval.

Deployment:
- Same origin for static React app and /api/v1.
- Cloudflare Workers runs API; Supabase hosts Auth/PostgreSQL.

## Algorithms - freeze before coding
There are TWO algorithms. Do not merge them.

A. Proposed fairness plan: progressive max-min fairness
- Improve lowest coverage among eligible, uncapped regions first.
- Coverage = allocation / demand.
- Use exact integer rational comparisons, ideally BigInt cross-products; decimals display-only.
- Reference tie: lowest current coverage; then larger next coverage; then lowest stable region ID.
- Batch only when equivalent to one-kit reference behavior.
- Closed regions remain visible but do not trap all distribution.
- Use total useful allocation and stable ID only for final deterministic ties.

B. Baseline: capacity-aware proportional allocation with Hamilton largest remainder
- This is comparison baseline, not fairness engine.
- Calculate proportional shares, cap capacity/demand, redistribute useful leftovers.
- Give floor shares then remaining kits to largest remainders; tie by region ID.
- Use integer remainder arithmetic.
- Fairness can equal baseline on simple cases; show equality honestly.

Testing:
- 10 golden fixture input/output files.
- Include base, disruption, extra stock, zero stock/demand, closed center, capped demand, committed dispatch and tie cases.
- Run fixtures against engine and independent evaluator.
- Exhaustive small-case test against feasible allocations.

## Data model
Organization-scoped:
- organizations, memberships, centers, regions, periods
- stock/demand/capacity revisions
- snapshots, plans, allocations, reservations, decision receipts
- movements and append-only movement events
- reviews, idempotency records, audit events

Store UTC timestamps; show IST.
Facts in relational tables; immutable snapshots/receipts as JSONB.
Store source/date/unit, reported/simulated label, assumptions, policy/engine version and fingerprint.
Constraints: non-negative integers, unique event IDs, organization-scoped foreign keys.
Indexes: organization/period, center/status, movement/time, unresolved reviews.

## Organization isolation/security
Use two safeguards:
1. PostgreSQL Row Level Security (RLS).
2. Repository/API functions that require organization context.

Each DB transaction:
- Verify Supabase JWT via project JWKS with bounded key cache.
- Check issuer/audience/expiry/current membership.
- Set transaction-local actor/org context, e.g. SET LOCAL app.org_id.
- RLS enforces read/write isolation; missing context denies.
- Runtime role is never table owner, superuser, service role or BYPASSRLS.
- Use composite org-scoped keys.
- Fixed search paths; revoke public function execution.
- SQL functions are thin writes; allocation math remains TypeScript.

Roles:
- Coordinator: accept plan/manage inputs.
- Operator: report permitted center facts.
- Reviewer: inspect/review discrepancies.
- Disable public sign-up; administrator creates staff accounts.

Required security tests:
- Org A cannot get/mutate/export Org B data.
- Wrong operator cannot report another center.
- Invalid JWT/membership -> 401/403.
- CSV cells beginning with =, +, - or @ get a leading single quote.

## Exact acceptance transaction
Use READ COMMITTED. No SERIALIZABLE/application-level lock.

POST /api/v1/plans/accept:
1. Authenticate/authorize.
2. Canonicalize payload and hash it.
3. Start short transaction; set local actor/org.
4. Check idempotency first:
   - same org + actor + key + hash -> original result
   - same key + different payload -> 422
5. Set lock timeout around 2 seconds and bounded statement timeout.
6. SELECT period FOR UPDATE.
7. Compare expected revision; different -> 409 refresh.
8. Reload authoritative inputs; recompute and independently validate.
9. Insert plan, allocations, eligible reservations, receipt and audit event.
10. Increment period revision.
11. Commit atomically.

Any stock/capacity/demand/dispatch write locks same period and advances revision.
Hypothetical stock never becomes confirmed stock.
Duplicate retry never double-reserves.

## Minimal API
GET /api/v1/periods/{id}/snapshot - bounded snapshot/revision/provenance.
POST /api/v1/periods/imports - CSV validation and provenance.
POST /api/v1/plans/accept - expected revision/key/reason, authoritative receipt.
POST /api/v1/movements/{id}/events - append authorized fact.
PATCH /api/v1/reviews/{id}; GET /api/v1/plans/{id}/summary - preserve reason; printable HTML/safe CSV.
No POST /scenarios/evaluate for v1. Browser drafts calculate locally.

## Failure behavior
- 409 stale revision: refresh/re-review.
- 422 invalid input or idempotency payload mismatch.
- 429 rate limit; Retry-After.
- 503 database/dependency unavailable; fail writes closed.
- Offline: labelled stale preview only; no acceptance/dispatch.
- LLM failure: normal form remains usable.
- Never turn missing reports into zero.

## Optional LLM
LLM is cuttable and off critical path.
Possible roles: propose structured capacity change from redacted note; summarize validated decision receipt; categorize optional feedback.
Rules:
- Provider-neutral adapter.
- Evaluate paid Gemini 3.1 Flash-Lite only if time remains.
- No tool/database access, autonomous writes, eligibility/fraud/safety/allocation decisions.
- Validate output; user explicitly confirms.
- Version prompts/schemas; test ambiguity, contradiction, injection and unsupported numbers.
- 8-second timeout, bounded retry/spend, ordinary-form fallback.
- No RAG/vector DB.

## Performance/scale targets
Targets, not proven:
- UI feedback <50 ms.
- 100-center local preview p95 <100 ms.
- Main thread budget 16 ms before considering worker.
- API read p95 <300 ms.
- Acceptance p95 <500 ms without contention.
- First usable mobile shell <2 seconds.
- Initial JS <200 KB gzipped; lazy-load review/export.
- Browser print stylesheet, no PDF library.

10,000-session assumption:
- 10,000 signed in; 10% active; one request per active user every 5 seconds.
- Peak 200 RPS; mix 90/9/1 read/write/calculation; average 5 RPS.
- 10 million rows, max 10 LLM calls in flight.
Likely bottlenecks: Supabase connections/pooler, slow SQL, hot-period locks.
Tests: fixtures/evaluator, simultaneous accept, duplicate retry, cross-org tests are mandatory. One Playwright smoke if time permits; k6 2-minute 200-RPS run only after core.

## 24-hour schedule
0-2 h: confirm dataset semantics/deadline; freeze algorithms/fixtures; prove sign-in + one DB transaction; verify Worker/Supabase connection.
2-9 h:
- Engine/evaluator/golden tests
- React UI/local drafts
- Schema/migrations/API/auth/RLS/transaction
- Reconciliation/export/fixtures/evidence
By 12 h: clickable flow works: load -> edit -> preview -> accept -> receipt.
12-20 h: reconciliation and mandatory concurrency/isolation/balance tests; one Playwright smoke.
20-24 h: freeze, fix, measure, rehearse, package.
Cut order: LLM, broad UI automation, k6. Never cut correct allocation, validation, baseline, disruption comparison, reconciliation, evidence pack or manual rehearsal.

## CI/CD/operations
- CI: types, fixtures, evaluator, migration/database tests, frontend build.
- Dev/staging/prod separated; additive migrations; retain prior deployment.
- Monitor request IDs, errors, Worker CPU/wall time, DB latency, lock waits/conflicts and LLM spend.
- Initial availability target 99.5%; 4-hour recovery; 24-hour max data loss.
- Daily backups and restore drill; PITR before higher claims.
- Proposed retention: 12 months operational/audit; 30 days diagnostic.
- Files need separate backup if introduced.

## Costs (USD before tax; estimates)
Pilot: $30/month base (Workers ~$5 + Supabase Pro ~$25); budget $40-70.
Growth: $250-500/month depending on database/PITR/transfer/monitoring.
Earlier estimate: 13M requests/month at 20ms average Worker CPU ~ $10.50/month Worker cost.
LLM disabled initially. Allow ~$4 for 2,000 or ~$85 for 50,000 short calls; recheck rates/policies on build day.

## Existing final artifacts
- C:\Users\Ishaan\Documents\ChatGPT\DataNova 2026\output\pdf\FairShare_Final_Technical_Plan.pdf
- C:\Users\Ishaan\Documents\ChatGPT\DataNova 2026\output\pdf\FairShare_Technical_Plan_Explained.pdf
- C:\Users\Ishaan\Desktop\Food_Allocation_SRS.pdf
- C:\Users\Ishaan\Desktop\FairShare_Technical_Plan_Senior_Review.pdf

## Current status
No FairShare application code currently exists. Temporary starter code was deleted at the user's request. The DataNova workspace retains final PDF artifacts only.

Recommended next command:
cd "C:\Users\Ishaan\OneDrive\FairShare"
code .

Create code only after confirming this is the intended implementation folder.

