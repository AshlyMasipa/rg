/** All environment config in one place. See .env.example at the repo root. */
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : fallback;
};
const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined || v === "" ? fallback : ["1", "true", "yes"].includes(v.toLowerCase());

export const config = {
  port: num(process.env.PORT, 3000),
  host: process.env.HOST ?? "0.0.0.0",
  dbPath: process.env.DB_PATH ?? "rugbygrid.db",
  /** Load seed/fresh.json on boot when the DB is empty. */
  seedOnBoot: bool(process.env.SEED_ON_BOOT, true),
  /** Display pacing between constraint agent:events (the solve itself is instant). */
  tracePaceMs: num(process.env.TRACE_PACE_MS, 80),
  /** Never let a paced trace run longer than this, however many checks there are. */
  traceMaxMs: num(process.env.TRACE_MAX_MS, 6000),
  aiMode: (process.env.AI_MODE === "live" ? "live" : "mock") as "live" | "mock",
  aiTimeoutMs: num(process.env.AI_TIMEOUT_MS, 12000),
  logLevel: process.env.LOG_LEVEL ?? "info",
};
