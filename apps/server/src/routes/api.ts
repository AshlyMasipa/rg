/**
 * Every REST endpoint (Section 2.6). Bodies are validated with the shared Zod
 * schemas; errors become { error: { code, message } } via lib/errors.ts.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ApproveBody, CreateNeedBody, DemoResetBody, EvidenceBody, ExtractRequest,
  GenerateReportBody, SimulateBody,
} from "shared";
import { getAi, getAiMode, setAiMode } from "../ai";
import { connectedClients } from "../realtime";
import { computeImpact } from "../lib/impact";
import { loadState, getNeed } from "../lib/world";
import { addEvidence, approveBundle, createNeed, extractNeed, solveNeed } from "../services/needs";
import { generateReport, getReport } from "../services/reports";
import { simulate } from "../services/simulate";
import { resetDemo } from "../services/demo";
import { db, schema } from "../db/client";
import { desc } from "drizzle-orm";

const IdParam = z.object({ id: z.string().min(1) });
const PaceQuery = z.object({ pace: z.coerce.number().min(0).max(1000).optional() });

export async function apiRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    ok: true,
    ai_mode: getAiMode(),
    clients: connectedClients(),
    time: new Date().toISOString(),
  }));

  // ---- read ----
  app.get("/state", async () => loadState());
  app.get("/impact", async () => computeImpact());
  app.get("/needs/:id", async (req) => getNeed(IdParam.parse(req.params).id));
  app.get("/audit", async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    return db.select().from(schema.audit_events).orderBy(desc(schema.audit_events.created_at)).limit(limit).all();
  });

  // ---- core loop ----
  app.post("/needs/extract", async (req) => extractNeed(ExtractRequest.parse(req.body)));

  app.post("/needs", async (req, reply) => reply.status(201).send(createNeed(CreateNeedBody.parse(req.body))));

  /** Returns immediately with persisted bundles; agent:events stream over the socket. ?pace=0 disables pacing. */
  app.post("/needs/:id/solve", async (req) => {
    const { id } = IdParam.parse(req.params);
    const { pace } = PaceQuery.parse(req.query);
    const { response, streaming } = solveNeed(id, { paceMs: pace });
    streaming.catch((err) => req.log.error(err, "paced emission failed"));
    return response;
  });

  app.post("/bundles/:id/approve", async (req) =>
    approveBundle(IdParam.parse(req.params).id, ApproveBody.parse(req.body ?? {})),
  );

  app.post("/assignments/:id/evidence", async (req, reply) =>
    reply.status(201).send(addEvidence(IdParam.parse(req.params).id, EvidenceBody.parse(req.body))),
  );

  // ---- intelligence ----
  app.post("/simulate", async (req) => simulate(SimulateBody.parse(req.body ?? {})));

  app.post("/reports/generate", async (req, reply) => {
    const { sponsor_id } = GenerateReportBody.parse(req.body ?? {});
    const { report, streaming } = generateReport(sponsor_id);
    streaming.catch((err) => req.log.error(err, "report stream failed"));
    return reply.status(202).send({ report_id: report.id });
  });
  app.get("/reports/:id", async (req) => getReport(IdParam.parse(req.params).id));

  // ---- demo controls ----
  app.post("/demo/reset", async (req) => {
    const { state } = DemoResetBody.parse(req.body ?? {});
    resetDemo(state);
    return { ok: true, state };
  });

  /** C's suggested check: is production actually configured? Costs no quota. */
  app.get("/ai/health", async () => ({
    mode: getAiMode(),
    model: process.env.GEMINI_MODEL ?? null,
    fallback_model: process.env.GEMINI_FALLBACK_MODEL ?? null,
    key_present: Boolean(process.env.GEMINI_API_KEY),
    cache: getAi().stats(),
  }));

  app.get("/settings/ai-mode", async () => ({ mode: getAiMode() }));
  app.post("/settings/ai-mode", async (req) => {
    const { mode } = z.object({ mode: z.enum(["live", "mock"]) }).parse(req.body);
    setAiMode(mode);
    return { mode };
  });
}
