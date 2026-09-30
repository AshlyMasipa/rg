# packages/ai — Person C

Extraction and narrative agents for RugbyGrid. Turns a coach's typed
message into a structured `CommunityNeed`, and turns aggregated impact
metrics into a sponsor report.

**No I/O beyond the Gemini call.** No DB, no sockets, no Fastify. Same
rule as `packages/engine`: a pure module the server calls.

## What A needs to know

One import, three lines:

```ts
import { buildAi } from 'ai/src/index.js';

const ai = buildAi();                       // reads AI_MODE etc from env
const result = await ai.extract(text, currentDate, emit);
```

- `ai.extract(text, currentDate, emit?)` → `ExtractionResponse`, the exact
  Section 2.2 shape. Never throws; a total failure returns
  `{ success: false, error: { code, message } }`.
- `ai.report(metrics, onToken, emit?)` → streams the sponsor report token
  by token. Falls back to a deterministic template that cannot fail.
- `ai.stats()` → cache hit rates, worth surfacing in the demo.

`emit` is an optional callback taking an `AgentEvent`. Wire it to the
Socket.io `agent:event` broadcast. It is injected rather than imported so
this package never depends on the server.

**Health check worth adding to the server:**

```ts
app.get('/api/ai/health', async () => ({
  mode: ai.mode,
  model: process.env.GEMINI_MODEL ?? null,
  keyPresent: Boolean(process.env.GEMINI_API_KEY),
  cache: ai.stats(),
}));
```

Costs no quota and tells you instantly whether production is configured.
Without it, a missing env var silently degrades to the rules extractor
and looks like it is working.

## What D needs to know

`MockProvider` returns two shapes so both UI states are buildable with no
key involved:

| Input | Result |
|---|---|
| message containing a head count | the demo need; `start_time` 0.62 and `end_time` 0.55, both under the 0.7 threshold, so they render amber |
| message with no head count | `participants: 0`, listed in `missing_fields`, confidence 0 |

`CONFIDENCE_THRESHOLD` is exported from `src/types.ts` — import it rather
than hardcoding 0.7, so the server and the UI cannot disagree.

## The fallback chain

```
cache hit → primary model → fallback model → rules extractor → error
```

Each step emits an `agent:event`, so a fallback on stage reads as designed
resilience rather than a crash. The whole chain is capped at 20s
regardless of what Google does; a coach never waits longer than that.

- Failures are never cached. A transient 503 must not poison a sentence.
- 503 (Google busy) retries once on the same model. A 429 (quota spent)
  does not — the retry would fail and cost another request.
- `RulesProvider` needs no network at all and returns deliberately low
  confidences, so everything lands amber for the coach to correct.

## Running it

```bash
pnpm install
pnpm test          # 19 tests, no key, no network, ~1s
pnpm typecheck
```

Last verified: 19/19 passing.

## Verified against the live model

26/26 checks on `gemini-3.5-flash-lite`, including the two that matter
most for the child-safety story:

- **Does not invent a head count.** Given a message with no number, it
  returns `participants: 0`, lists it in `missing_fields`, and sets
  confidence to 0.
- **Does not retain a child's name.** Given a message naming a player,
  the name appears nowhere in the output.

Both are also covered by unit tests against `MockProvider`.

See `NOTES.md` for model IDs, the free-tier quota finding, and open
questions for the team.
