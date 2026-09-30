/**
 * ADAPTER between the server and Person C's AI package (packages/ai).
 * Routes and services import from here, never from "ai" directly.
 *
 * C's package owns the whole fallback chain (cache → Gemini → fallback model
 * → rules) and never throws. This file only:
 *   - builds it from env, with AI_MODE switchable at runtime,
 *   - maps our ImpactSummary to the shape C's narrative agent expects,
 *   - checks at compile time that C's contract matches packages/shared.
 */
import { buildAi, readConfig, type Ai, type AiMode } from "ai";
import type * as C from "ai";
import type { ExtractedNeed, ExtractionResult, ImpactSummary } from "shared";
import { config } from "./config";

let mode: AiMode = config.aiMode;
let instance: Ai | null = null;

export function getAi(): Ai {
  if (!instance) instance = buildAi({ ...readConfig(process.env), mode, timeoutMs: config.aiTimeoutMs });
  return instance;
}

export function getAiMode(): AiMode {
  return mode;
}

/** Runtime switch — POST /api/settings/ai-mode (the role-switcher toggle). Caches survive. */
export function setAiMode(next: AiMode) {
  mode = next;
  instance = null;
}

/** For tests. */
export function setAi(ai: Ai | null) {
  instance = ai;
}

/** C's narrative agent needs a number for cost, not null. Everything else passes through. */
export function toAiMetrics(m: ImpactSummary): C.ImpactSummary {
  return { ...m, cost_per_participant_session: m.cost_per_participant_session ?? 0 };
}

export type { Ai, AiMode };

// ---------------------------------------------------------------------------
// Compile-time contract checks: `pnpm typecheck` fails if C's types and
// packages/shared drift (C's NOTES.md #7 — two copies until merged).
// ---------------------------------------------------------------------------
type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;

export type _Checks = [
  Assert<Extends<C.ExtractedNeed, ExtractedNeed>>,
  Assert<Extends<ExtractedNeed, C.ExtractedNeed>>,
  Assert<Extends<C.ExtractionResponse, ExtractionResult>>,
];
