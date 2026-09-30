import type { AgentEvent } from "shared";
import { config } from "../config";
import { currentGeneration, emit } from "../realtime";
import { sleep } from "./ids";

/**
 * Emit agent events spaced out so humans can follow them.
 * The computation already happened (in ms); only the display is paced.
 * Total duration is capped at TRACE_MAX_MS however long the trace is.
 * Stops early if a demo reset happens mid-stream.
 */
export async function emitPaced(events: AgentEvent[], paceMs = config.tracePaceMs): Promise<boolean> {
  const gen = currentGeneration();
  const step = events.length ? Math.min(paceMs, config.traceMaxMs / events.length) : 0;
  for (const e of events) {
    if (currentGeneration() !== gen) return false;
    emit("agent:event", e);
    if (step > 0) await sleep(step);
  }
  return currentGeneration() === gen;
}
