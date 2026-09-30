# apps/web — Person D

React + Vite + Tailwind v4 frontend for RugbyGrid. Every screen reads and writes through Person A's API, and every type comes from `packages/shared`. There's no second copy of the domain model.

```bash
pnpm install              # from the repo root
pnpm dev                  # terminal 1: API + sockets on :3000
pnpm --filter web dev     # terminal 2: http://localhost:5173 (proxies /api and /socket.io to :3000)
pnpm --filter web build   # outputs apps/web/dist; the server serves it on :3000
```

To test on a phone during development, open `http://<laptop-ip>:5173` on the same Wi-Fi. For the demo, use the deployed HTTPS URL or the cloudflared tunnel (see `apps/server/README.md`).

After `pnpm --filter web build`, **restart the server**. It registers the files in `dist/` once at boot, so new asset hashes return index.html until it restarts.

## Screens

| Route | Role | Screen | Brief # |
|---|---|---|---|
| `/capture` | Coach (phone) | Live Capture: typed message → extract → editable fields with confidence bars (amber under 0.7) → confirm. The status card updates live. | 1 |
| `/requests` | Coach | My requests, with live status | — |
| `/map` | Coordinator | Needs & capacity map + request queue + Agent Timeline. Markers react to `agent:event`, then the map zooms to the chosen bundle. | 2 |
| `/needs/:id` | Coordinator | Match alternatives (2 bundles, score breakdown, "Why this match?"), approval (owner + start date), binding constraint → sponsor-ready request, audit trail | 3 + 4 |
| `/delivery` | Coach / Coordinator | Delivery evidence: log attendance per session (counts only), progress, attendance chart | 5 |
| `/impact` | Sponsor / leadership | KPIs from `/api/impact`, pipeline, sponsor spend, unmet requests, streamed Narrative Agent report | 6 |
| `/simulator` | Coordinator | What-if: remove coaches, budget cap, max travel → knapsack portfolio, `computed_ms` | stretch |

**Role switcher** (top right): Coach / Coordinator / Sponsor. The choice is saved per device, so the phone stays on Coach and the laptop on Coordinator. You can also force it with `?role=coach`.
**Gear menu:** AI mode (mock/live), Reset to *Fresh* or *Eight weeks later*, and whether the Gemini key is present.

## How live updates work

- `src/lib/store.tsx` keeps world state. REST is the source of truth. Socket events patch the state immediately (so the phone flips instantly), then trigger a debounced `GET /api/state` + `/api/impact`. Every reconnect refetches.
- `agent:event`s are kept in a rolling buffer. The map and timeline filter it by `run_id`.
- Report tokens are buffered by `report_id`, because cache hits can stream before the POST resolves.

## Layout

```
src/
  lib/          api.ts (typed REST), socket.ts, store.tsx, role.tsx, useSolve.ts, useReport.ts, utils.ts
  components/   AppShell (nav, role switcher, demo menu), SolveMap, AgentTimeline, BundleCard, status, ui/ (shadcn-style)
  screens/      LiveCapture, MyRequests, NeedsMap, MatchApprove, Delivery, Impact, Simulator
```

## Notes / known limits

- Map tiles come from CARTO/OpenStreetMap and need internet. Offline, the markers, routes and animation still work on a plain background.
- The phone downloads only the capture flow up front. The map (Leaflet) and charts (Recharts) are lazy-loaded.
- Voice input: the mic slot on Capture is reserved and disabled (plan Section 6).
- The Ridgeview binding constraint currently reads "Central Grounds not available…". That wording comes from the engine (see `packages/NOTES.md`, B's call). The UI shows whatever the engine returns.

Verified: typecheck clean, build OK, and a full Playwright run of submit → solve → approve → phone flips live → evidence → impact → simulator → infeasible need → eight-weeks-later report, at 375 px and 1440 px, with no console errors.
