# FairShare

FairShare is a food-bank decision-support prototype for planning, explaining, reconciling, and replanning distributions. The technical baseline is in [context.md](context.md) and the supplied FairShare Final Technical Plan PDF.

This repository currently contains a starter shell only. Allocation, authentication, database access, acceptance, reconciliation, and exports are not implemented.

## Structure

- `apps/web` - React and Vite interface.
- `apps/api` - Hono API for Cloudflare Workers.
- `packages/domain` - shared domain logic, including the future allocation engines.
- `supabase/migrations` - future database migrations and RLS policies.
- `tests` - future independent evaluator, fixtures and integration tests.
- `docs` - planning and implementation notes.

## Local development

Requires Node.js and npm. From the repository root:

```powershell
npm install
npm run dev
```

In a second terminal, run `npm run dev:api`. The Vite development server proxies `/api` to the local Worker at `http://127.0.0.1:8787`. Run `npm run typecheck` and `npm run build` to check the starter.

No Supabase credentials are needed for this shell. Future secrets must stay in local environment files, not Git.
