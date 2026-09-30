import { MemoryCache, hashKey } from "./cache.js";
import { ExtractionError, isRecoverable, type AiProvider } from "./provider.js";
import {
  CONFIDENCE_THRESHOLD,
  ProviderExtractionSchema,
  type Confidence,
  type ExtractionResponse,
  type ExtractionSource,
  type ProviderExtraction,
} from "./types.js";

/** Matches the socket payload in brief Section 2.5. */
export type AgentEvent = {
  agent: "extraction";
  step: number;
  status: "start" | "pass" | "fail" | "done";
  message: string;
  ref_id?: string;
};

export type EmitFn = (event: AgentEvent) => void;

const CHAIN_DEADLINE_MS = 20_000;

type CachedEntry = { extraction: ProviderExtraction; source: ExtractionSource };

const cache = new MemoryCache<CachedEntry>();

export function cacheStats() {
  return cache.stats();
}

/** Only for tests and demo reset. Never call this from a request path. */
export function clearExtractionCache() {
  cache.clear();
}

export async function extractNeed(
  text: string,
  currentDate: string,
  providers: AiProvider[],
  emit: EmitFn = () => {},
): Promise<ExtractionResponse> {
  let step = 0;

  /* ---------- stage 0: cache ---------- */
  const key = hashKey(text);
  const cached = cache.get(key);
  if (cached) {
    emit({
      agent: "extraction",
      step: ++step,
      status: "pass",
      message: "Served from cache, no model call",
    });
    return success(cached.extraction, "cache");
  }

  let lastError: ExtractionError | undefined;
  const deadline = Date.now() + CHAIN_DEADLINE_MS;

  for (const provider of providers) {
    const needsNetwork =
      provider.source === "gemini-flash" || provider.source === "gemini-flash-lite";

    if (needsNetwork && Date.now() > deadline) {
      emit({
        agent: "extraction",
        step: ++step,
        status: "fail",
        message: `Skipping ${label(provider.source)}, out of time`,
      });
      lastError ??= new ExtractionError("TIMEOUT", "Chain deadline exceeded");
      continue;
    }

    emit({
      agent: "extraction",
      step: ++step,
      status: "start",
      message: `Reading the message with ${label(provider.source)}`,
    });

    try {
      const raw = await provider.extractNeed(text, currentDate);

      const parsed = ProviderExtractionSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ExtractionError(
          "PARSE_FAILED",
          `${provider.source} returned a shape that failed validation`,
          parsed.error,
        );
      }

      const extraction = parsed.data;
      cache.set(key, { extraction, source: provider.source });

      const flagged = lowConfidenceFields(extraction.confidence);
      emit({
        agent: "extraction",
        step: ++step,
        status: "pass",
        message: flagged.length
          ? `Extracted; ${flagged.length} field(s) need the coach to check`
          : "Extracted with high confidence across all fields",
      });

      return success(extraction, provider.source);
    } catch (err) {
      lastError =
        err instanceof ExtractionError
          ? err
          : new ExtractionError("PARSE_FAILED", String(err), err);

      emit({
        agent: "extraction",
        step: ++step,
        status: "fail",
        message: `${label(provider.source)} failed (${lastError.code}). Falling back.`,
      });

      if (!isRecoverable(lastError)) break;
    }
  }


  emit({
    agent: "extraction",
    step: ++step,
    status: "done",
    message: "No extractor succeeded, handing over to manual entry",
  });

  return {
    success: false,
    extracted: null,
    error: {
      code: lastError?.code ?? "PARSE_FAILED",
      message: lastError?.message ?? "Extraction failed",
    },
  };
}

function success(
  extraction: ProviderExtraction,
  source: ExtractionSource,
): ExtractionResponse {
  return {
    success: true,
    extracted: extraction.extracted,
    confidence: extraction.confidence,
    missing_fields: extraction.missing_fields,
    source,
    raw_ai_output: extraction.raw_ai_output ?? null,
    error: null,
  };
}

/** Fields D paints amber with "Please check". */
export function lowConfidenceFields(confidence: Confidence): string[] {
  // Object.entries widens the value type, so the cast is doing real work.
  return Object.entries(confidence)
    .filter(([, score]) => (score as number) < CONFIDENCE_THRESHOLD)
    .map(([field]) => field);
}

const SOURCE_LABELS: Record<ExtractionSource, string> = {
  "cache": "cache",
  "gemini-flash": "Gemini Flash",
  "gemini-flash-lite": "Gemini Flash-Lite",
  "rules": "the rules extractor",
  "mock": "the mock extractor",
};

function label(source: ExtractionSource): string {
  return SOURCE_LABELS[source] ?? source;
}