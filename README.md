# FairShare

FairShare is a food-bank decision-support prototype for planning, explaining, reconciling, and replanning distributions. The technical baseline is in [context.md](context.md) and the supplied FairShare Final Technical Plan PDF.

This repository includes the team's browser demo, data preprocessing, allocation engines,
local Hono health endpoint, and PostgreSQL schema/seed migrations. Hosted authentication,
database API integration and authoritative acceptance remain unfinished. Browser demo
receipts and reconciliation actions are simulated.

## Structure

- `apps/web` - React and Vite interface.
- `apps/api` - Hono API for Cloudflare Workers.
- `packages/domain` - shared domain logic.
  - `src/types.ts`, `src/preprocessing.ts` - input schema + cleaning pipeline (missing
    values, duplicates, inconsistent names, invalid/impossible quantities).
  - `src/baseline.ts` - capacity-aware proportional allocation baseline (Hamilton
    largest-remainder) plus an independent validity evaluator.
  - `src/fairness.ts` - the team's progressive max-min engine.
  - `test/` - golden fixtures against `context.md`'s hand-checkable acceptance
    examples, edge cases (zero stock/demand, closed region, prior dispatch), and
    cleaning-rule unit tests. Run with `npm run test --workspace @fairshare/domain`.
- `data/samples` - three clearly-labeled **synthetic** scenarios (normal, shortage,
  reduced-capacity) used by the tests above. No real DataNova dataset has reached the
  team yet — see `docs/data-preparation.md`.
- `supabase/migrations` - ordered schema migrations, integrity triggers and tenant RLS.
- `supabase/seed.sql` - opt-in synthetic development fixtures; no login accounts.
- `tests/database` - executable PostgreSQL migration/constraint/seed tests.
- `docs` - planning and implementation notes, including `data-preparation.md`.

## Local development

Requires Node.js and npm. From the repository root:

```powershell
npm install
npm run dev
```

In a second terminal, run `npm run dev:api`. The Vite development server proxies `/api` to the local Worker at `http://127.0.0.1:8787`. Run `npm run typecheck` and `npm run build` to check the starter.

The API runs independently of the frontend build. Check `http://127.0.0.1:8787/api/v1/health` for liveness. See [local API and database setup](docs/local-api.md) for the token-protected Supabase transaction check and [integration decisions](docs/integration-contract.md) for shared types, stock accounting and acceptance/idempotency rules.

No Supabase credentials are needed for this shell. Future secrets must stay in local environment files, not Git.

Run `npm test` for workspace and database tests, or `npm run test:db` for the schema suite alone. See [database setup and guarantees](docs/database.md) before creating the hosted project or applying migrations.
