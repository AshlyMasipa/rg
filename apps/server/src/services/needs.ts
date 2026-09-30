/**
 * Business logic for the core loop: extract → create → solve → approve → evidence.
 * Routes are thin wrappers around these; scripts/build-seed.ts reuses them so the
 * eight-weeks-later seed is produced by exactly the same code path as the demo.
 */
import { count, eq } from "drizzle-orm";
import type {
  AgentEvent, ApproveBody, ApproveResponse, CommunityNeed, CreateNeedBody, EvidenceBody,
  ExtractRequest, ExtractionResult, OpportunityBundle, SolveResponse,
} from "shared";
import { getAi } from "../ai";
import { db, schema } from "../db/client";
import { runSolve } from "../engine";
import { emit } from "../realtime";
import { audit } from "../lib/audit";
import { conflict, notFound } from "../lib/errors";
import { newId, nowIso, todayIso } from "../lib/ids";
import { emitPaced } from "../lib/pace";
import { slotsOverlap } from "../lib/slots";
import { setStatus } from "../lib/status";
import { getAssignment, getBundle, getNeed, getSchool, loadBookings, loadWorld } from "../lib/world";

// ---------------------------------------------------------------------------
// 1. Extraction (Person C's package — owns the cache → Gemini → rules chain)
// ---------------------------------------------------------------------------
/** C caps its whole chain at 20 s; this is only a last-resort net so the route can never hang. */
const EXTRACT_SAFETY_NET_MS = 25_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function extractNeed(body: ExtractRequest): Promise<ExtractionResult & { run_id: string }> {
  const school = getSchool(body.school_id);
  const run_id = newId("run");
  const ai = getAi();
  // C's events carry agent/step/status/message; we add run_id and default the map marker to the school.
  const forward = (e: Omit<AgentEvent, "run_id">) =>
    emit("agent:event", { ...e, ref_id: e.ref_id ?? school.id, run_id });

  forward({ agent: "extraction", step: 0, status: "start", message: `Message received from ${school.name}` });
  try {
    const result = await withTimeout(
      ai.extract(body.text, body.current_date ?? todayIso(), forward),
      EXTRACT_SAFETY_NET_MS,
    );
    return { ...result, run_id };
  } catch (err) {
    forward({ agent: "extraction", step: 99, status: "fail", message: `Extraction failed: ${(err as Error).message}` });
    return {
      success: false,
      extracted: null,
      error: { code: "TIMEOUT", message: "Extraction took too long — please fill in the form manually" },
      run_id,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Create (coach confirms the extracted fields)
// ---------------------------------------------------------------------------
export function createNeed(body: CreateNeedBody, actor: "coach" | "coordinator" | "system" = "coach"): CommunityNeed {
  getSchool(body.school_id);
  const id = newId("need");
  db.transaction((tx) => {
    tx.insert(schema.community_needs)
      .values({
        id,
        school_id: body.school_id,
        age_group: body.age_group,
        gender: body.gender,
        participants: body.participants,
        days: body.days,
        start_time: body.start_time,
        end_time: body.end_time,
        needs: body.needs,
        weeks: body.weeks,
        status: "Draft",
        extraction_confidence: body.extraction_confidence ?? null,
        raw_input: body.raw_input ?? null,
        last_binding_constraint: null,
        created_at: nowIso(),
      })
      .run();
    audit(actor, "need.created", id, { school_id: body.school_id }, tx);
    setStatus(id, "Unmet", actor, { tx });
  });
  const need = getNeed(id);
  emit("need:updated", need);
  return need;
}

// ---------------------------------------------------------------------------
// 3. Solve (Person B's engine) — persist, then stream the trace
// ---------------------------------------------------------------------------
export function solveNeed(
  needId: string,
  opts: { paceMs?: number } = {},
): { response: SolveResponse; streaming: Promise<void> } {
  const need = getNeed(needId);
  if (need.status !== "Unmet" && need.status !== "Matched") {
    throw conflict(`Need ${needId} is ${need.status}; only Unmet or Matched needs can be solved`);
  }
  const world = loadWorld();
  const t0 = performance.now();
  const result = runSolve(need, world);
  const computedMs = Math.round((performance.now() - t0) * 100) / 100;
  const run_id = newId("run");
  const created_at = nowIso();

  const bundles: OpportunityBundle[] = result.bundles.map((b) => ({
    ...b,
    id: newId("bundle"),
    need_id: needId,
    created_at,
  }));

  const updated = db.transaction((tx) => {
    // Old proposals are replaced. Safe: Unmet/Matched needs never have assignments.
    tx.delete(schema.opportunity_bundles).where(eq(schema.opportunity_bundles.need_id, needId)).run();
    for (const b of bundles) tx.insert(schema.opportunity_bundles).values(b).run();
    audit("coordinator", "need.solved", needId, {
      run_id, feasible: result.feasible, bundles: bundles.length, checks: result.trace.length, computed_ms: computedMs,
    }, tx);
    return setStatus(needId, result.feasible ? "Matched" : "Unmet", "system", {
      tx,
      binding: result.feasible ? null : result.binding_constraint,
      detail: { run_id },
    });
  });

  const fields = world.fields.length;
  const coaches = world.coaches.length;
  const best = bundles[0];
  const nameOf = (id: string) =>
    world.fields.find((f) => f.id === id)?.name ?? world.coaches.find((c) => c.id === id)?.name ?? id;

  const events: AgentEvent[] = [
    {
      agent: "constraint", step: 0, status: "start", run_id, need_id: needId, ref_id: need.school_id,
      message: `Checking ${fields} fields × ${coaches} coaches for ${need.participants} ${need.age_group} ${need.gender}, ${need.days.join("+")} ${need.start_time}–${need.end_time}`,
    },
    ...result.trace.map<AgentEvent>((t) => ({
      agent: "constraint", step: t.step, status: t.status, message: t.message,
      ref_id: t.subject, check: t.check, run_id, need_id: needId,
    })),
    {
      agent: "constraint", step: result.trace.length + 1, status: "done", run_id, need_id: needId,
      ref_id: best?.field_id ?? need.school_id,
      message: best
        ? `${bundles.length} feasible bundle${bundles.length === 1 ? "" : "s"} in ${computedMs} ms — best: ${nameOf(best.field_id)} + Coach ${nameOf(best.coach_id)} (score ${best.score})`
        : `No feasible bundle: ${result.binding_constraint?.message ?? "no resources match"}`,
    },
  ];

  const streaming = (async () => {
    const completed = await emitPaced(events, opts.paceMs);
    if (!completed) return; // a demo reset happened mid-stream
    emit("need:updated", updated);
    emit("bundles:proposed", { need_id: needId, run_id, bundles, binding_constraint: result.binding_constraint });
  })();

  return {
    response: {
      need_id: needId, run_id, feasible: result.feasible, bundles,
      binding_constraint: result.binding_constraint, trace: result.trace,
    },
    streaming,
  };
}

// ---------------------------------------------------------------------------
// 4. Approve (provincial coordinator)
// ---------------------------------------------------------------------------
export function approveBundle(bundleId: string, body: ApproveBody): ApproveResponse {
  const bundle = getBundle(bundleId);
  const need = getNeed(bundle.need_id);
  if (need.status !== "Matched") throw conflict(`Need ${need.id} is ${need.status}; only Matched needs can be approved`);

  const sponsor = db.select().from(schema.sponsor_budgets).where(eq(schema.sponsor_budgets.id, bundle.sponsor_id)).get();
  if (!sponsor) throw notFound("Sponsor", bundle.sponsor_id);
  const total_cost = bundle.weekly_cost * need.weeks;
  if (sponsor.remaining < total_cost) {
    throw conflict(`${sponsor.sponsor} has R${sponsor.remaining} left but this programme needs R${total_cost}. Re-solve the need.`);
  }

  // Someone may have approved an overlapping programme since this bundle was proposed.
  const clash = loadBookings().find(
    (b) => (b.field_id === bundle.field_id || b.coach_id === bundle.coach_id) && slotsOverlap(b, need),
  );
  if (clash) {
    throw conflict(`That field or coach was booked by another programme after this match was proposed. Re-solve the need.`);
  }

  const assignment = {
    id: newId("assignment"),
    bundle_id: bundle.id,
    owner_role: body.owner_role,
    start_date: body.start_date ?? todayIso(),
    weeks: need.weeks,
    created_at: nowIso(),
  };

  const { updatedNeed, updatedSponsor } = db.transaction((tx) => {
    tx.insert(schema.assignments).values(assignment).run();
    tx.update(schema.sponsor_budgets)
      .set({ remaining: sponsor.remaining - total_cost })
      .where(eq(schema.sponsor_budgets.id, sponsor.id))
      .run();
    audit("coordinator", "bundle.approved", bundle.id, {
      assignment_id: assignment.id, need_id: need.id, sponsor_id: sponsor.id, total_cost,
    }, tx);
    const updatedNeed = setStatus(need.id, "Approved", "coordinator", { tx, detail: { bundle_id: bundle.id } });
    const updatedSponsor = tx.select().from(schema.sponsor_budgets).where(eq(schema.sponsor_budgets.id, sponsor.id)).get()!;
    return { updatedNeed, updatedSponsor };
  });

  emit("need:updated", updatedNeed);
  return { assignment, need: updatedNeed, sponsor: updatedSponsor, total_cost };
}

// ---------------------------------------------------------------------------
// 5. Delivery evidence (attendance counts only)
// ---------------------------------------------------------------------------
export function addEvidence(assignmentId: string, body: EvidenceBody) {
  const assignment = getAssignment(assignmentId);
  const bundle = getBundle(assignment.bundle_id);
  const need = getNeed(bundle.need_id);
  if (need.status !== "Approved" && need.status !== "Active") {
    throw conflict(`Need ${need.id} is ${need.status}; evidence can only be logged for Approved or Active programmes`);
  }
  if (body.attendance_count > need.participants * 1.5) {
    throw conflict(`Attendance ${body.attendance_count} is implausibly high for a group of ${need.participants}`);
  }

  const sessions_planned = assignment.weeks * need.days.length;
  const evidence = { id: newId("evidence"), assignment_id: assignmentId, ...body };

  const { updatedNeed, sessions_logged } = db.transaction((tx) => {
    tx.insert(schema.delivery_evidence).values(evidence).run();
    const sessions_logged = tx
      .select({ n: count() })
      .from(schema.delivery_evidence)
      .where(eq(schema.delivery_evidence.assignment_id, assignmentId))
      .get()!.n;
    audit("coach", "evidence.logged", evidence.id, { assignment_id: assignmentId, attendance: body.attendance_count }, tx);
    let n = getNeed(need.id, tx);
    if (n.status === "Approved") n = setStatus(need.id, "Active", "system", { tx });
    if (sessions_logged >= sessions_planned) n = setStatus(need.id, "Delivered", "system", { tx, detail: { sessions_logged } });
    return { updatedNeed: n, sessions_logged };
  });

  emit("need:updated", updatedNeed);
  return { evidence, need: updatedNeed, sessions_logged, sessions_planned };
}
