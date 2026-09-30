import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { ROOM, type ClientToServerEvents, type ServerToClientEvents } from "shared";

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

/**
 * Bumped on every demo reset so paced emissions from before the reset stop
 * immediately instead of drawing stale checks on a freshly reset map.
 */
let generation = 0;
export const currentGeneration = () => generation;
export const bumpGeneration = () => ++generation;

export function attachRealtime(server: HttpServer) {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: { origin: true, credentials: true },
  });
  io.on("connection", (socket) => {
    socket.join(ROOM);
  });
  return io;
}

/** Typed broadcast to everyone in the province room. Safe to call before attach (no-op). */
export function emit<E extends keyof ServerToClientEvents>(
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  io?.to(ROOM).emit(event, ...args);
}

export function connectedClients() {
  return io?.of("/").sockets.size ?? 0;
}

export function closeRealtime() {
  return new Promise<void>((resolve) => {
    if (!io) return resolve();
    io.close(() => resolve());
    io = null;
  });
}
