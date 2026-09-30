/**
 * Socket.io event contract (Section 2.5). Frontend usage:
 *   import { io, type Socket } from "socket.io-client";
 *   import type { ServerToClientEvents, ClientToServerEvents } from "shared";
 *   const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
 *
 * Clients never write over the socket — all writes go through REST.
 * On (re)connect, refetch GET /api/state; never trust socket state alone.
 */
import type { BindingConstraint, CommunityNeed, OpportunityBundle } from "./types";
import type { DemoState } from "./schemas";

export const ROOM = "province:gauteng";

export type AgentName = "extraction" | "constraint" | "simulation" | "narrative";
export type AgentEventStatus = "start" | "pass" | "fail" | "done";

export interface AgentEvent {
  agent: AgentName;
  step: number;
  status: AgentEventStatus;
  message: string;
  ref_id?: string;  // entity the event is about — matches a map marker id (e.g. "coach-dlamini")
  check?: string;   // constraint name for constraint events ("time", "safeguarding", ...)
  run_id?: string;  // groups the events of one solve / extraction / report
  need_id?: string;
}

export interface ServerToClientEvents {
  "agent:event": (e: AgentEvent) => void;
  "need:updated": (need: CommunityNeed) => void;
  "bundles:proposed": (p: {
    need_id: string;
    run_id: string;
    bundles: OpportunityBundle[];
    binding_constraint: BindingConstraint | null;
  }) => void;
  "report:token": (p: { report_id: string; text: string }) => void;
  "report:done": (p: { report_id: string; text: string }) => void;
  "demo:reset": (p: { state: DemoState }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {}
