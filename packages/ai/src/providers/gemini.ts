import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import { ExtractionError, type AiProvider } from "../provider.js";
import { buildExtractionPrompt, buildNarrativePrompt, GEMINI_EXTRACTION_SCHEMA }
  from "../prompts.js";
import type {
  ExtractionSource,
  ImpactSummary,
  ProviderExtraction,
} from "../types.js";

export class GeminiProvider implements AiProvider {
  constructor(
    private readonly ai: GoogleGenAI,
    readonly source: Extract<ExtractionSource, "gemini-flash" | "gemini-flash-lite">,
    private readonly model: string,
    private readonly timeoutMs = 8000,
  ) {}

  async extractNeed(text: string, currentDate: string): Promise<ProviderExtraction> {
    try {
      return await this.attempt(text, currentDate);
    } catch (err) {
 
      if (err instanceof ExtractionError && isTransientBusy(err)) {
        await new Promise((r) => setTimeout(r, 1200));
        return await this.attempt(text, currentDate);
      }
      throw err;
    }
  }

  private async attempt(
    text: string,
    currentDate: string,
  ): Promise<ProviderExtraction> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let rawText: string;

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: buildExtractionPrompt(text, currentDate),
        config: {
          responseMimeType: "application/json",
          responseSchema: GEMINI_EXTRACTION_SCHEMA,
          temperature: 0,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: controller.signal,
        },
      });
      rawText = response.text ?? "";
    } catch (err) {
      throw classify(err, controller.signal.aborted, this.model);
    } finally {
      clearTimeout(timer);
    }

    if (!rawText.trim()) {
      throw new ExtractionError("PARSE_FAILED", `${this.model} returned empty text`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(rawText));
    } catch (err) {
      throw new ExtractionError(
        "PARSE_FAILED",
        `${this.model} returned text that is not JSON`,
        err,
      );
    }
    const { confidence, missing_fields, ...extracted } = parsed as Record<string, unknown>;

    return {
      extracted,
      confidence,
      missing_fields: missing_fields ?? [],
      raw_ai_output: parsed,
    } as ProviderExtraction;
  }

  async streamReport(
    metrics: ImpactSummary,
    onToken: (token: string) => void,
  ): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs * 3);

    try {
      const stream = await this.ai.models.generateContentStream({
        model: this.model,
        contents: buildNarrativePrompt(JSON.stringify(metrics, null, 2)),
        config: {
          temperature: 0.4,
          maxOutputTokens: 400,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: controller.signal,
        },
      });

      for await (const chunk of stream) {
        const piece = chunk.text;
        if (piece) onToken(piece);
      }
    } catch (err) {
      throw classify(err, controller.signal.aborted, this.model);
    } finally {
      clearTimeout(timer);
    }
  }
}

function classify(err: unknown, aborted: boolean, model: string): ExtractionError {
  if (aborted) {
    return new ExtractionError("TIMEOUT", `${model} exceeded the time budget`, err);
  }

  const e = err as Record<string, any>;
  const status =
    e?.status ?? e?.code ?? e?.response?.status ?? e?.error?.code;
  const message = String(e?.message ?? e?.error?.message ?? err ?? "");


  const busy =
    status === 429 ||
    status === 503 ||
    /\b(429|503)\b/.test(message) ||
    /RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(message) ||
    /quota|rate limit|high demand|overloaded/i.test(message);

  if (busy) {
    const why = /503|UNAVAILABLE|high demand/i.test(message)
      ? "is busy"
      : "hit a rate limit";
    return new ExtractionError("RATE_LIMITED", `${model} ${why}`, err);
  }

  if (/abort|timed? ?out|ETIMEDOUT/i.test(message)) {
    return new ExtractionError("TIMEOUT", `${model} timed out`, err);
  }

  return new ExtractionError("PARSE_FAILED", `${model} failed: ${message}`, err);
}

function isTransientBusy(err: ExtractionError): boolean {
  if (err.code !== "RATE_LIMITED") return false;
  const cause = err.cause as Record<string, any> | undefined;
  const text = String(cause?.message ?? cause?.error?.message ?? "");
  if (/quota|RESOURCE_EXHAUSTED|billing/i.test(text)) return false;
  return /\b503\b|UNAVAILABLE|high demand|overloaded/i.test(text);
}

/** Models sometimes wrap JSON in ```json fences despite the mime type. */
function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}