/**
 * The H20 gate as a test: submit → solve → approve → evidence → impact,
 * plus the failure paths judges might poke at.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ApproveResponse, CommunityNeed, ImpactSummary, SimulateResponse, SolveResponse, WorldState } from "shared";
import { buildApp } from "../src/app";
import { buildAi } from "ai";
import { setAi } from "../src/ai";
import { closeRealtime } from "../src/realtime";

let app: FastifyInstance;

const DEMO_TEXT =
  "We've got 28 under-16 girls who can train on Tuesdays after school. We need a field, a coach and six balls.";

const DEMO_NEED = {
  school_id: "school-thabo",
  age_group: "U16",
  gender: "girls",
  participants: 28,
  days: ["tue"],
  start_time: "15:00",
  end_time: "17:00",
  needs: { field: true, coach: true, balls: 6, transport: false },
  weeks: 8,
};

async function call<T>(method: "GET" | "POST", url: string, payload?: unknown) {
  const res = await app.inject({ method, url, payload: payload as object });
  return { status: res.statusCode, body: res.json() as T };
}

beforeAll(async () => {
  setAi(null); // AI_MODE=mock from test/setup.ts → C's MockProvider
  app = await buildApp({ logger: false });
  await app.ready();
});
afterAll(async () => {
  await closeRealtime();
  await app.close();
});
beforeEach(async () => {
  await call("POST", "/api/demo/reset", { state: "fresh" });
});

describe("state + seed", () => {
  it("fresh state has 3 schools and the 2 pre-seeded needs", async () => {
    const { status, body } = await call<WorldState>("GET", "/api/state");
    expect(status).toBe(200);
    expect(body.schools).toHaveLength(3);
    expect(body.needs.map((n) => n.id).sort()).toEqual(["need-2", "need-3"]);
    expect(body.coaches.find((c) => c.id === "coach-dlamini")?.credentials).not.toContain("safeguarding");
  });

  it("eight-weeks-later has a delivered programme with ~210 participant-sessions", async () => {
    await call("POST", "/api/demo/reset", { state: "eight-weeks-later" });
    const { body } = await call<ImpactSummary>("GET", "/api/impact");
    expect(body.programmes_delivered).toBe(1);
    expect(body.participant_sessions).toBeGreaterThan(190);
    expect(body.participant_sessions).toBeLessThan(230);
    expect(body.female_participation_pct).toBe(100);
    expect(body.unmet_requests.length).toBeGreaterThan(0);
  });
});

describe("the full loop", () => {
  it("extract → create → solve → approve → 8× evidence → Delivered", async () => {
    // 1. extract
    const ex = await call<{ success: boolean; extracted: typeof DEMO_NEED; confidence: Record<string, number> }>(
      "POST", "/api/needs/extract", { text: DEMO_TEXT, school_id: "school-thabo" },
    );
    expect(ex.status).toBe(200);
    expect(ex.body.success).toBe(true);
    expect(ex.body.extracted).toMatchObject({ age_group: "U16", gender: "girls", participants: 28, days: ["tue"] });
    expect(ex.body.extracted.needs.balls).toBe(6);
    expect(ex.body.confidence.start_time).toBeLessThan(0.7); // "after school" gets flagged

    // 2. coach confirms
    const created = await call<CommunityNeed>("POST", "/api/needs", {
      ...ex.body.extracted, school_id: "school-thabo", raw_input: DEMO_TEXT,
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("Unmet");

    // 3. solve
    const solved = await call<SolveResponse>("POST", `/api/needs/${created.body.id}/solve?pace=0`);
    expect(solved.status).toBe(200);
    expect(solved.body.feasible).toBe(true);
    const best = solved.body.bundles[0];
    expect(best).toMatchObject({ rank: 1, field_id: "field-orlando", coach_id: "coach-naidoo" });
    expect(best.id).toMatch(/^bundle-/);
    // Dlamini is excluded for safeguarding, and the trace says so
    expect(
      solved.body.trace.some((t) => t.subject === "coach-dlamini" && t.check === "safeguarding" && t.status === "fail"),
    ).toBe(true);

    // 4. approve
    const approved = await call<ApproveResponse>("POST", `/api/bundles/${best.id}/approve`, { start_date: "2026-10-06" });
    expect(approved.status).toBe(200);
    expect(approved.body.need.status).toBe("Approved");
    expect(approved.body.sponsor.remaining).toBe(20000 - approved.body.total_cost);

    // approving twice is a conflict, not a crash
    expect((await call("POST", `/api/bundles/${best.id}/approve`, {})).status).toBe(409);

    // 5. evidence ×8
    const aid = approved.body.assignment.id;
    const first = await call<{ need: CommunityNeed }>("POST", `/api/assignments/${aid}/evidence`, {
      session_date: "2026-10-06", attendance_count: 25,
    });
    expect(first.status).toBe(201);
    expect(first.body.need.status).toBe("Active");
    let last = first;
    for (let w = 1; w < 8; w++) {
      const d = new Date("2026-10-06");
      d.setDate(d.getDate() + w * 7);
      last = await call("POST", `/api/assignments/${aid}/evidence`, {
        session_date: d.toISOString().slice(0, 10), attendance_count: 26,
      });
    }
    expect(last.body.need.status).toBe("Delivered");

    // 6. impact
    const impact = await call<ImpactSummary>("GET", "/api/impact");
    expect(impact.body.participant_sessions).toBe(25 + 7 * 26);
    expect(impact.body.programmes_delivered).toBe(1);
    expect(impact.body.sponsor_spend["sponsor-women-rugby"].committed).toBe(approved.body.total_cost);
  });

  it("the unmatchable Ridgeview need stays Unmet with a sponsor-ready request", async () => {
    const solved = await call<SolveResponse>("POST", "/api/needs/need-3/solve?pace=0");
    expect(solved.body.feasible).toBe(false);
    expect(solved.body.binding_constraint?.sponsor_request).toBeTruthy();
    const need = await call<CommunityNeed>("GET", "/api/needs/need-3");
    expect(need.body.status).toBe("Unmet");
    expect(need.body.last_binding_constraint).toEqual(solved.body.binding_constraint);
    const impact = await call<ImpactSummary>("GET", "/api/impact");
    expect(impact.body.unmet_requests.map((u) => u.need_id)).toContain("need-3");
  });

  it("prevents double-booking: a second Tuesday group can't take Coach Naidoo", async () => {
    const a = await call<CommunityNeed>("POST", "/api/needs", DEMO_NEED);
    const b = await call<CommunityNeed>("POST", "/api/needs", { ...DEMO_NEED, school_id: "school-lerato", participants: 20 });
    const sa = await call<SolveResponse>("POST", `/api/needs/${a.body.id}/solve?pace=0`);
    const sb = await call<SolveResponse>("POST", `/api/needs/${b.body.id}/solve?pace=0`);
    // both proposals were made before either was approved…
    await call("POST", `/api/bundles/${sa.body.bundles[0].id}/approve`, {});
    // …so approving B's stale Naidoo bundle must be refused
    const stale = sb.body.bundles.find((x) => x.coach_id === "coach-naidoo")!;
    const res = await call<{ error: { code: string } }>("POST", `/api/bundles/${stale.id}/approve`, {});
    expect(res.status).toBe(409);
    // and a re-solve now sees the booking
    const again = await call<SolveResponse>("POST", `/api/needs/${b.body.id}/solve?pace=0`);
    expect(again.body.bundles.every((x) => x.coach_id !== "coach-naidoo")).toBe(true);
  });
});

describe("simulator", () => {
  it("removing Coach Naidoo makes the Tuesday demo need infeasible, and never writes to the DB", async () => {
    const need = await call<CommunityNeed>("POST", "/api/needs", DEMO_NEED);
    const before = await call<WorldState>("GET", "/api/state");

    const base = await call<SimulateResponse>("POST", "/api/simulate", { need_ids: [need.body.id] });
    expect(base.body.per_need[0].feasible).toBe(true);
    expect(base.body.computed_ms).toBeLessThan(2000);

    const cut = await call<SimulateResponse>("POST", "/api/simulate", {
      need_ids: [need.body.id], overrides: { remove_coach_ids: ["coach-naidoo"] },
    });
    expect(cut.body.per_need[0].feasible).toBe(false);

    const after = await call<WorldState>("GET", "/api/state");
    expect(after.body).toEqual(before.body);
  });

  it("defaults to every Unmet/Matched need and respects the budget", async () => {
    const res = await call<SimulateResponse>("POST", "/api/simulate", { overrides: { budget: 1000 } });
    expect(res.body.need_ids.sort()).toEqual(["need-2", "need-3"]);
    expect(res.body.optimal_portfolio.total_cost).toBeLessThanOrEqual(1000);
  });
});

describe("validation + errors", () => {
  it("rejects bad bodies with VALIDATION_FAILED", async () => {
    const res = await call<{ error: { code: string } }>("POST", "/api/needs", { ...DEMO_NEED, start_time: "25:00" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("404s unknown ids with NOT_FOUND", async () => {
    const res = await call<{ error: { code: string } }>("POST", "/api/needs/nope/solve");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("live mode with no API key runs C's rules extractor through the API", async () => {
    setAi(buildAi({ mode: "live", apiKey: undefined, model: "", fallbackModel: "", timeoutMs: 1000 }));
    const res = await call<{ success: boolean; source: string; extracted: { participants: number; days: string[] } }>(
      "POST", "/api/needs/extract", { text: "28 u16 girls, tues aftr skool, need field + coach + 6 balls pls", school_id: "school-thabo" },
    );
    expect(res.body.success).toBe(true);
    expect(res.body.source).toBe("rules");
    expect(res.body.extracted.participants).toBe(28);
    expect(res.body.extracted.days).toEqual(["tue"]);
    setAi(null);
  });

  it("never hangs or 500s if the AI layer itself throws", async () => {
    const mock = buildAi({ mode: "mock", model: "", fallbackModel: "", timeoutMs: 1000 });
    setAi({ ...mock, extract: async () => { throw new Error("boom"); } });
    const res = await call<{ success: boolean; error: { code: string } }>("POST", "/api/needs/extract", {
      text: DEMO_TEXT, school_id: "school-thabo",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("TIMEOUT");
    setAi(null);
  });

  it("reports stream to completion and are retrievable", async () => {
    await call("POST", "/api/demo/reset", { state: "eight-weeks-later" });
    const started = await call<{ report_id: string }>("POST", "/api/reports/generate", {});
    expect(started.status).toBe(202);
    await new Promise((r) => setTimeout(r, 1500)); // C's replay streams 30 chars / 40 ms
    const report = await call<{ status: string; text: string }>("GET", `/api/reports/${started.body.report_id}`);
    expect(report.body.status).toBe("done");
    expect(report.body.text).toMatch(/participant-sessions/);
  });
});
