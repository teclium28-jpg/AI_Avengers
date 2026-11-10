# Research evidence for the backend

Inspected 10 November 2026. Implementation is original; no source code is copied.

| Pinned source | Observed behavior in inspected file | FairShare opportunity |
| --- | --- | --- |
| [HappyMeal MILP](https://github.com/dataforgoodfr/batch5_phenix_happymeal/blob/952e14d117ef57b06606b6ab6f6fb7d0c947f220/meal_balancer/algos_optimisation/milp_gurobi_v0.py), commit `952e14d117ef57b06606b6ab6f6fb7d0c947f220` | Integer product-to-meal variables minimize unused supply subject to product stock and category-weight bands; Gurobi time limit 600 seconds. It reads solution attributes after optimization without an explicit feasible-status branch in this file. | Keep objectives and constraints explicit, independently validate every result and expose failure states. FairShare uses its already approved discrete policy, not this nutritional MILP or a Gurobi dependency. |
| [FoodBank posting service](https://github.com/hyce-mario/FoodBank/blob/6899ca5ca7958b86e8354e65162ff0413a9e4873/app/Services/DistributionPostingService.php), commit `6899ca5ca7958b86e8354e65162ff0413a9e4873` | One DB transaction locks inventory rows, rejects insufficient stock, appends movements and updates stock/distributed quantities; composition uses a recorded household-size snapshot. No request idempotency guard is visible in this method. | Preserve atomic ledger/reservation effects, snapshot decisions and enforce explicit same-key concurrency semantics at the acceptance boundary. This observation does not establish that the whole repository lacks deduplication. |
| [FoodBank rules controller](https://github.com/hyce-mario/FoodBank/blob/6899ca5ca7958b86e8354e65162ff0413a9e4873/app/Http/Controllers/AllocationRulesetController.php), same commit | Validates rule fields and numeric ranges, normalizes and sorts rule bands, supports preview/create/update/delete. No overlapping-band check or organization filter is visible in this controller. | Publish runtime-validated contracts and enforce current membership/tenant scope in the API and SQL. Middleware/model behavior elsewhere was not audited, so no repository-wide authorization claim is made. |

HappyMeal has a root LICENSE (MIT). FoodBank has no root license file in the
inspected directory listing; no copying permission is assumed. Licenses of referenced
frameworks are not permission to copy application code. Only behavioral lessons are used.

Infrastructure references: [PostgreSQL RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
[PostgreSQL isolation](https://www.postgresql.org/docs/17/transaction-iso.html),
[jose JWKS options](https://github.com/panva/jose/blob/main/docs/jwks/remote/interfaces/RemoteJWKSetOptions.md),
[native test PostgreSQL](https://github.com/leinelissen/embedded-postgres).
