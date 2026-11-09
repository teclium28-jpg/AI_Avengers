# Sample datasets — synthetic, labeled

**All rows in this folder are synthetic** (`reported_or_simulated = simulated`). No
real DataNova dataset has reached the team yet; these exist so the baseline engine,
UI and API have something concrete to run against while that's sorted out. See
`docs/data-preparation.md` for the schema these follow and how to swap in a real
dataset later.

| Scenario | Stock | A demand/capacity | B demand/capacity | C demand/capacity | Expected baseline |
|---|---|---|---|---|---|
| `normal/` | 120 | 60 / 60 | 60 / 40 | 60 / 60 | 40 / 40 / 40 |
| `shortage/` | 90 | 60 / 60 | 60 / 40 | 60 / 60 | 30 / 30 / 30 |
| `reduced-capacity/` | 120 | 60 / 60 | 60 / 20 | 60 / 60 | 50 / 20 / 50 |

`normal/` and `reduced-capacity/` are the exact numbers from `context.md`'s
hand-checkable acceptance examples, so the baseline output can be verified by eye.
`shortage/` cuts total stock below total demand without any capacity constraint
binding, to exercise the "not enough to go around" path separately from the
"capacity is the bottleneck" path.
