/** Socket.io: what Person D's screens will actually receive. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { io as connect, type Socket } from "socket.io-client";
import type { AgentEvent, ClientToServerEvents, CommunityNeed, ServerToClientEvents } from "shared";
import { buildApp } from "../src/app";
import { setAi } from "../src/ai";
import { closeRealtime } from "../src/realtime";

let app: FastifyInstance;
let base: string;
let phone: Socket<ServerToClientEvents, ClientToServerEvents>;
let laptop: Socket<ServerToClientEvents, ClientToServerEvents>;

const post = (url: string, body: unknown = {}) =>
  fetch(`${base}${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(
    (r) => r.json(),
  );

const waitFor = <E extends keyof ServerToClientEvents>(s: typeof phone, event: E, pred: (...a: Parameters<ServerToClientEvents[E]>) => boolean) =>
  new Promise<Parameters<ServerToClientEvents[E]>>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 5000);
    const handler = (...args: Parameters<ServerToClientEvents[E]>) => {
      if (pred(...args)) {
        clearTimeout(t);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        s.off(event, handler as any);
        resolve(args);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.on(event, handler as any);
  });

beforeAll(async () => {
  setAi(null);
  app = await buildApp({ logger: false });
  await app.listen({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  phone = connect(base, { transports: ["websocket"] });
  laptop = connect(base, { transports: ["websocket"] });
  await Promise.all([phone, laptop].map((s) => new Promise((r) => s.on("connect", () => r(null)))));
  await post("/api/demo/reset", { state: "fresh" });
});

afterAll(async () => {
  phone.close();
  laptop.close();
  await closeRealtime();
  await app.close();
});

describe("realtime", () => {
  it("streams the constraint trace, then bundles, and syncs approval to the phone", async () => {
    const need: CommunityNeed = await post("/api/needs", {
      school_id: "school-thabo", age_group: "U16", gender: "girls", participants: 28,
      days: ["tue"], start_time: "15:00", end_time: "17:00",
      needs: { field: true, coach: true, balls: 6, transport: false },
    });

    const events: AgentEvent[] = [];
    laptop.on("agent:event", (e) => e.need_id === need.id && events.push(e));
    const proposed = waitFor(laptop, "bundles:proposed", (p) => p.need_id === need.id);

    const solve = await post(`/api/needs/${need.id}/solve?pace=2`);
    const [p] = await proposed;

    expect(events[0].status).toBe("start");
    expect(events.at(-1)!.status).toBe("done");
    expect(events.some((e) => e.ref_id === "coach-dlamini" && e.status === "fail")).toBe(true);
    expect(events.length).toBe(solve.trace.length + 2);
    expect(p.bundles[0].id).toBe(solve.bundles[0].id);

    // approval on the laptop → the phone hears about it
    const phoneSees = waitFor(phone, "need:updated", (n) => n.id === need.id && n.status === "Approved");
    await post(`/api/bundles/${solve.bundles[0].id}/approve`, {});
    const [updated] = await phoneSees;
    expect(updated.status).toBe("Approved");
  });

  it("demo reset broadcasts demo:reset to every client", async () => {
    const both = Promise.all([
      waitFor(phone, "demo:reset", (p) => p.state === "eight-weeks-later"),
      waitFor(laptop, "demo:reset", (p) => p.state === "eight-weeks-later"),
    ]);
    await post("/api/demo/reset", { state: "eight-weeks-later" });
    await both;
  });

  it("streams report tokens and a final report:done", async () => {
    let tokens = "";
    laptop.on("report:token", (t) => (tokens += t.text));
    const done = waitFor(laptop, "report:done", () => true);
    const { report_id } = await post("/api/reports/generate", {});
    const [final] = await done;
    expect(final.report_id).toBe(report_id);
    expect(tokens).toBe(final.text);
  });
});
