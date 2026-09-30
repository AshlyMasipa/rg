import type { ActorRole } from "shared";
import { db, schema, type DbLike } from "../db/client";
import { newId, nowIso } from "./ids";

/** Append-only log of every state change — the governance story for judges. */
export function audit(
  actor_role: ActorRole,
  action: string,
  entity_id: string,
  detail: unknown = null,
  tx: DbLike = db,
) {
  tx.insert(schema.audit_events)
    .values({ id: newId("audit"), actor_role, action, entity_id, detail, created_at: nowIso() })
    .run();
}
