# Technical plan reference

Source: FairShare Final Technical Plan v3, 10 November 2026 (three-page PDF supplied by the user). `context.md` contains additional project detail.

## Scope and boundaries

- One explicit period, whole kits, one assigned center per region, initially up to 100 centers.
- React/Vite previews are drafts; Hono on Cloudflare Workers is authoritative, backed by Supabase PostgreSQL and Auth.
- Share TypeScript domain logic between browser and API. Keep progressive max-min fairness separate from the capacity-aware Hamilton baseline; independently validate both.
- Preserve confirmed versus hypothetical stock, existing dispatch commitments, provenance, revisions, and append-only reconciliation facts.
- Enforce organization isolation using verified membership, transaction-local context, RLS, restricted roles and scoped foreign keys. No public signup or service-role runtime.
- Require idempotency, revision checks and period locking for acceptance; reject stale or invalid changes and fail writes closed when the database is unavailable.
- The optional LLM is outside the critical path, requires validated output and human confirmation, and cannot decide allocations.
- Performance, cost, and recovery numbers in the PDF are targets or estimates, not verified outcomes.

## Decision to reconcile before implementing acceptance

The PDF says to recompute from authoritative inputs before the short write transaction, then lock the period and compare the revision. `context.md` instead places reload and recomputation inside that transaction. Preserve the same correctness guarantees and settle the placement with a concurrency-focused design and tests before implementing it. The PDF also scopes idempotency uniqueness to organization and request key, binding actor and payload; the existing context describes organization, actor and key. Do not silently assume these are equivalent.

## Setup milestone

The starter provides a web shell, a health route, workspace configuration and reserved locations for shared domain code, migrations and tests. It does not implement the business workflow, database security, or deployment.
