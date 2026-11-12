---
name: ai-avengers-patterns
description: "Use when working in AI_Avengers (FairShare food-allocation app), especially before scaffolding frontend/, writing allocation or reconciliation logic in src/domain, adding golden fixtures or tests, touching the plan-accept flow, or writing commits — conventions measured from git history and the repo's spec docs"
metadata:
  version: "1.0.0"
  source: local-git-analysis
  analyzed_commits: "3"
---

# AI_Avengers (FairShare) Patterns

The history is thin: 3 commits, 2 files (`context.md`, `FRONTEND.md`) and no application
code yet. The commit conventions below were measured from git. The architecture, workflow
and testing sections come from the spec docs, which act as the source of truth. If anything
here disagrees with them, the docs win.

## Read First

1. `context.md` is the context file for the whole project: product, SRS rules, architecture,
   algorithms, data model, security, API and schedule. Read it before any implementation work.
2. `FRONTEND.md` is the frontend spec: TypeScript contracts, UI per screen, folder layout and
   the build checklist.
3. `context.md` says no application code exists yet. Confirm the implementation folder before
   creating code.

## Commit Conventions

- 2 of 3 commits (67%) use Conventional Commits, including the latest two. Keep using it.
- Types seen: `docs:` (new spec doc) and `fix(spec):` (correcting ambiguities in a spec).
  Use the `spec` scope for doc corrections. Expected code scopes: `domain`, `ui`, `api`, `db`.
- Subjects are lowercase and imperative, and they name the file being changed,
  e.g. `fix(spec): resolve ... ambiguities in FRONTEND.md`.
- Each commit touches one doc. Keep commits focused on one concern.

## Code Architecture (planned)

- TypeScript modular monolith with intake, allocation, reconciliation, reporting and
  authorization modules.
- Frontend: React 18 + Vite + TS (strict), TanStack Query v5, Zod v3, Tailwind and
  `@tailwindcss/forms`, `lucide-react` icons.
- Server: Hono on Cloudflare Workers at `/api/v1`, served from the same origin as the static app.
  Data and auth: Supabase Postgres + Auth via the transaction pooler, using postgres.js with
  `max: 1` and `prepare: false` over TLS.
- Frontend layout lives under `frontend/src/`:
  - `domain/` holds pure TS with zero DOM dependencies: `types.ts` (all contracts),
    `srsMaxMin.ts`, `hamiltonBaseline.ts`, `scenarios.ts`, `reconciliation.ts`, `sanitizer.ts`.
  - The rest are `components/{common,layout,modals}/`, `hooks/` (`use*`),
    `services/{api.ts,mockApi.ts}` and `views/*View.tsx`.
- Naming: components and views use `PascalCase.tsx` with a `View` suffix for screens. Domain
  modules use `camelCase.ts`. ID types are branded aliases (`RegionId`, `CenterId`, ...).
- The browser and the server share one allocation library. The server never trusts an
  allocation sent by the browser and recomputes it on accept.

## Domain Invariants (never violate)

- There are two algorithms. Never merge them:
  - Progressive max-min (leximin) is the fairness plan. Ties go to lowest coverage, then
    larger next coverage, then lowest `regionId`.
  - Hamilton largest remainder with iterative redistribution is only the comparison baseline.
- Use exact integer math. Compare coverage with BigInt cross-products. Decimals are for
  display only. Over the wire, rationals travel as `RationalDTO` with string fields.
- Kits are whole and non-negative. Never exceed confirmed stock, usable capacity or unmet demand.
- Missing is not zero. Zero demand means coverage is N/A. A closed center sets capacity to 0
  but keeps need visible (`unserviceable_center_closed`).
- Hypothetical stock never becomes confirmed stock. Completed dispatches are never reassigned.
- Reconciliation has two separate layers:
  - Dispatched = Received + InTransit + Loss + Unresolved
  - Received = Collected + Damaged + Remaining
- A discrepancy is a review signal, never fraud. Corrections append new events instead of
  rewriting old ones.
- Store timestamps in UTC and display them in IST.

## Workflows

- **Plan accept** (`POST /api/v1/plans/accept`):
  - Requires an expected revision, an `Idempotency-Key` (one UUID v4 per intent, reused on
    retry) and a justification of at least 10 characters.
  - Runs in READ COMMITTED with `SELECT period FOR UPDATE`, then recomputes, inserts the
    receipt and audit event, and bumps the revision.
  - Errors: 409 stale revision, 422 when the key is reused with a different payload, 403 for a
    different actor.
- **Receipt fingerprint:** SHA-256 over canonical JSON. Keys are sorted at every depth,
  numbers are base-10 integers, timestamps are UTC with a `Z` suffix, and volatile UI state is
  excluded.
- **CSV:** use Zod pre-flight validation. Escape cells starting with `=`, `+`, `-`, `@` or a
  control character on export.
- **Tenant isolation:** Postgres RLS plus repository functions that require org context
  (`SET LOCAL app.org_id`). The runtime role is never a table owner or BYPASSRLS.
- **UI rules:** no emojis, no Inter font (use Geist Sans plus JetBrains Mono `tabular-nums`
  for numbers), Zinc/Emerald tokens, no "card-soup", and print through `@media print` with no
  PDF library.
- **Budgets:** preview under 50 ms for 100 centers and p95 under 100 ms, initial JS under
  200 KB gzipped, and a 16 ms main-thread budget before adding a Web Worker.
- **Cut order if short on time:** LLM, then broad UI automation, then k6. Never cut correct
  allocation, validation, the baseline, the disruption comparison or reconciliation.

## Testing Patterns

- Golden fixtures (stock 120, demand [60,60,60]) are the acceptance gate:
  - capacities [60,40,60] give 40/40/40
  - B=20 gives 50/20/50
  - +20 stock with B=20 gives 60/20/60
  - restoring B gives 40/40/40
  - closing C gives 60/40/0
- Reconciliation fixture: 40 dispatched and 35 received leaves 5 unresolved. With 25
  collected, 10 remain at the center.
- Target 10 golden input/output fixture files covering base, disruption, extra stock, zero
  stock or demand, closed center, capped demand, committed dispatch and ties. Run them against
  the engine and against an independent evaluator, and add an exhaustive small-case test.
- Mandatory tests: simultaneous accept, duplicate retry (no double reservation), cross-org
  isolation (Org A cannot read Org B), wrong-operator rejection, 401/403 on a bad JWT, and the
  CSV formula guard.
- Optional if time permits: one Playwright smoke test and a k6 run at 200 RPS for 2 minutes.
- CI runs types, fixtures, the evaluator, migration and DB tests, and the frontend build.
