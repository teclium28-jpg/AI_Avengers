# Test plan

Add independently checked golden allocation fixtures, an independent validity evaluator, exhaustive small-case checks, reconciliation balances, and database integration tests for isolation, concurrent acceptance and idempotency. Do not treat placeholder directories as passing tests.

The database suite now lives in `database/schema.test.mjs`: run `npm run test:db` to execute the actual migrations and synthetic seed in embedded PostgreSQL. `npm test` also runs the API and domain suites. Hosted Supabase and multiple-client acceptance/concurrency tests are still pending; see `docs/database.md`.

`backend/security-input-api.test.ts` is the adversarial campaign for authentication, authorization, input validation, API flows, server responses and export safety; run it with `npm run test:backend`. Cases marked `todo` reproduce open defects listed in `docs/security-test-report.md` and do not fail the run; remove the marker when the defect is fixed.
