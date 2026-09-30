import { z } from "zod";


export const AgeGroupSchema = z.enum(["U12", "U14", "U16", "U18"]);
export const GenderSchema = z.enum(["girls", "boys", "mixed"]);
export const WeekdaySchema = z.enum([
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
]);

/** 24h HH:MM */
export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  message: "expected HH:MM in 24h format",
});

export const NeedsSchema = z.object({
  field: z.boolean(),
  coach: z.boolean(),
  balls: z.number().int().min(0),
  transport: z.boolean(),
});

/* ---------------- the extracted need ---------------- */

export const ExtractedNeedSchema = z.object({
  age_group: AgeGroupSchema,
  gender: GenderSchema,
  participants: z.number().int().min(0),
  days: z.array(WeekdaySchema).min(1),
  start_time: TimeSchema,
  end_time: TimeSchema,
  needs: NeedsSchema,
});

/** One 0-1 score per field the coach may need to check. */
export const ConfidenceSchema = z.object({
  age_group: z.number().min(0).max(1),
  gender: z.number().min(0).max(1),
  participants: z.number().min(0).max(1),
  days: z.number().min(0).max(1),
  start_time: z.number().min(0).max(1),
  end_time: z.number().min(0).max(1),
  needs: z.number().min(0).max(1),
});

/** Anything below this gets flagged amber on the Capture screen. */
export const CONFIDENCE_THRESHOLD = 0.7;

/* ---------------- what a provider hands back ---------------- */

export const ProviderExtractionSchema = z.object({
  extracted: ExtractedNeedSchema,
  confidence: ConfidenceSchema,
  missing_fields: z.array(z.string()),
  raw_ai_output: z.unknown().optional(),
});

/* ---------------- what the API returns ---------------- */

export const ExtractionSourceSchema = z.enum([
  "cache", "gemini-flash", "gemini-flash-lite", "rules", "mock",
]);

export const ExtractionErrorCodeSchema = z.enum([
  "PARSE_FAILED", "LOW_CONFIDENCE", "TIMEOUT", "RATE_LIMITED",
]);

export const ExtractionResponseSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    extracted: ExtractedNeedSchema,
    confidence: ConfidenceSchema,
    missing_fields: z.array(z.string()),
    source: ExtractionSourceSchema,
    raw_ai_output: z.unknown().nullable(),
    error: z.null(),
  }),
  z.object({
    success: z.literal(false),
    extracted: z.null(),
    error: z.object({
      code: ExtractionErrorCodeSchema,
      message: z.string(),
    }),
  }),
]);

/* ---------------- request ---------------- */

export const ExtractRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  school_id: z.string(),
  input_mode: z.enum(["text", "voice"]).default("text"),
  current_date: z.string(),
});

/* ---------------- impact summary (for the narrative agent) ------------- */

export const ImpactSummarySchema = z.object({
  needs: z.object({
    unmet: z.number().int(),
    matched: z.number().int(),
    approved: z.number().int(),
    delivered: z.number().int(),
  }),
  participant_sessions: z.number(),
  programmes_delivered: z.number().int(),
  female_participation_pct: z.number(),
  sponsor_spend: z.record(
    z.string(),
    z.object({ committed: z.number(), remaining: z.number() }),
  ),
  cost_per_participant_session: z.number(),
  unmet_requests: z.array(
    z.object({ need_id: z.string(), sponsor_request: z.string() }),
  ),
});

/* ---------------- inferred types ---------------- */

export type AgeGroup = z.infer<typeof AgeGroupSchema>;
export type Gender = z.infer<typeof GenderSchema>;
export type Weekday = z.infer<typeof WeekdaySchema>;
export type Needs = z.infer<typeof NeedsSchema>;
export type ExtractedNeed = z.infer<typeof ExtractedNeedSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type ProviderExtraction = z.infer<typeof ProviderExtractionSchema>;
export type ExtractionSource = z.infer<typeof ExtractionSourceSchema>;
export type ExtractionErrorCode = z.infer<typeof ExtractionErrorCodeSchema>;
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;
export type ImpactSummary = z.infer<typeof ImpactSummarySchema>;

/** Field names D should render, in display order. */
export const CONFIDENCE_FIELDS = [
  "age_group", "gender", "participants", "days",
  "start_time", "end_time", "needs",
] as const;
