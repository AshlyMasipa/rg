# RugbyGrid

A platform matching grassroots rugby capacity — fields, coaches, equipment, transport, sponsor funding — to demand from under-resourced schools. Built for the Adapt IT x Wits Social Good Hackathon.

Coach types a need → an Extraction Agent structures it → a deterministic matching engine proposes ranked, explainable bundles (field + coach + kit + transport + sponsor) → a coordinator approves → delivery evidence rolls up into sponsor-facing impact reports.

**The one rule that matters:** the allocation itself is never AI-decided. The engine's matches are deterministic and explainable; AI is only used for extracting structured data from typed messages and writing the narrative report at the end.

## Team

| Role | Person | Owns |
|---|---|---|
| Backend + Realtime | A | API, DB, Socket.io, deploy |
| Engine | B | Matcher, scoring, simulator, budget optimiser, tests |
| AI Agents + Demo | C | Extraction, narrative, fallbacks, rate-limit handling, demo script |
| Frontend + Pitch | D | All 6 screens, map, animations, pitch deck |

## Stack

TypeScript end-to-end. pnpm monorepo · React + Vite + Tailwind + shadcn/ui + Framer Motion · react-leaflet · Recharts · Node + Fastify · Socket.io · SQLite + Drizzle · Zod · Vitest · Gemini API free tier (Gemini 3 Flash / 3.1 Flash-Lite fallback) · Railway/Render.

## Structure

rugbygrid/
apps/web/ React app [D]
apps/server/ Fastify, Socket.io, agents, DB [A, C]
packages/shared/ Zod schemas + types + events [A owns, all read]
packages/engine/ matcher, scorer, knapsack, tests [B]
packages/ai/ extraction + narrative agents, Gemini fallback chain [C]
apps/server/seed/ fresh.json, eight-weeks-later.json [A]


All shared shapes live in `packages/shared` as Zod schemas — there is no second copy of the domain model anywhere. Read `RugbyGrid_Implementation_Plan.md` in full before writing code against any interface; it defines every contract precisely so nobody has to guess.

## Status

- **`packages/engine`** (B): done. `solve()`, `optimisePortfolio()`, `simulate()` implemented and tested (20/20 passing). The three open contract questions in `packages/NOTES.md` are now resolved (see that file).
- **`packages/shared`** (A): done. Zod schemas, entity/response types and socket events. `apps/server/src/engine.ts` fails the typecheck if these ever drift from the engine's types.
- **`apps/server`** (A): done. Every endpoint in Section 2.6, Socket.io with paced agent events, status machine + audit log, both seed states, a Dockerfile for Railway/Render. 14 integration tests plus `pnpm smoke`. See `apps/server/README.md` for the full API.
- **`packages/ai`** (C): done. Extraction + narrative agents with cache → Gemini → rules fallback, 19 tests. Wired into the server via `apps/server/src/ai.ts`. **Read `packages/ai/NOTES.md` #1 first: the free tier is 20 requests/day, so rehearse in `AI_MODE=mock` and get one billing-enabled key for demo day.**
- **`apps/web`** (D): done. All six screens plus the simulator, role switcher, live map + agent timeline, streamed report. See `apps/web/README.md`. Build it before `pnpm start` so the server serves it on :3000.

## Getting started

Needs Node 22+ and pnpm 12: `npm install -g pnpm@12.8.1` (works without admin on Windows; `corepack enable` needs admin).

```bash
pnpm install
pnpm dev           # API + sockets on http://localhost:3000 (seeds itself on first boot)
pnpm test          # engine + ai + server tests (54)
pnpm smoke         # full demo loop against the running server
```

Per-package instructions live in each package's own README where one exists (e.g. `packages/engine/README.md`).

## Demo data

Seed and scripted demo inputs are defined in Section 5 of the implementation plan — rehearse them, don't improvise live input on stage. The seeded unmatchable need (Ridgeview, Thursday) is intentional: it's the "sponsor-ready request" moment in the pitch.