# Local Hono API and Supabase transaction check

## Current evidence: 10 November 2026

- Pulled setup branch to 024d57f and merged frontend spec from origin/main (1e57c8d).
- Local Wrangler initially rejected compatibility date 2026-11-10 as future. Both configs now use 2026-11-01, accepted by the installed runtime.
- `npm run dev:api` starts Hono in the local Cloudflare workerd runtime on 127.0.0.1:8787. No Cloudflare account or Supabase setup is required for health.
- Actual HTTP request: `GET /api/v1/health` returned 200 and `{"status":"ok","stage":"scaffold"}`. This is liveness only.
- `wrangler whoami` reports unauthenticated. No Supabase/DB/Cloudflare environment variables or local secret files were present at inspection.
- No Supabase connection or transaction has succeeded yet. A dry run or unit test is not evidence of database connectivity or remote-edge execution.
- Current verification: 26 tests pass (20 domain, 6 API), typecheck and frontend build pass, production Worker dry run passes. A live HTTP request to the diagnostic without a configured token returns 404 as intended. The database runner stops with instructions when the token is absent.

## Start the API

From the project root:

```powershell
npm install
npm run dev:api
```

In another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/v1/health
```

The local config has no static asset dependency, so the API starts before building the frontend. The production `wrangler.jsonc` still serves built React assets; use `npm run build` before a production bundle check.

## Supabase setup required from the project owner

1. Create/open the team's Supabase project; record the actual region chosen (Mumbai is preferred if available).
2. Provision a dedicated, non-owner PostgreSQL LOGIN role such as `fairshare_runtime`, with a privately chosen password, no superuser or BYPASSRLS privilege and no membership in privileged roles. For this read-only probe it needs login/database connection only, not business-table permissions. The application role and approved SQL functions will need separate reviewed migrations later.
3. In **Connect**, choose **Transaction pooler**, and copy the actual host, project reference and port (6543). For a custom login the pooled username is `fairshare_runtime.PROJECT_REF`. Use that role's password, percent-encoding reserved URL characters. Do not use the administrator or service-role identity.
4. Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars`. Fill `DATABASE_URL` and set `DB_PROBE_TOKEN` to a new long random token (for example 32 random bytes encoded as hex). Keep this file private; it is ignored by Git.
5. Restart `npm run dev:api`, then run `npm run check:db` from the root.

The check runs an explicit read-only transaction: set transaction-local time limit and marker, inspect role flags/ownership, verify the marker in a subsequent query, and await COMMIT. It does not change schema or business facts. Expected output begins `PASS: Worker completed a read-only PostgreSQL transaction`. Missing config/connection errors return 503; the diagnostic does not echo secrets or raw driver errors. A missing probe token disables the route; a wrong token returns 403.

Connection settings: max one client connection per probe, `prepare: false`, sequential queries, verified TLS, 5-second connection timeout, 5-second statement timeout and bounded cleanup. A certificate trust failure must be diagnosed using the project's trusted CA/runtime support; do not disable TLS or certificate verification to obtain a passing result.

## Prove execution on Cloudflare's network

Local workerd-to-Supabase evidence and remote Cloudflare-to-Supabase evidence are separate. After the local transaction passes:

1. Run `npm exec -w @fairshare/api -- wrangler login` and complete sign-in in your browser.
2. Stop the local API, then run `npm exec -w @fairshare/api -- wrangler dev --remote --config wrangler.local.jsonc`. This runs the diagnostic Worker in a Cloudflare preview session; it uses the Supabase credentials supplied for the probe.
3. Keep that terminal open and run `npm run check:db` in another terminal. Record whether remote mode and the transaction both succeeded, with the UTC time and source commit. Close the preview when finished.

The diagnostic route exists only in `src/local.ts`. The production `src/index.ts` does not expose it. Do not deploy the local config as the production API.

## Official references consulted

- [Supabase connection modes and pooler settings](https://supabase.com/docs/guides/database/connecting-to-postgres): transaction pooling, custom pooled usernames, prepared statements and TLS.
- [Postgres.js transactions and Worker support](https://github.com/porsager/postgres#transactions): scoped transaction callback and COMMIT/ROLLBACK behavior; Node compatibility for Workers.

The shared-pooler settings here are not Hyperdrive settings. Hyperdrive remains deferred; its current driver requirements must be checked independently if introduced.
