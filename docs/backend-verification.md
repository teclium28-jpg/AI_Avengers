# Local verification — 2026-11-10

Final check: `npm test`, `npm run typecheck`, `npm run build`, and local Worker `wrangler deploy --dry-run` passed. `npm run test:backend` passed all 10 tests with fresh seed `973266076`; 22 API samples measured p50 20.59 ms / p95 78.50 ms. `scripts/backend-demo.ts` completed successfully against native PostgreSQL. Build initially hit a sandbox filesystem restriction and passed when rerun with the required access. Existing frontend bundle-size warning remains. Changes are local and uncommitted.

Windows / Node native test runner / PostgreSQL 17.11 / in-process Hono. Generated organizations, UUIDs, actors, quantities and histories; no sample dataset reuse. Test identities are explicitly synthetic; membership provenance is `reported` only to satisfy the production authenticated-user schema constraint.

- Native campaign seed `1583130115`: 9 tests passed, including parent; complete API flow, distinct/same-key races, lost response replay, changed payload/stale revision, rollback, cross-org API/SQL, revoked membership, invalid JWT, payload/page limits, capacity change vs in-flight acceptance, stale dispatch denial, wrong-center operators, confirmed zero and exact corrections.
- Pure campaign seed `913261348`: 300 generated frontier domains, 3,015 candidate scenarios, 247 distinct domain signatures; 300 generated accounting histories; 60 generated receipt/tamper cases. Four tests passed. Fast-check supports shrinking and seed/path replay.
- Mutation seed `707993591`: all seven deliberate mutations detected: transport double counting, ignored collection, ignored correction, skipped fingerprint, reversed food objective, missing CSV neutralization and missing HTML escaping. Native pre-commit fault also verifies rollback, not just returned errors.
- First native API latency sample: seed `195715901`, 21 requests, p50 15.97 ms, p95 51.49 ms. Expanded sample: seed `1583130115`, 22 requests, p50 15.12 ms, p95 77.10 ms. These small mixed-workload local samples are observations, not throughput/load-test or hosted latency claims.
- Original regression suite preserved. `npm test`, `npm run test:backend`, `npm run typecheck`, `npm run build` are the verification commands; consult terminal output for the latest run.

Code/security review addressed role-context isolation, operator review visibility, actor-bound keys, reservation reload after waiting for the period lock, immutable review explanations, canonical content checks and export escaping. Runtime SQL is parameterized and generic errors avoid exposing credentials/payloads. No independent reviewer or formal security audit is claimed.

Remaining tests are stated in backend-handoff.md rather than represented as passing. No hosted Supabase credentials were available. Native Postgres tests do not establish Supabase service/JWKS/pooler behavior or deployment readiness.
