/**
 * Drizzle table definitions (Section 1 of the plan). Property names are
 * snake_case on purpose so rows match the API contract with no mapping layer.
 * JSON columns are stored as TEXT and parsed by Drizzle automatically.
 */
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  ActorRole, AgeGroup, BindingConstraint, Day, Gender, NeedStatus, NeedsSpec,
  OwnerRole, ScoreBreakdown, TimeWindow,
} from "shared";

export const schools = sqliteTable("schools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  synthetic: integer("synthetic", { mode: "boolean" }).notNull().default(true),
});

export const community_needs = sqliteTable("community_needs", {
  id: text("id").primaryKey(),
  school_id: text("school_id").notNull().references(() => schools.id),
  age_group: text("age_group").$type<AgeGroup>().notNull(),
  gender: text("gender").$type<Gender>().notNull(),
  participants: integer("participants").notNull(),
  days: text("days", { mode: "json" }).$type<Day[]>().notNull(),
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  needs: text("needs", { mode: "json" }).$type<NeedsSpec>().notNull(),
  weeks: integer("weeks").notNull().default(8),
  status: text("status").$type<NeedStatus>().notNull().default("Draft"),
  extraction_confidence: text("extraction_confidence", { mode: "json" }).$type<Record<string, number> | null>(),
  raw_input: text("raw_input"),
  last_binding_constraint: text("last_binding_constraint", { mode: "json" }).$type<BindingConstraint | null>(),
  created_at: text("created_at").notNull(),
});

export const fields = sqliteTable("fields", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  capacity: integer("capacity").notNull(),
  availability: text("availability", { mode: "json" }).$type<TimeWindow[]>().notNull(),
  cost_per_session: real("cost_per_session").notNull(),
});

export const coaches = sqliteTable("coaches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  credentials: text("credentials", { mode: "json" }).$type<string[]>().notNull(),
  availability: text("availability", { mode: "json" }).$type<TimeWindow[]>().notNull(),
  home_lat: real("home_lat").notNull(),
  home_lng: real("home_lng").notNull(),
  max_travel_km: real("max_travel_km").notNull(),
  cost_per_session: real("cost_per_session").notNull(),
});

export const equipment_kits = sqliteTable("equipment_kits", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  ball_count: integer("ball_count").notNull(),
  available: integer("available", { mode: "boolean" }).notNull().default(true),
});

export const transport_offers = sqliteTable("transport_offers", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  seats: integer("seats").notNull(),
  availability: text("availability", { mode: "json" }).$type<TimeWindow[]>().notNull(),
  cost_per_trip: real("cost_per_trip").notNull(),
});

export const sponsor_budgets = sqliteTable("sponsor_budgets", {
  id: text("id").primaryKey(),
  sponsor: text("sponsor").notNull(),
  remaining: real("remaining").notNull(),
  priorities: text("priorities", { mode: "json" }).$type<string[]>().notNull(),
});

export const opportunity_bundles = sqliteTable("opportunity_bundles", {
  id: text("id").primaryKey(),
  need_id: text("need_id").notNull().references(() => community_needs.id),
  field_id: text("field_id").notNull().references(() => fields.id),
  coach_id: text("coach_id").notNull().references(() => coaches.id),
  kit_id: text("kit_id").references(() => equipment_kits.id),
  transport_id: text("transport_id").references(() => transport_offers.id),
  sponsor_id: text("sponsor_id").notNull().references(() => sponsor_budgets.id),
  weekly_cost: real("weekly_cost").notNull(),
  score: real("score").notNull(),
  score_breakdown: text("score_breakdown", { mode: "json" }).$type<ScoreBreakdown>().notNull(),
  explanation: text("explanation", { mode: "json" }).$type<string[]>().notNull(),
  rank: integer("rank").notNull(),
  created_at: text("created_at").notNull(),
});

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  bundle_id: text("bundle_id").notNull().references(() => opportunity_bundles.id),
  owner_role: text("owner_role").$type<OwnerRole>().notNull(),
  start_date: text("start_date").notNull(),
  weeks: integer("weeks").notNull(),
  created_at: text("created_at").notNull(),
});

export const delivery_evidence = sqliteTable("delivery_evidence", {
  id: text("id").primaryKey(),
  assignment_id: text("assignment_id").notNull().references(() => assignments.id),
  session_date: text("session_date").notNull(),
  attendance_count: integer("attendance_count").notNull(), // counts only — never player names
});

export const audit_events = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actor_role: text("actor_role").$type<ActorRole>().notNull(),
  action: text("action").notNull(),
  entity_id: text("entity_id").notNull(),
  detail: text("detail", { mode: "json" }).$type<unknown>(),
  created_at: text("created_at").notNull(),
});

/** Children first, so deletes never violate foreign keys. */
export const TABLES_CHILD_FIRST = [
  audit_events, delivery_evidence, assignments, opportunity_bundles, community_needs,
  sponsor_budgets, transport_offers, equipment_kits, coaches, fields, schools,
] as const;

/** Plain DDL run at boot — no migration tooling needed for a hackathon. Keep in sync with the tables above. */
export const DDL = `
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
  synthetic INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS community_needs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  age_group TEXT NOT NULL, gender TEXT NOT NULL, participants INTEGER NOT NULL,
  days TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  needs TEXT NOT NULL, weeks INTEGER NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft','Unmet','Matched','Approved','Active','Delivered')),
  extraction_confidence TEXT, raw_input TEXT, last_binding_constraint TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fields (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
  capacity INTEGER NOT NULL, availability TEXT NOT NULL, cost_per_session REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS coaches (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, credentials TEXT NOT NULL, availability TEXT NOT NULL,
  home_lat REAL NOT NULL, home_lng REAL NOT NULL, max_travel_km REAL NOT NULL,
  cost_per_session REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS equipment_kits (
  id TEXT PRIMARY KEY, description TEXT NOT NULL, ball_count INTEGER NOT NULL,
  available INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS transport_offers (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, seats INTEGER NOT NULL,
  availability TEXT NOT NULL, cost_per_trip REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sponsor_budgets (
  id TEXT PRIMARY KEY, sponsor TEXT NOT NULL, remaining REAL NOT NULL, priorities TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS opportunity_bundles (
  id TEXT PRIMARY KEY,
  need_id TEXT NOT NULL REFERENCES community_needs(id),
  field_id TEXT NOT NULL REFERENCES fields(id),
  coach_id TEXT NOT NULL REFERENCES coaches(id),
  kit_id TEXT REFERENCES equipment_kits(id),
  transport_id TEXT REFERENCES transport_offers(id),
  sponsor_id TEXT NOT NULL REFERENCES sponsor_budgets(id),
  weekly_cost REAL NOT NULL, score REAL NOT NULL, score_breakdown TEXT NOT NULL,
  explanation TEXT NOT NULL, rank INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES opportunity_bundles(id),
  owner_role TEXT NOT NULL, start_date TEXT NOT NULL, weeks INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS delivery_evidence (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id),
  session_date TEXT NOT NULL, attendance_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, actor_role TEXT NOT NULL, action TEXT NOT NULL,
  entity_id TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bundles_need ON opportunity_bundles(need_id);
CREATE INDEX IF NOT EXISTS idx_assignments_bundle ON assignments(bundle_id);
CREATE INDEX IF NOT EXISTS idx_evidence_assignment ON delivery_evidence(assignment_id);
`;
