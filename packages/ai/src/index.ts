import { GoogleGenAI } from "@google/genai";

import { extractNeed, cacheStats, type AgentEvent, type EmitFn } from "./extract.js";
import { generateReport, narrativeCacheStats, type NarrativeEvent } from "./narrative.js";
import type { AiProvider } from "./provider.js";
import { GeminiProvider } from "./providers/gemini.js";
import { MockProvider } from "./providers/mock.js";
import { RulesProvider } from "./providers/rules.js";
import type { ExtractionResponse, ImpactSummary } from "./types.js";

export type AiMode = "live" | "mock";

export type AiConfig = {
  mode: AiMode;
  apiKey?: string;
  model: string;
  fallbackModel: string;
  timeoutMs: number;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  return {
    mode: env.AI_MODE === "mock" ? "mock" : "live",
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL ?? "",
    fallbackModel: env.GEMINI_FALLBACK_MODEL ?? "",
    timeoutMs: Number(env.AI_TIMEOUT_MS ?? 8000),
  };
}

export function buildProviders(config: AiConfig): AiProvider[] {
  if (config.mode === "mock") {
    return [new MockProvider()];
  }

  if (!config.apiKey) {
    console.warn("[ai] GEMINI_API_KEY missing — running on rules only");
    return [new RulesProvider()];
  }

  if (!config.model) {
    console.warn("[ai] GEMINI_MODEL not set — run verify.ts models, then set it");
  }

  const genai = new GoogleGenAI({ apiKey: config.apiKey });
  const chain: AiProvider[] = [];

  if (config.model) {
    chain.push(
      new GeminiProvider(genai, "gemini-flash", config.model, config.timeoutMs),
    );
  }
  if (config.fallbackModel) {
    chain.push(
      new GeminiProvider(
        genai, "gemini-flash-lite", config.fallbackModel, config.timeoutMs,
      ),
    );
  }

  chain.push(new RulesProvider());
  return chain;
}

export type Ai = {
  mode: AiMode;
  extract(
    text: string,
    currentDate: string,
    emit?: EmitFn,
  ): Promise<ExtractionResponse>;
  report(
    metrics: ImpactSummary,
    onToken: (token: string) => void,
    emit?: (event: NarrativeEvent) => void,
  ): Promise<{ text: string; source: string }>;
  stats(): { extraction: ReturnType<typeof cacheStats>; narrative: ReturnType<typeof narrativeCacheStats> };
};

export function buildAi(config: AiConfig = readConfig()): Ai {
  const providers = buildProviders(config);

  console.log(
    `[ai] mode=${config.mode} chain=[${providers.map((p) => p.source).join(" -> ")}]`,
  );

  return {
    mode: config.mode,

    extract: (text, currentDate, emit) =>
      extractNeed(text, currentDate, providers, emit),

    report: (metrics, onToken, emit) =>
      generateReport(metrics, providers, onToken, emit),

    stats: () => ({
      extraction: cacheStats(),
      narrative: narrativeCacheStats(),
    }),
  };
}

/* Re-exports so A imports from one place. */
export type { AgentEvent, NarrativeEvent, EmitFn };
export * from "./types.js";
