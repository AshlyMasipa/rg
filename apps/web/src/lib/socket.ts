import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "shared";

/** One socket for the whole app, same origin (Vite proxies /socket.io in dev). */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  transports: ["websocket", "polling"],
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});
