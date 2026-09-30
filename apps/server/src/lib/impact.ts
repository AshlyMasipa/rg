/**
 * GET /api/impact — the only numbers the dashboard and the Narrative Agent use.
 * Participant-session = one participant attending one delivered session
 * = SUM(delivery_evidence.attendance_count). Nobody invents a second definition.
 */
import type { ImpactSummary } from "shared";
import { loadState } from "./world";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeImpact(): ImpactSummary {
  const s = loadState();
  const needById = new Map(s.needs.map((n) => [n.id, n]));
  const bundleById = new Map(s.bundles.map((b) => [b.id, b]));
  const assignmentById = new Map(s.assignments.map((a) => [a.id, a]));
  const schoolById = new Map(s.schools.map((sc) => [sc.id, sc]));

  const counts: ImpactSummary["needs"] = { draft: 0, unmet: 0, matched: 0, approved: 0, active: 0, delivered: 0 };
  for (const n of s.needs) counts[n.status.toLowerCase() as keyof typeof counts]++;

  // Delivery: attendance and the cost of the sessions actually delivered.
  let participantSessions = 0;
  let femaleSessions = 0;
  let deliveredSpend = 0;
  for (const ev of s.evidence) {
    participantSessions += ev.attendance_count;
    const a = assignmentById.get(ev.assignment_id);
    const b = a && bundleById.get(a.bundle_id);
    const need = b && needById.get(b.need_id);
    if (need?.gender === "girls") femaleSessions += ev.attendance_count;
    if (b && need) deliveredSpend += b.weekly_cost / Math.max(1, need.days.length); // cost of one session
  }

  // Sponsor spend: committed at approval; `remaining` is already net of commitments.
  const spend: ImpactSummary["sponsor_spend"] = {};
  for (const sp of s.sponsors) spend[sp.id] = { sponsor: sp.sponsor, committed: 0, remaining: sp.remaining };
  for (const a of s.assignments) {
    const b = bundleById.get(a.bundle_id);
    if (b && spend[b.sponsor_id]) spend[b.sponsor_id].committed += b.weekly_cost * a.weeks;
  }

  return {
    needs: counts,
    participant_sessions: participantSessions,
    sessions_delivered: s.evidence.length,
    programmes_delivered: counts.delivered,
    programmes_running: counts.approved + counts.active,
    female_participation_pct: participantSessions ? round1((femaleSessions / participantSessions) * 100) : 0,
    sponsor_spend: spend,
    cost_per_participant_session: participantSessions ? round1(deliveredSpend / participantSessions) : null,
    unmet_requests: s.needs
      .filter((n) => n.status === "Unmet" && n.last_binding_constraint)
      .map((n) => ({
        need_id: n.id,
        school: schoolById.get(n.school_id)?.name ?? n.school_id,
        message: n.last_binding_constraint!.message,
        sponsor_request: n.last_binding_constraint!.sponsor_request,
      })),
    synthetic_data: true,
  };
}
