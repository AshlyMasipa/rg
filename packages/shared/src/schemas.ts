/**
 * Zod schemas for everything that crosses a boundary (HTTP bodies, AI output).
 * TS types for these are inferred below. Entity types live in ./types.ts and
 * use exactly the same field names as packages/engine/src/types.ts.
 */
import { z } from "zod";

// ---------- primitives ----------
export const Day = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)");
export const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Not a real date");
export const TimeWindow = z.object({ day: Day, start: HHMM, end: HHMM });

export const NeedStatus = z.enum(["Draft", "Unmet", "Matched", "Approved", "Active", "Delivered"]);
export const AgeGroup = z.enum(["U12", "U14", "U16", "U18"]);
export const Gender = z.enum(["girls", "boys", "mixed"]);
export const ActorRole = z.enum(["coach", "coordinator", "system"]);
export const OwnerRole = z.enum(["coordinator", "coach"]);
export const DemoState = z.enum(["fresh", "eight-weeks-later"]);

export const NeedsSpec = z.object({
  field: z.boolean(),
  coach: z.boolean(),
  balls: z.number().int().min(0),
  transport: z.boolean(),
});

// ---------- extraction (2.1 / 2.2) ----------
export const ExtractRequest = z.object({
  text: z.string().trim().min(3).max(2000),
  school_id: z.string().min(1),
  input_mode: z.enum(["text", "voice"]).default("text"),
  current_date: ISODate.optional(),
});

/** The structured need the Extraction Agent must return. Person C validates model output with this. */
export const ExtractedNeed = z
  .object({
    age_group: AgeGroup,
    gender: Gender,
    participants: z.number().int().min(0).max(500),
    days: z.array(Day).min(1),
    start_time: HHMM,
    end_time: HHMM,
    needs: NeedsSpec,
  })
  .refine((n) => n.start_time < n.end_time, { message: "start_time must be before end_time", path: ["end_time"] });

export const ExtractionErrorCode = z.enum(["PARSE_FAILED", "LOW_CONFIDENCE", "TIMEOUT", "RATE_LIMITED"]);

// ---------- needs ----------
/** Body for POST /api/needs: the (coach-confirmed) extracted need + where it's from. */
export const CreateNeedBody = z
  .object({
    school_id: z.string().min(1),
    age_group: AgeGroup,
    gender: Gender,
    participants: z.number().int().min(1).max(500),
    days: z.array(Day).min(1),
    start_time: HHMM,
    end_time: HHMM,
    needs: NeedsSpec,
    weeks: z.number().int().min(1).max(52).default(8),
    raw_input: z.string().max(2000).optional(),
    extraction_confidence: z.record(z.string(), z.number().min(0).max(1)).optional(),
  })
  .refine((n) => n.start_time < n.end_time, { message: "start_time must be before end_time", path: ["end_time"] });

// ---------- approve / evidence ----------
export const ApproveBody = z.object({
  owner_role: OwnerRole.default("coordinator"),
  start_date: ISODate.optional(), // defaults to today on the server
});

export const EvidenceBody = z.object({
  session_date: ISODate,
  attendance_count: z.number().int().min(0).max(500), // counts only, never names
});

// ---------- simulate (2.4) — matches engine SimulateOverrides exactly ----------
export const SimulateBody = z.object({
  need_ids: z.array(z.string()).optional(), // default: every Unmet + Matched need
  overrides: z
    .object({
      remove_coach_ids: z.array(z.string()).optional(),
      budget: z.number().min(0).optional(),
      max_travel_km: z.number().min(0).optional(),
    })
    .default({}),
});

// ---------- reports / demo ----------
export const GenerateReportBody = z.object({ sponsor_id: z.string().optional() });
export const DemoResetBody = z.object({ state: DemoState.default("fresh") });

// ---------- inferred types ----------
export type Day = z.infer<typeof Day>;
export type TimeWindow = z.infer<typeof TimeWindow>;
export type NeedStatus = z.infer<typeof NeedStatus>;
export type AgeGroup = z.infer<typeof AgeGroup>;
export type Gender = z.infer<typeof Gender>;
export type ActorRole = z.infer<typeof ActorRole>;
export type OwnerRole = z.infer<typeof OwnerRole>;
export type DemoState = z.infer<typeof DemoState>;
export type NeedsSpec = z.infer<typeof NeedsSpec>;
export type ExtractRequest = z.infer<typeof ExtractRequest>;
export type ExtractedNeed = z.infer<typeof ExtractedNeed>;
export type ExtractionErrorCode = z.infer<typeof ExtractionErrorCode>;
export type CreateNeedBody = z.infer<typeof CreateNeedBody>;
export type ApproveBody = z.infer<typeof ApproveBody>;
export type EvidenceBody = z.infer<typeof EvidenceBody>;
export type SimulateBody = z.infer<typeof SimulateBody>;
export type GenerateReportBody = z.infer<typeof GenerateReportBody>;
