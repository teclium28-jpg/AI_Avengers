# Security, input and API test report

Date: 10 November 2026. Code under test: `set-up-start-with-this` at `4bcfab4`
(merged into this branch). All identities and data used were synthetic.

## Status after fixes

| Id | Status |
| --- | --- |
| F-01 overrides with non-manual algorithm | Fixed: 422 `INVALID_REQUEST` (`contracts.ts`) |
| F-02 NUL character in text | Fixed: rejected by schema, 422 |
| F-03 key reuse with different payload | Fixed: 422 `KEY_CONFLICT`, also on the concurrent path |
| F-04 another actor replaying a key | Fixed: 403 before the stale-revision check |
| F-05 far-future event timestamps | Fixed: more than 24 h ahead is rejected |
| F-06 health headers | Fixed |
| F-07 replay always "changed" | Fixed: revision counter no longer counts as evidence |
| F-08 web login | Partly fixed. Password no longer printed, prefilled or stored in plain text; exact username matching; one generic error; role/partial-name session forgery closed; demo notice added. **Still not a security boundary**: setting `localStorage.fairshare_auth_user` to a valid user id still signs in. Real fix is Supabase Auth |
| F-09 Supabase direct writes | Sign-up disabled in `supabase/config.toml`. Browser writes to Supabase are now off unless `VITE_ENABLE_SUPABASE_SYNC=true` at build time; community requests no longer write to `demand_records` at all. Row-level security on those tables still needs checking before enabling it |
| F-10 zod advisory | Open: needs the zod 4 upgrade |

The regression tests for F-01 to F-07 are in `tests/backend/security-input-api.test.ts`
(57 backend tests pass). The sections below describe the findings as first reported.

## What was run

| Suite | Command | Result |
| --- | --- | --- |
| Existing API, domain and schema tests | `npm test` | 109 pass, 0 fail |
| Existing PostgreSQL backend campaign | `npm run test:backend` | 10 pass, 0 fail |
| **New** adversarial campaign, `tests/backend/security-input-api.test.ts` | `npm run test:backend` | 40 pass, 0 fail, 7 open defects (`todo`) |
| Type check | `npm run typecheck` | clean |
| Live local Worker (`wrangler dev`) | 14 manual HTTP probes | behaves as designed |
| Web login in headless Chromium | 4 manual probes | 3 bypasses confirmed |
| Dependency audit | `npm audit` | 1 high advisory |

The new campaign runs the real Hono app against native PostgreSQL with every
migration applied and the restricted `fairshare_runtime` role, in process and over a
real HTTP socket. It was run three times in a row with identical results.

Not tested: the hosted Supabase project, a deployed Cloudflare Worker, and load
(k6). No live database is configured in this environment, so the live Worker could
only be checked for its fail-closed behaviour.

## What the new campaign covers

- **Authentication (5 cases).** Missing, malformed and oversized credentials; `alg:none`,
  HS256 key confusion, foreign key, embedded JWK and tampered payload; expired,
  not-yet-valid, wrong issuer/audience and missing claims; role claims inside the
  token; organization header that is absent, malformed, or not the caller's.
- **Server responses (6).** Error envelope and no leakage of internals; `no-store`,
  `nosniff`, no CORS grant; unique request ids; 404 only after authentication;
  hostile path and query values; 413 with and without `Content-Length`; 429 with
  `Retry-After`, scoped per actor.
- **Input validation (14).** Malformed JSON, prototype-pollution keys, every
  out-of-contract field on accept, import, movement event and review; about 60
  bad quantity spellings; manual-override validity; ledger-inconsistent imports;
  impossible movement balances; NUL, unpaired surrogates, bidi and SQL-looking text.
- **Authorization (8).** Full role matrix (coordinator, reviewer, assigned and
  unassigned operator) across 12 actions; demotion and deactivation; idempotency-key
  ownership; cross-organization access on every endpoint; direct SQL as the
  runtime role; closed periods.
- **API flows (9).** The hand-checkable 40/40/40, 50/20/50, 60/20/60 and closure
  scenarios through the public API; exactly-once acceptance under retry and under 20
  concurrent requests; two-balance reconciliation (40 dispatched, 35 received, 25
  collected); corrections; receipt replay; pagination.
- **Export safety (1).** Formula and HTML payloads stored in region ids, names and
  reasons are neutralised in CSV and HTML downloads, with the right headers.

## What held up

No way was found to read or change another organization's data, act without a
valid token and active membership, exceed a role, smuggle a browser-computed
allocation or stock figure into acceptance, double-reserve on retry or race, put an
impossible fact into the ledger, or get an executable formula or script into an
export. Rejected writes left no partial state in every case checked.

## Open defects

Each backend defect has a failing `todo` test named with its id.

| Id | Severity | Finding | Suggested fix |
| --- | --- | --- | --- |
| F-08 | High if deployed beyond a demo | Web login is client-side only. The password `admin@123` ships in the JS bundle, is prefilled, printed on the page, and returned in the wrong-password message. Identifier `a` logs in as the State Relief Director (substring match on name). Setting `localStorage.fairshare_auth_user` to `{"role":"admin"}` gives the same session with no password. `apps/web/src/context/AuthContext.tsx:20-148` | Replace with Supabase Auth and send the JWT to the API; until then label the screen as a demo and remove the password hints. |
| F-09 | Medium, not verified live | The browser inserts into Supabase tables `demand_records`, `authoritative_ledger` and `inbound_shipments` using the publishable key and no user session (`CommunityRequestView.tsx:43`, `OperationalContext.tsx:580,646`). These tables are not in the repository migrations, so their row-level security could not be checked. `supabase/config.toml:178` has `enable_signup = true` although the plan requires public sign-up disabled. | Confirm RLS on those tables in the hosted project, or route these writes through the API; disable sign-up. |
| F-02 | Medium | A NUL character (`\u0000`) in any free-text field (`reason`, `source`, ...) returns 503 `DEPENDENCY_UNAVAILABLE`. PostgreSQL rejects it and the error code is unmapped, so a client input error looks like an outage. | Reject `\u0000` in the Zod `text` and `reason` schemas. |
| F-01 | Medium | `overrides` sent with a non-manual algorithm returns 503. `computeDecision` throws a plain `Error`, which `onError` maps to 503. | Add a Zod refinement, or throw `ApiError(422)`. |
| F-07 | Low | Replaying a receipt always reports `changed: true` with `EVIDENCE_CHANGED`, even immediately after acceptance, because acceptance itself advances the period revision. Reviewers cannot tell a real input change from none. | Compare against the accepted revision (recorded revision + 1) or compare sources only. |
| F-03 | Low | Reusing an idempotency key with a different payload returns 409; `context.md` and `docs/integration-contract.md` specify 422. | Align code or documents. |
| F-04 | Low | Another coordinator replaying a completed acceptance key gets 409 `STALE_REVISION`, not the documented 403. The saved result is not disclosed and nothing is written. | Check key ownership before the revision check. |
| F-05 | Low | `occurredAt` is format-checked only. An event dated year 9999 is accepted, and the ledger is append-only, so it cannot be removed. | Reject timestamps beyond a small clock-skew allowance. |
| F-06 | Info | `GET /api/v1/health` has no `Cache-Control: no-store` or `X-Content-Type-Options` header; it is registered before the header middleware. | Register the route after the middleware. |
| F-10 | Info | `npm audit`: zod below 4.6.6, advisory GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized constrained collections). The 256 KiB body limit bounds the exposure. | Plan the zod 4 upgrade. |

## Observations, not defects

- An unassigned operator gets 404, not 403, for another center's reservation or
  movement. Row-level security hides the row, which avoids confirming it exists.
- A review update or import that names an unknown period returns 422
  `INVALID_RECORD` (foreign key on the idempotency claim), where acceptance returns
  404. The answer is the same for a foreign and a nonexistent period.
- Duplicate JSON keys resolve last-wins before validation.
- Rate limiting applies after authentication, so unauthenticated floods depend on
  Cloudflare, not on the application.
- Every rejected movement report (for example a zero dispatch) opens a review and
  stores a conflicting-report row. That is by design, but an authorised user can
  fill the review queue.
- With no `SUPABASE_URL`, the local Worker answers 503 `NOT_CONFIGURED` on every
  protected route, 404 on the database diagnostic, and 413 on a 300 KiB body.
- Initial JavaScript is 173 KB gzipped, inside the 200 KB budget.

## Running the backend suites

`npm run test:backend` starts an embedded PostgreSQL, which refuses to run as root.
In a root container run it as an unprivileged user, for example:

```sh
runuser -u postgres -- env HOME=/tmp/pghome node --experimental-strip-types --test tests/backend/*.test.*
```
