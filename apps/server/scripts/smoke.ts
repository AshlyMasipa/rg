/**
 * H20 gate check against a RUNNING server (local or deployed):
 *
 *   pnpm smoke                                  # http://localhost:3000
 *   pnpm smoke https://rugbygrid.up.railway.app # the deployed URL
 *
 * Runs the whole demo loop over real HTTP + a real socket, then resets to fresh.
 * WARNING: it resets the demo state — don't run it mid-pitch.
 */
import { io } from "socket.io-client";
import type { ServerToClientEvents } from "shared";

const base = (process.argv[2] ?? process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;
const ok = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg: string) => { failures++; console.log(`  \x1b[31m✗\x1b[0m ${msg}`); };
const check = (cond: unknown, msg: string) => (cond ? ok(msg) : bad(msg));

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}

console.log(`\nRugbyGrid smoke test → ${base}\n`);
const t0 = Date.now();

const socket = io(base, { transports: ["websocket", "polling"] });
const seen: Record<string, number> = {};
for (const e of ["agent:event", "need:updated", "bundles:proposed", "report:token", "report:done", "demo:reset"] as (keyof ServerToClientEvents)[]) {
  socket.on(e, () => (seen[e] = (seen[e] ?? 0) + 1));
}
await new Promise<void>((resolve, reject) => {
  socket.on("connect", () => resolve());
  setTimeout(() => reject(new Error("socket did not connect in 5s")), 5000);
});
ok("socket connected");

try {
  const health = await api("GET", "/api/health");
  check(health.ok, `health ok (AI_MODE=${health.ai_mode})`);

  await api("POST", "/api/demo/reset", { state: "fresh" });
  const state = await api("GET", "/api/state");
  check(state.schools.length === 3, "fresh seed loaded (3 schools)");

  const text = "We've got 28 under-16 girls who can train on Tuesdays after school. We need a field, a coach and six balls.";
  const ex = await api("POST", "/api/needs/extract", { text, school_id: "school-thabo" });
  check(ex.success && ex.extracted.participants === 28, `extracted need (source: ${ex.source})`);

  const need = await api("POST", "/api/needs", { ...ex.extracted, school_id: "school-thabo", raw_input: text, extraction_confidence: ex.confidence });
  check(need.status === "Unmet", `need created ${need.id}`);

  const solveStart = Date.now();
  const solved = await api("POST", `/api/needs/${need.id}/solve?pace=5`);
  check(solved.feasible && solved.bundles.length > 0, `solved in ${Date.now() - solveStart} ms → ${solved.bundles[0]?.field_id} + ${solved.bundles[0]?.coach_id}`);
  await new Promise((r) => setTimeout(r, 1500)); // let the paced trace finish

  const approved = await api("POST", `/api/bundles/${solved.bundles[0].id}/approve`, {});
  check(approved.need.status === "Approved", `approved (R${approved.total_cost} committed)`);

  const ev = await api("POST", `/api/assignments/${approved.assignment.id}/evidence`, {
    session_date: new Date().toISOString().slice(0, 10), attendance_count: 26,
  });
  check(ev.need.status === "Active", "evidence logged → Active");

  const impact = await api("GET", "/api/impact");
  check(impact.participant_sessions === 26, `impact updated (${impact.participant_sessions} participant-sessions)`);

  const simStart = Date.now();
  const sim = await api("POST", "/api/simulate", { overrides: { remove_coach_ids: ["coach-naidoo"] } });
  const simMs = Date.now() - simStart;
  check(simMs < 2000, `simulate round-trip ${simMs} ms (< 2000 ms target; engine ${sim.computed_ms} ms)`);

  await api("POST", "/api/demo/reset", { state: "eight-weeks-later" });
  const later = await api("GET", "/api/impact");
  check(later.programmes_delivered === 1, `eight-weeks-later: ${later.participant_sessions} participant-sessions`);

  const { report_id } = await api("POST", "/api/reports/generate", {});
  const report = await new Promise<any>((resolve, reject) => {
    socket.on("report:done", (p) => p.report_id === report_id && resolve(p));
    setTimeout(() => reject(new Error("report did not finish in 30s")), 30000);
  });
  check(report.text.length > 50, `sponsor report streamed (${report.text.split(/\s+/).length} words)`);

  check((seen["agent:event"] ?? 0) > 5, `agent:event × ${seen["agent:event"] ?? 0}`);
  check((seen["need:updated"] ?? 0) >= 3, `need:updated × ${seen["need:updated"] ?? 0}`);
  check(seen["bundles:proposed"], "bundles:proposed received");
  check(seen["demo:reset"], "demo:reset received");
} catch (err) {
  bad((err as Error).message);
} finally {
  await api("POST", "/api/demo/reset", { state: "fresh" }).catch(() => {});
  socket.close();
}

console.log(`\n${failures ? `\x1b[31m${failures} FAILED\x1b[0m` : "\x1b[32mALL GOOD\x1b[0m"} in ${Date.now() - t0} ms (state reset to fresh)\n`);
process.exit(failures ? 1 : 0);
