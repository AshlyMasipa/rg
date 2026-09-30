# AI package — findings and open questions for the team

Same purpose as `packages/engine/NOTES.md`: flag things here so they
don't surface as surprises during integration. Mark entries RESOLVED
with the decision rather than deleting them.

---

## 1. FREE TIER IS 20 REQUESTS PER DAY, NOT 10 PER MINUTE

**Read this one first.** The implementation plan says "free tier is ~10
requests/min on Flash". The actual quota, confirmed from a live 429:

```
quotaId:  GenerateRequestsPerDayPerProjectPerModel-FreeTier
limit:    20
```

**Twenty per day, per project, per model.** Scoped to the project, so a
second API key in the same project shares the same spent allowance.

**What this means:** one `verify` run is 5 requests. Five rehearsals of a
four-call demo is 20. Debugging is hundreds. Nobody can rehearse the
demo on free tier.

**What needs deciding:** the team needs ONE billing-enabled project
before rehearsal. A weekend of Flash-Lite traffic is roughly a dollar.
The plan already anticipated this ("Demo-day key: one key on a
billing-enabled project") — it is now mandatory, not an optimisation.

**Mitigations already in place:** both caches (extraction keyed on
normalised text, narrative keyed on the impact JSON) mean rehearsing the
same sentence costs zero after the first run. `AI_MODE=mock` needs no
quota at all and should be the development default.

**Stopgap if billing is refused:** the limit is per MODEL, so rotating
between `gemini-3.5-flash-lite`, `gemini-3.7-flash` and `gemini-3.8-flash`
gives ~60/day per person legitimately.

---

## 2. The plan's model IDs do not exist

`gemini-3-flash` is not a valid model ID (only `gemini-3-flash-preview`
exists), and `gemini-3.1-flash-lite` is deprecated.

Confirmed against the live model list on 2026-09-29. Use:

```
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-3.7-flash
```

Avoid the `gemini-flash-latest` / `gemini-flash-lite-latest` aliases —
they auto-update, so extraction behaviour could change between rehearsal
and stage with nothing in git history to explain it.

---

## 3. Deviation: Flash-Lite is PRIMARY, not the fallback

The plan has Flash primary with Flash-Lite as fallback. I inverted it.

**Why:** `gemini-3.6-flash` returned 503 "experiencing high demand" on
four of ten calls across two runs. `gemini-3.5-flash-lite` completed 5/5
with identical accuracy (26/26 checks).

Pulling a fixed schema out of one sentence is exactly what Flash-Lite is
built for. We were paying Flash's latency and contention for capability
this task does not use.

**Flag if you disagree** — it is a one-line change in `.env`.

---

## 4. Gemini 3.x reasons by default; it costs seconds

Gemini 3 models think before answering unless told otherwise, which is
most of the 5-8s latency. Set via `thinkingConfig`, NOT a top-level key:

```ts
config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
```

A top-level `thinkingLevel` is silently discarded by the API — it went
unnoticed through two rounds of latency measurement before `tsc` caught
it. Extraction uses MINIMAL; the narrative uses LOW, since prose reads
better with a little planning.

**Measured latency, cold, from Johannesburg:** min 5.7s, avg 7.2s,
max 8.6s. Hence `AI_TIMEOUT_MS=12000` and a 20s cap on the whole chain.

Turning thinking down did not move this much, so ~7s is simply what a
cold call looks like from here. Not worth chasing further.

**Demo implication:** rehearsed sentences are cache hits and return
instantly. The cold path only runs the first time a sentence is seen.
The cache is in-memory and dies with the server, so **warm it by running
the demo once after the final restart, before going on stage.**

---

## 5. 503 and 429 both surface as RATE_LIMITED

Section 2.2 freezes four error codes and neither "server busy" nor
"quota exhausted" has its own. Both map to `RATE_LIMITED` rather than
inventing a fifth code.

They are handled differently even so: a 503 retries once on the same
model after 1.2s, a 429 does not — the retry would fail and spend
another request from an allowance already gone.

**A and D:** an `agent:event` saying `RATE_LIMITED` may mean Google is
busy rather than that we are over quota. The message text distinguishes
them.

---

## 6. Open question: where does this package live?

Currently `packages/ai/`, structured like `packages/engine/`, because
`apps/server` does not exist yet and the code needed somewhere it could
be tested and run.

The plan puts the agents in `apps/server/` [A, C]. When A scaffolds the
server, either is fine:

- (a) leave it here and have the server depend on `ai` as a workspace
  package — cleaner separation, keeps the tests runnable on their own, or
- (b) move `src/` to `apps/server/src/ai/` — matches the plan exactly.

**A's call.** The move is a copy-paste either way; nothing outside
`index.ts` is imported from elsewhere.

---

## 7. Open question: packages/shared does not exist

`src/types.ts` holds the Section 2.2 contract as Zod schemas with types
inferred, because there was nowhere else to put it.

When A commits `packages/shared`, this file should be deleted and its
imports re-pointed. Nothing else in the package changes. The schemas are
written to be lifted as-is.

**Watch for drift until then.** Two copies of a contract is exactly what
the plan says must never happen, and right now this is one of them.

---

## 8. Structural fix applied to the repo root

`packages/engine/` contained its own `pnpm-workspace.yaml` and
`pnpm-lock.yaml`, which made it a separate workspace root — the monorepo
could not see it, and the README's `pnpm install && pnpm test` at root
had nothing to run because there was no root `package.json` either.

**What I did:** added a root `package.json` and `pnpm-workspace.yaml`
declaring `apps/*` and `packages/*`, carried the `allowBuilds` setting
up from the engine's file, and removed the nested workspace file and
lockfile.

Engine source and tests are untouched. `pnpm install && pnpm test` at
the root now works as the README claims. Revert if B intended the
nested setup, but nothing would resolve across packages that way.

Also added a root `.gitignore` (`.env` was not ignored — worth everyone
checking they have not committed a key) and `.env.example`.
