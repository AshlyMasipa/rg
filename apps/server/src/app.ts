import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config } from "./config";
import { registerErrorHandler } from "./lib/errors";
import { apiRoutes } from "./routes/api";
import { attachRealtime } from "./realtime";

/** Built frontend (Person D): served from the same origin in production. */
const WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
  });

  await app.register(cors, { origin: true, credentials: true });
  registerErrorHandler(app);
  await app.register(apiRoutes, { prefix: "/api" });

  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
    // SPA fallback: any non-API GET returns index.html so client-side routes work on refresh.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/socket.io")) {
        return reply.sendFile("index.html");
      }
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: `${req.method} ${req.url} not found` } });
    });
  } else {
    app.get("/", async () => ({ name: "RugbyGrid API", docs: "see apps/server/README.md", health: "/api/health" }));
    app.setNotFoundHandler((req, reply) =>
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `${req.method} ${req.url} not found` } }),
    );
  }

  // Socket.io shares Fastify's HTTP server (same port, same origin).
  attachRealtime(app.server);
  return app;
}
