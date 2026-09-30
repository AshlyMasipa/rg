import type { DemoState } from "shared";
import { loadSeed } from "../db/seed";
import { audit } from "../lib/audit";
import { bumpGeneration, emit } from "../realtime";
import { clearReports } from "./reports";

/** One-tap reset from the role switcher. Stops any in-flight paced trace first. */
export function resetDemo(state: DemoState) {
  bumpGeneration();
  loadSeed(state);
  clearReports();
  audit("system", "demo.reset", state, { state });
  emit("demo:reset", { state });
}
