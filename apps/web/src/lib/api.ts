/**
 * Typed REST client for apps/server (Section 2.6). Every type comes from
 * `shared` — there is no second copy of the domain model in the frontend.
 */
import type {
  ApproveBody, ApproveResponse, AuditEvent, CommunityNeed, CreateNeedBody, DeliveryEvidence,
  DemoState, EvidenceBody, ExtractRequest, ExtractionResult, ImpactSummary, ReportRecord,
  SimulateBody, SimulateResponse, SolveResponse, WorldState,
} from "shared";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public issues?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the RugbyGrid server. Check the connection and try again.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? "INTERNAL", e?.message ?? `Request failed (${res.status})`, e?.issues);
  }
  return json as T;
}

export type ExtractResponse = ExtractionResult & { run_id: string };
export type AiMode = "live" | "mock";

export const api = {
  health: () => request<{ ok: boolean; ai_mode: AiMode; clients: number; time: string }>("GET", "/health"),
  state: () => request<WorldState>("GET", "/state"),
  impact: () => request<ImpactSummary>("GET", "/impact"),
  audit: (limit = 200) => request<AuditEvent[]>("GET", `/audit?limit=${limit}`),

  extract: (body: ExtractRequest) => request<ExtractResponse>("POST", "/needs/extract", body),
  createNeed: (body: CreateNeedBody) => request<CommunityNeed>("POST", "/needs", body),
  solve: (id: string, pace?: number) =>
    request<SolveResponse>("POST", `/needs/${id}/solve${pace !== undefined ? `?pace=${pace}` : ""}`),
  approve: (bundleId: string, body: Partial<ApproveBody>) =>
    request<ApproveResponse>("POST", `/bundles/${bundleId}/approve`, body),
  evidence: (assignmentId: string, body: EvidenceBody) =>
    request<{ evidence: DeliveryEvidence; need: CommunityNeed; sessions_logged: number; sessions_planned: number }>(
      "POST", `/assignments/${assignmentId}/evidence`, body,
    ),

  simulate: (body: Partial<SimulateBody>) => request<SimulateResponse>("POST", "/simulate", body),
  generateReport: (sponsor_id?: string) => request<{ report_id: string }>("POST", "/reports/generate", { sponsor_id }),
  report: (id: string) => request<ReportRecord>("GET", `/reports/${id}`),

  reset: (state: DemoState) => request<{ ok: true; state: DemoState }>("POST", "/demo/reset", { state }),
  aiHealth: () =>
    request<{ mode: AiMode; model: string | null; fallback_model: string | null; key_present: boolean; cache: unknown }>(
      "GET", "/ai/health",
    ),
  setAiMode: (mode: AiMode) => request<{ mode: AiMode }>("POST", "/settings/ai-mode", { mode }),
};
