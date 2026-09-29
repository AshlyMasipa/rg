# packages/engine — Person B

Pure TypeScript matching engine for RugbyGrid: `solve()` matches a
community need to a field/coach/kit/transport/sponsor bundle, and
`optimisePortfolio()` picks the best set of bundles under a budget
(0/1 knapsack). No DB, no HTTP, no sockets — everything here is a
pure function that takes plain data in and returns plain data out.

## Running tests

```bash
pnpm test         # run once
pnpm test:watch   # watch mode
```
Last verified run:
$ pnpm test
RUN v5.0.2 C:/Users/masip/OneDrive/Desktop/rugbygrid/packages/engine
✓ test/optimise.test.ts (3 tests) 11ms
✓ test/solve.test.ts (12 tests) 39ms
Test Files 2 passed (2)
Tests 15 passed (15)

12 tests in `solve.test.ts` (8 hard-constraint tests from the H0–H3
baseline + 4 edge-case tests: `balls:0`, tie-breaking, multi-day
needs), 3 knapsack tests in `optimise.test.ts`. If your local run
shows a different count, something changed — check git diff before
assuming it's fine.

## What's real vs. stubbed

Built solo, ahead of the real `packages/shared` and real DB/seed
data, because coordination windows with the rest of the team have
been limited. Everything below is a temporary stand-in until we
sync and swap to the real thing.

| File | Status | Notes |
|---|---|---|
| `src/types.ts` | **Stand-in for `packages/shared`** | Field names copied from the plan's contract (Section 2.1/2.3) as closely as possible. Once A commits the real shared schema, diff this file against it and swap imports — should be near-mechanical if names match. |
| `src/types.ts` → `Assignment` | **Contains fields not in the real DB schema** | Added `field_id`, `coach_id`, `days`, `start_time`, `end_time` as optional fields so double-booking could be checked. The real `assignments` table doesn't have these — see NOTES.md #1. |
| `fixtures/seed.json` | **Hand-written, not the real seed** | Loosely based on the plan's Section 5 demo data (Orlando/Central fields, Naidoo/Dlamini/Mokoena coaches) but not guaranteed to match A's actual `seed/fresh.json` byte-for-byte. Swap once real seed exists; some tests may need adjusting if field/coach names or IDs differ. |
| `src/solve.ts` | **Fully implemented**, all hard constraints + scoring + explanations + infeasible/binding-constraint path | See NOTES.md for two open contract questions that affect its correctness once real data lands. |
| `src/optimise.ts` | **Fully implemented**, DP knapsack | No open questions — this one's self-contained and doesn't depend on the shared schema at all. |
| `src/simulate.ts` | **Fully implemented**, wraps `solve()` + `optimisePortfolio()` per Section 2.4 | Applies `remove_coach_ids` and `max_travel_km` overrides to a copy of `world` (never mutates caller's data), calls `solve()` per need_id, feeds top bundles into the knapsack. See NOTES.md #3 for an unconfirmed assumption baked into the value calculation. |

## Before trusting this against real data

Read `NOTES.md` first — it documents two specific assumptions baked
into `solve.ts` (how double-booking is checked, and which distance
travel constraints actually gate on) that were made without being
able to confirm them with A. Both are plausible readings of the
plan, but neither is confirmed. Resolve those before the H20
integration gate, not after.