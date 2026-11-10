# Test plan

Add independently checked golden allocation fixtures, an independent validity evaluator, exhaustive small-case checks, reconciliation balances, and database integration tests for isolation, concurrent acceptance and idempotency. Do not treat placeholder directories as passing tests.

The database suite now lives in `database/schema.test.mjs`: run `npm run test:db` to execute the actual migrations and synthetic seed in embedded PostgreSQL. `npm test` also runs the API and domain suites. Hosted Supabase and multiple-client acceptance/concurrency tests are still pending; see `docs/database.md`.

`backend/security-input-api.test.ts` is the adversarial campaign for authentication, authorization, input validation, API flows, server responses and export safety; run it with `npm run test:backend`. Its cases are regression tests for the defects listed in `docs/security-test-report.md`.

Frontend: `apps/web/test/planning.test.ts` unit-tests the browser planning and reconciliation logic (run with `npm test`). `apps/web/e2e/frontend.e2e.mjs` drives the built app in Chromium as all three demo users; it needs the `playwright` package. Build and serve the app (`npm run build`, then `npx vite preview --port 4173` in `apps/web`), then run `BASE_URL=http://127.0.0.1:4173 node --test apps/web/e2e/frontend.e2e.mjs`.
