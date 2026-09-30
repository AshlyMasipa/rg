/**
 * The ONLY place a need's status changes. Every change writes an audit row.
 * Callers emit `need:updated` themselves (after their transaction commits),
 * so a failed transaction never broadcasts a state that didn't happen.
 *
 *   Draft → Unmet → Matched → Approved → Active → Delivered
 *              ↑________|  (a re-solve can lose its matches)
 */
import { eq } from "drizzle-orm";
import type { ActorRole, BindingConstraint, CommunityNeed, NeedStatus } from "shared";
import { db, schema, type DbLike } from "../db/client";
import { audit } from "./audit";
import { conflict } from "./errors";
import { getNeed } from "./world";

const ALLOWED: Record<NeedStatus, NeedStatus[]> = {
  Draft: ["Unmet"],
  Unmet: ["Unmet", "Matched"],
  Matched: ["Matched", "Unmet", "Approved"],
  Approved: ["Active"],
  Active: ["Delivered"],
  Delivered: [],
};

export function canTransition(from: NeedStatus, to: NeedStatus) {
  return ALLOWED[from].includes(to);
}

export function setStatus(
  needId: string,
  next: NeedStatus,
  actor: ActorRole,
  opts: { detail?: Record<string, unknown>; binding?: BindingConstraint | null; tx?: DbLike } = {},
): CommunityNeed {
  const tx = opts.tx ?? db;
  const current = getNeed(needId, tx);
  if (!canTransition(current.status, next)) {
    throw conflict(`Need ${needId} cannot go from ${current.status} to ${next}`);
  }
  const patch: Partial<CommunityNeed> = { status: next };
  if (opts.binding !== undefined) patch.last_binding_constraint = opts.binding;
  tx.update(schema.community_needs).set(patch).where(eq(schema.community_needs.id, needId)).run();
  if (current.status !== next) {
    audit(actor, `need.status.${next}`, needId, { from: current.status, to: next, ...opts.detail }, tx);
  }
  return getNeed(needId, tx);
}
