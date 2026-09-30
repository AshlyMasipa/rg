import { MemoryCache, hashJson } from "./cache.js";
import type { AiProvider } from "./provider.js";
import { templatedReport } from "./providers/mock.js";
import type { ImpactSummary } from "./types.js";

export type NarrativeEvent = {
  agent: "narrative";
  step: number;
  status: "start" | "pass" | "fail" | "done";
  message: string;
  ref_id?: string;
};

export type NarrativeSource = "cache" | "model" | "template";

const reportCache = new MemoryCache<string>(50);

export function narrativeCacheStats() {
  return reportCache.stats();
}

export function clearNarrativeCache() {
  reportCache.clear();
}

export async function generateReport(
  metrics: ImpactSummary,
  providers: AiProvider[],
  onToken: (token: string) => void,
  emit: (event: NarrativeEvent) => void = () => {},
): Promise<{ text: string; source: NarrativeSource }> {
  let step = 0;
  const key = hashJson(metrics);

  /* ---------- stage 0: cache ---------- */
  const cached = reportCache.get(key);
  if (cached) {
    emit({
      agent: "narrative",
      step: ++step,
      status: "pass",
      message: "Report served from cache",
    });
    await replay(cached, onToken);
    emit({ agent: "narrative", step: ++step, status: "done", message: "Report complete" });
    return { text: cached, source: "cache" };
  }

  /* ---------- stages 1..n: providers that can stream ---------- */
  for (const provider of providers) {
    if (!provider.streamReport) continue;

    emit({
      agent: "narrative",
      step: ++step,
      status: "start",
      message: "Writing the sponsor report",
    });

    let buffer = "";
    try {
      await provider.streamReport(metrics, (token) => {
        buffer += token;
        onToken(token);
      });

      if (!buffer.trim()) throw new Error("empty stream");

      reportCache.set(key, buffer);
      emit({ agent: "narrative", step: ++step, status: "done", message: "Report complete" });
      return { text: buffer, source: "model" };
    } catch {
      emit({
        agent: "narrative",
        step: ++step,
        status: "fail",
        message: "Model unavailable, using the standard report format",
      });
    }
  }

  const text = templatedReport(metrics);
  reportCache.set(key, text);

  emit({
    agent: "narrative",
    step: ++step,
    status: "pass",
    message: "Report generated from the same figures, without a model",
  });

  await replay(text, onToken);

  emit({ agent: "narrative", step: ++step, status: "done", message: "Report complete" });
  return { text, source: "template" };
}


async function replay(text: string, onToken: (t: string) => void): Promise<void> {
  for (let i = 0; i < text.length; i += 30) {
    onToken(text.slice(i, i + 30));
    await new Promise((r) => setTimeout(r, 40));
  }
}
