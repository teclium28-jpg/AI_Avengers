# FairShare

FairShare is a food-bank decision-support prototype for planning, explaining, reconciling, and replanning distributions. The technical baseline is in [context.md](context.md) and the supplied FairShare Final Technical Plan PDF.

This repository currently contains a starter shell plus the data-preparation and
baseline-allocation pieces. Authentication, database access, acceptance, the
progressive max-min fairness engine, reconciliation, and exports are not implemented.

## Structure

- `apps/web` - React and Vite interface.
- `apps/api` - Hono API for Cloudflare Workers.
- `packages/domain` - shared domain logic.
  - `src/types.ts`, `src/preprocessing.ts` - input schema + cleaning pipeline (missing
    values, duplicates, inconsistent names, invalid/impossible quantities).
  - `src/baseline.ts` - capacity-aware proportional allocation baseline (Hamilton
    largest-remainder) plus an independent validity evaluator. The progressive
    max-min fairness engine (the actual SRS policy) is not implemented yet.
  - `test/` - golden fixtures against `context.md`'s hand-checkable acceptance
    examples, edge cases (zero stock/demand, closed region, prior dispatch), and
    cleaning-rule unit tests. Run with `npm run test --workspace @fairshare/domain`.
- `data/samples` - three clearly-labeled **synthetic** scenarios (normal, shortage,
  reduced-capacity) used by the tests above. No real DataNova dataset has reached the
  team yet — see `docs/data-preparation.md`.
- `supabase/migrations` - future database migrations and RLS policies.
- `tests` - future independent evaluator, fixtures and integration tests (DB/API level).
- `docs` - planning and implementation notes, including `data-preparation.md`.

## Local development

Requires Node.js and npm. From the repository root:

```powershell
npm install
npm run dev
```

In a second terminal, run `npm run dev:api`. The Vite development server proxies `/api` to the local Worker at `http://127.0.0.1:8787`. Run `npm run typecheck` and `npm run build` to check the starter.

No Supabase credentials are needed for this shell. Future secrets must stay in local environment files, not Git.
