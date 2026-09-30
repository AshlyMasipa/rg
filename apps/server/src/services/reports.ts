/**
 * Sponsor report generation — Person C's Narrative Agent (cache → Gemini →
 * template; never throws). Returns a report id at once and streams tokens over
 * the socket. Reports are kept in memory; the demo reset clears them.
 */
import type { ImpactSummary, ReportRecord } from "shared";
import { getAi, toAiMetrics } from "../ai";
import { emit } from "../realtime";
import { computeImpact } from "../lib/impact";
import { newId, nowIso } from "../lib/ids";
import { notFound } from "../lib/errors";

const reports = new Map<string, ReportRecord>();

export function clearReports() {
  reports.clear();
}

export function getReport(id: string): ReportRecord {
  const r = reports.get(id);
  if (!r) throw notFound("Report", id);
  return r;
}

/** Only aggregated, child-safe metrics ever reach the model. */
function metricsFor(sponsorId?: string): ImpactSummary {
  const m = computeImpact();
  if (sponsorId && m.sponsor_spend[sponsorId]) {
    return { ...m, sponsor_spend: { [sponsorId]: m.sponsor_spend[sponsorId] } };
  }
  return m;
}

export function generateReport(sponsorId?: string): { report: ReportRecord; streaming: Promise<void> } {
  const metrics = toAiMetrics(metricsFor(sponsorId));
  const report: ReportRecord = {
    id: newId("report"),
    sponsor_id: sponsorId ?? null,
    status: "streaming",
    text: "",
    source: "pending",
    created_at: nowIso(),
  };
  reports.set(report.id, report);

  const onToken = (text: string) => {
    report.text += text;
    emit("report:token", { report_id: report.id, text });
  };

  const streaming = (async () => {
    try {
      const { text, source } = await getAi().report(metrics, onToken, (e) =>
        emit("agent:event", { ...e, run_id: report.id }),
      );
      report.text = text;
      report.source = source;
      report.status = "done";
    } catch (err) {
      report.status = "failed";
      emit("agent:event", { agent: "narrative", step: 99, status: "fail", run_id: report.id, message: `Report failed: ${(err as Error).message}` });
    }
    emit("report:done", { report_id: report.id, text: report.text });
  })();

  return { report, streaming };
}
