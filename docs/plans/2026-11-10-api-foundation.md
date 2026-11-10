# API foundation and team integration

Goal: integrate the current team work, settle the server transaction design, run Hono locally, and test a Worker-to-Supabase transaction when credentials are available.

Baseline: setup branch pulled to 024d57f; main frontend specification merged locally. Existing domain suite: 20 tests pass. No database environment configuration is present.

- [x] Pull the target branch and inspect data/frontend additions.
- [x] Record actual shared types, accounting conventions, and remaining teammate confirmations in `docs/integration-contract.md`.
- [x] Align `context.md` and technical notes to the PDF acceptance/idempotency rules.
- [x] Fix the unsupported Worker compatibility date, add a standalone local configuration, and verify health over HTTP.
- [x] Add a separate token-protected database diagnostic entrypoint using postgres.js, max 1, prepared statements off, TLS and a read-only transaction. Do not add a diagnostic endpoint to the production API.
- [x] Run domain/API tests, typechecking, build and Worker bundle checks; review touched code.
- [ ] Receive data/frontend owners' acknowledgment of types and stock/capacity conventions.
- [ ] Run the transaction against Supabase and record actual results. Requires a restricted database login and connection string; remote-edge proof also needs Cloudflare account access.

Scope: no allocation rewrite, acceptance endpoint, production database migration or staff-auth implementation in this foundation task. A design decision recorded here does not imply teammate acknowledgment or a deployed feature.

Verification: 26 tests pass (20 incoming domain + 6 API); typecheck, frontend build and production Worker dry run pass. Live local HTTP health returns 200. Missing-token database diagnostic returns 404 over HTTP. `npm run check:db` correctly stops with missing-configuration instructions; no Supabase transaction ran. Author reviewed the touched code for route separation, credential leakage, SQL parameterization, cleanup and compatibility. No independent reviewer was dispatched.

Remaining external requirements: no database URL/token is configured; `wrangler whoami` reports unauthenticated. Ask the coordinator for private Supabase setup and Cloudflare sign-in, and relay the contract document to the teammates. Implementation changes remain local and uncommitted; the frontend merge is a local commit.
