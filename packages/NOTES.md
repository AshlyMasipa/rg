# Engine package — open questions for A / team sync

Written solo during the H0-H20 build since we couldn't sync live.
Flagging here so these don't surface as surprises during integration.
Both are currently patched with a temporary assumption — search
`types.ts` and `solve.ts` for these same headings to find the code.

---

## 1. Assignment shape doesn't carry enough to check double-booking

**The gap:** Section 1's `assignments` table only has `bundle_id`,
`owner_role`, `start_date`, `weeks`. To check "is this field/coach
already booked in this slot" the engine needs to know *which*
field_id, coach_id, day and time each existing booking occupies —
but that lives on `opportunity_bundles`, not `assignments`, and
`solve()` per the 2.3 contract only receives `world.bookings:
Assignment[]`, not bundles.

**What I did as a stopgap:** added optional `field_id`, `coach_id`,
`days`, `start_time`, `end_time` directly onto my local `Assignment`
type in `types.ts`, and check double-booking against those. This is
NOT in the real shared schema — it's a placeholder so I could write
and pass the test.

**What needs deciding (pick one):**
- (a) A passes the *resolved* `OpportunityBundle` alongside each
  `Assignment` in `world.bookings` (join done before calling solve),
  so the engine gets field/coach/time without needing DB access, or
- (b) flatten field_id/coach_id/day/time onto `Assignment` itself in
  the real schema, or
- (c) some other join A does before calling `solve()` — I don't know
  A's DB layer well enough to know which is cheapest for them.

**Impact if unresolved:** double-booking silently won't work once
real data replaces my fixture — the engine will happily double-book
a field or coach because it can't see enough of `bookings` to check.

---

## 2. Ambiguous travel distance: school→field vs coach→field

**The gap:** the plan's example explanation line says "Orlando Field
is 3.8 km from the **school**" — but the only distance limit in the
schema is `coach.max_travel_km`, which reads as the **coach's own**
commute limit, not a school-to-field limit. These are two different
distances and the spec doesn't say which one transport/travel
constraints should actually gate on.

**What I did:** implemented `coach.max_travel_km` as checked against
haversine(coach.home, field location) — i.e. it's the coach's
commute that must fit the limit, with a transport offer able to
substitute if it doesn't. I compute school→field distance
separately, purely for the explanation string, to match the
plan's example wording. These two numbers are NOT the same value
and can differ a lot depending on where the coach lives.

**What needs deciding:** is there *also* meant to be a max distance
from school to field (e.g. so a school in Soweto doesn't get
matched to a field in Sandton even if a coach happens to live near
both)? If so, that's a missing field in the schema entirely, not
just an ambiguity in mine — worth raising with A since it may need
a new column.

**Impact if unresolved:** current engine could theoretically match
a field very far from the school as long as some coach happens to
live close to that field. Fine for demo fixture (only 2 fields, both
plausible distances), but a real risk if the judge or a live typed
input produces a school and field far apart with a nearby coach.

## 3. Assumption: what counts as "sessions" in the knapsack value

The contract says knapsack value = `participants * sessions` but never
defines "sessions" precisely. I used `need.weeks * need.days.length`
(total sessions delivered across the whole program) in `simulate.ts`.
If A or D expect "sessions" to mean something else (e.g. always 1,
or per-week count only), the portfolio's value numbers will look
wrong on the Simulator screen even though the code is working as
built. Confirm before H32 gate — this affects a number judges will
literally watch change live.

---

*Update this file rather than deleting entries once resolved — mark
them RESOLVED with the decision, don't remove, so the reasoning
trail survives past the hackathon.*