import { eq, inArray } from "drizzle-orm";
import type { Booking, CommunityNeed, OpportunityBundle, WorldState } from "shared";
import { db, schema, type DbLike } from "../db/client";
import type { EngineWorld } from "../engine";
import { notFound } from "./errors";

/** Needs whose programme occupies a field/coach slot. Delivered programmes free their slots. */
const OCCUPYING = ["Approved", "Active"] as const;

/**
 * Existing approved programmes, flattened so the engine can check
 * double-booking (resolves engine NOTES.md #1 — option (c): A joins).
 */
export function loadBookings(tx: DbLike = db): Booking[] {
  return tx
    .select({
      id: schema.assignments.id,
      bundle_id: schema.assignments.bundle_id,
      owner_role: schema.assignments.owner_role,
      start_date: schema.assignments.start_date,
      weeks: schema.assignments.weeks,
      field_id: schema.opportunity_bundles.field_id,
      coach_id: schema.opportunity_bundles.coach_id,
      days: schema.community_needs.days,
      start_time: schema.community_needs.start_time,
      end_time: schema.community_needs.end_time,
    })
    .from(schema.assignments)
    .innerJoin(schema.opportunity_bundles, eq(schema.assignments.bundle_id, schema.opportunity_bundles.id))
    .innerJoin(schema.community_needs, eq(schema.opportunity_bundles.need_id, schema.community_needs.id))
    .where(inArray(schema.community_needs.status, [...OCCUPYING]))
    .all();
}

export function loadWorld(tx: DbLike = db): EngineWorld {
  return {
    schools: tx.select().from(schema.schools).all(),
    fields: tx.select().from(schema.fields).all(),
    coaches: tx.select().from(schema.coaches).all(),
    kits: tx.select().from(schema.equipment_kits).all(),
    transport: tx.select().from(schema.transport_offers).all(),
    sponsors: tx.select().from(schema.sponsor_budgets).all(),
    bookings: loadBookings(tx),
  };
}

export function loadNeeds(tx: DbLike = db): CommunityNeed[] {
  return tx.select().from(schema.community_needs).all();
}

/** GET /api/state — everything the map and dashboard need in one call. */
export function loadState(): WorldState {
  const w = loadWorld();
  return {
    schools: w.schools,
    fields: w.fields,
    coaches: w.coaches,
    kits: w.kits,
    transport: w.transport,
    sponsors: w.sponsors,
    needs: loadNeeds(),
    bundles: db.select().from(schema.opportunity_bundles).all(),
    assignments: db.select().from(schema.assignments).all(),
    evidence: db.select().from(schema.delivery_evidence).all(),
  };
}

export function getNeed(id: string, tx: DbLike = db): CommunityNeed {
  const need = tx.select().from(schema.community_needs).where(eq(schema.community_needs.id, id)).get();
  if (!need) throw notFound("Need", id);
  return need;
}

export function getBundle(id: string, tx: DbLike = db): OpportunityBundle {
  const bundle = tx.select().from(schema.opportunity_bundles).where(eq(schema.opportunity_bundles.id, id)).get();
  if (!bundle) throw notFound("Bundle", id);
  return bundle;
}

export function getAssignment(id: string, tx: DbLike = db) {
  const a = tx.select().from(schema.assignments).where(eq(schema.assignments.id, id)).get();
  if (!a) throw notFound("Assignment", id);
  return a;
}

export function getSchool(id: string, tx: DbLike = db) {
  const s = tx.select().from(schema.schools).where(eq(schema.schools.id, id)).get();
  if (!s) throw notFound("School", id);
  return s;
}
