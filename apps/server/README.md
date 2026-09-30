# apps/server — Person A

Fastify API + Socket.io + SQLite (Drizzle). Wraps Person B's engine (`packages/engine`) and Person C's AI agents (`packages/ai`), and serves Person D's built frontend from the same origin.

```bash
pnpm install          # from the repo root
pnpm dev              # http://localhost:3000, auto-reloads, seeds fresh.json on first boot
pnpm test             # engine (B) + server integration tests
pnpm smoke            # H20 gate against a running server (resets demo state!)
pnpm smoke https://your-app.up.railway.app
pnpm seed:build       # regenerate seed/eight-weeks-later.json through the real code path
```

Config lives in `apps/server/.env` (copy `.env.example` from the repo root). Defaults work with no `.env` at all.

## Layout

```
src/
  index.ts            boot: listen, seed if empty, graceful shutdown
  app.ts              Fastify + CORS + routes + static web/dist + Socket.io
  config.ts           every env var in one place
  engine.ts           ONLY file that imports B's engine (+ compile-time contract checks)
  ai.ts               ONLY file that imports C's ai package (+ contract checks, runtime mode switch)
  realtime.ts         Socket.io room + typed emit()
  routes/api.ts       every REST endpoint
  services/
    needs.ts          extract → create → solve → approve → evidence (the core loop)
    simulate.ts       what-if re-solve (never writes)
    reports.ts        Narrative Agent streaming
    demo.ts           reset
  lib/
    status.ts         the ONLY place a need's status changes (+ audit row)
    world.ts          loads world state; flattens bookings for double-booking
    impact.ts         participant-sessions and sponsor spend
    pace.ts           paced agent:event emission
  db/                 schema (Drizzle + DDL), client, seed load/dump
seed/                 fresh.json, eight-weeks-later.json (generated)
scripts/              build-seed.ts, smoke.ts
test/                 api.test.ts (full loop), realtime.test.ts (two sockets)
```

## Rules the code enforces

- **Status only changes in `lib/status.ts`.** `Draft → Unmet → Matched → Approved → Active → Delivered`. A re-solve can move `Matched → Unmet`. Every change writes an `audit_events` row; illegal moves return `409 CONFLICT`.
- **The engine is never given DB access.** The server loads the world, calls `solve()`, then persists the result.
- **Double-booking** is checked twice: by the engine at solve time (bookings passed in, flattened), and again at approval, in case another programme was approved in between (`409`, "re-solve the need").
- **Approval commits sponsor spend.** `sponsor_budgets.remaining` drops by `weekly_cost × weeks`, so later solves see the real remaining budget.
- **Evidence drives status.** The first session moves `Approved → Active`. When `weeks × days.length` sessions are logged, the need moves to `Delivered`.
- **Participant-session** = `SUM(delivery_evidence.attendance_count)`. There is no other definition.
- **Only aggregated metrics reach the AI.** The Narrative Agent gets the `/api/impact` object, never rows.

## REST API

Every non-2xx response is `{ "error": { "code", "message", "issues?" } }`. The codes are `VALIDATION_FAILED` (400), `NOT_FOUND` (404), `CONFLICT` (409) and `INTERNAL` (500). All request and response types are exported from `shared`.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ ok, ai_mode, clients, time }` |
| GET | `/api/state` | | `WorldState`: everything for the map + dashboard |
| GET | `/api/impact` | | `ImpactSummary` |
| GET | `/api/needs/:id` | | `CommunityNeed` |
| GET | `/api/audit?limit=100` | | latest `AuditEvent[]` |
| POST | `/api/needs/extract` | `{ text, school_id, input_mode?, current_date? }` | `ExtractionResult & { run_id }`. **Always 200**; check `success`. |
| POST | `/api/needs` | extracted fields + `school_id` (+ `weeks`, `raw_input`, `extraction_confidence`) | `201` `CommunityNeed` (status `Unmet`) |
| POST | `/api/needs/:id/solve?pace=80` | | `SolveResponse` **immediately**, with persisted bundles (real ids) + full trace. Agent events stream afterwards. `?pace=0` = no pacing. |
| POST | `/api/bundles/:id/approve` | `{ owner_role?, start_date? }` | `ApproveResponse` `{ assignment, need, sponsor, total_cost }` |
| POST | `/api/assignments/:id/evidence` | `{ session_date, attendance_count }` | `201` `{ evidence, need, sessions_logged, sessions_planned }` |
| POST | `/api/simulate` | `{ need_ids?, overrides: { remove_coach_ids?, budget?, max_travel_km? } }` | `SimulateResponse` (B's result + `need_ids`). Defaults to all Unmet/Matched needs. Never writes. |
| POST | `/api/reports/generate` | `{ sponsor_id? }` | `202` `{ report_id }`; text streams via `report:token` |
| GET | `/api/reports/:id` | | `ReportRecord` (use after a reconnect) |
| POST | `/api/demo/reset` | `{ state: "fresh" \| "eight-weeks-later" }` | `{ ok, state }` |
| GET | `/api/ai/health` | | `{ mode, model, fallback_model, key_present, cache }`: check this on the deployed URL before presenting |
| GET/POST | `/api/settings/ai-mode` | `{ mode: "live" \| "mock" }` | `{ mode }` (the role-switcher toggle) |

## Socket events (server → client only)

Connect with `io()` (same origin), or `io("http://localhost:3000")` in dev. Everyone joins room `province:gauteng`. Types: `ServerToClientEvents` in `shared`.

| Event | When |
|---|---|
| `agent:event` | Every agent step. `ref_id` = map marker id (`field-orlando`, `coach-dlamini`, …); `check` = constraint name; `run_id` groups one run. Status `start → pass/fail… → done`. |
| `need:updated` | Any status change. For a solve, it's sent **after** the paced trace finishes. |
| `bundles:proposed` | Solve finished streaming (same bundles as the HTTP response). |
| `report:token` / `report:done` | Narrative Agent streaming; `done` carries the full text. |
| `demo:reset` | After a reset. **Refetch `/api/state`.** Any in-flight paced trace stops immediately. |

**On (re)connect, refetch `GET /api/state`.** Never rely on socket state alone.

## For Person D (frontend)

In `apps/web/vite.config.ts`, proxy the API and the socket so the dev server has one origin, the same as production:

```ts
server: {
  proxy: {
    "/api": "http://localhost:3000",
    "/socket.io": { target: "http://localhost:3000", ws: true },
  },
},
```

Name the package `"web"` with a `build` script that outputs `apps/web/dist`. The Dockerfile builds it, and the server serves it with SPA fallback. Import types with `import type { WorldState, AgentEvent } from "shared"` (add `"shared": "workspace:*"` to your dependencies).

## For Person C (AI)

The server uses `packages/ai` as a workspace package (option (a) from your `NOTES.md` #6). `src/ai.ts` calls `buildAi()` with the env config, forwards your `emit` events to Socket.io (adding `run_id`), and maps `ImpactSummary` to your narrative shape (`cost_per_participant_session: null → 0`).

- `pnpm typecheck` fails if your `ExtractedNeed` / `ExtractionResponse` drift from `packages/shared` (NOTES #7).
- `POST /api/settings/ai-mode {"mode":"live"}` rebuilds the chain at runtime. Your caches are module-level, so they survive the switch.
- A 25 s safety net sits on top of your 20 s chain deadline. If `extract` ever throws, the route returns `success:false, TIMEOUT` instead of a 500.
- **Warm the cache before going on stage:** run the scripted sentences once after the final restart (your NOTES #4).

## Deploy

**Railway** (recommended): New Project → Deploy from GitHub repo → it picks up the root `Dockerfile`. Set `AI_MODE` and `GEMINI_API_KEY` in Variables, then Settings → Networking → Generate Domain. HTTPS and WebSockets work out of the box.

**Render:** New → Blueprint → select the repo (`render.yaml`). The free plan sleeps after inactivity, so open the URL a minute before you present.

The SQLite file is on the container's disk and resets on redeploy. That's fine: `SEED_ON_BOOT` reloads `fresh.json`, and the demo starts from a reset anyway.

**Backup if the venue Wi-Fi or the host dies:** run locally and tunnel it.

```bash
pnpm start
cloudflared tunnel --url http://localhost:3000   # prints an https://….trycloudflare.com URL for the phone
```
