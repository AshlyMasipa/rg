import { buildApp } from "./app";
import { config } from "./config";
import { isEmpty, loadSeed } from "./db/seed";
import { closeRealtime } from "./realtime";
import { sqlite } from "./db/client";

const app = await buildApp();

if (config.seedOnBoot && isEmpty()) {
  loadSeed("fresh");
  app.log.info("Empty database: loaded seed/fresh.json");
}

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`RugbyGrid API on :${config.port} (AI_MODE=${config.aiMode}, DB=${config.dbPath})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async () => {
  await closeRealtime();
  await app.close();
  sqlite.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
