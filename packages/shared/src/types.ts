/**
 * Entity + contract types. snake_case field names match the DB, the API and
 * packages/engine/src/types.ts exactly — the server has a compile-time check
 * (apps/server/src/engine.ts) that fails if the two ever drift apart.
 */
import type {
  ActorRole, AgeGroup, Day, ExtractedNeed, ExtractionErrorCode, Gender,
  NeedStatus, NeedsSpec, OwnerRole, TimeWindow,
} from "./schemas";

// ---------- entities (same shapes as the engine) ----------
export interface School { id: string; name: string; lat: number; lng: number; synthetic: boolean }

export interface CommunityNeed {
  id: string;
  school_id: string;
  age_group: AgeGroup;
  gender: Gender;
  participants: number;
  days: Day[];
  start_time: string;
  end_time: string;
  needs: NeedsSpec;
  weeks: number;
  status: NeedStatus;
  // server-only extras (the engine ignores these):
  extraction_confidence: Record<string, number> | null;
  raw_input: string | null;
  last_binding_constraint: BindingConstraint | null; // set when a solve finds nothing
  created_at: string;
}

export interface Field {
  id: string; name: string; lat: number; lng: number;
  capacity: number; availability: TimeWindow[]; cost_per_session: number;
}

export interface Coach {
  id: string; name: string; credentials: string[]; availability: TimeWindow[];
  home_lat: number; home_lng: number; max_travel_km: number; cost_per_session: number;
}

export interface EquipmentKit { id: string; description: string; ball_count: number; available: boolean }

export interface TransportOffer {
  id: string; provider: string; seats: number; availability: TimeWindow[]; cost_per_trip: number;
}

/** `remaining` goes down when a programme is approved (the spend is committed). */
export interface SponsorBudget { id: string; sponsor: string; remaining: number; priorities: string[] }

export interface ScoreBreakdown { travel: number; capacity: number; priority: number; cost: number }

export interface OpportunityBundle {
  id: string;
  need_id: string;
  field_id: string;
  coach_id: string;
  kit_id: string | null;
  transport_id: string | null;
  sponsor_id: string;
  weekly_cost: number;
  score: number;
  score_breakdown: ScoreBreakdown;
  explanation: string[];
  rank: number;
  created_at: string;
}

export interface Assignment {
  id: string; bundle_id: string; owner_role: OwnerRole;
  start_date: string; weeks: number; created_at: string;
}

export interface DeliveryEvidence {
  id: string; assignment_id: string; session_date: string; attendance_count: number;
}

export interface AuditEvent {
  id: string; actor_role: ActorRole; action: string; entity_id: string;
  detail: unknown; created_at: string;
}

// ---------- engine contract (2.3) ----------
/**
 * An existing approved programme, flattened for double-booking checks.
 * Resolves engine NOTES.md #1: the server joins assignment -> bundle -> need
 * and fills field/coach/days/times before calling solve().
 */
export interface Booking {
  id: string;
  bundle_id: string;
  owner_role: OwnerRole;
  start_date: string;
  weeks: number;
  field_id: string;
  coach_id: string;
  days: Day[];
  start_time: string;
  end_time: string;
}

export interface AllocationPolicy {
  weights: ScoreBreakdown; // travel 30, capacity 20, priority 25, cost 25
}

export interface TraceItem { step: number; check: string; subject: string; status: "pass" | "fail"; message: string }

export interface BindingConstraint { check: string; message: string; sponsor_request: string }

/** A bundle as the engine returns it (the server adds id / need_id / created_at when it persists). */
export type ProposedBundle = Omit<OpportunityBundle, "id" | "need_id" | "created_at">;

// ---------- API responses ----------
export type ExtractionSource = "cache" | "gemini-flash" | "gemini-flash-lite" | "mock" | "rules";

export type ExtractionResult =
  | {
      success: true;
      extracted: ExtractedNeed;
      confidence: Record<string, number>;
      missing_fields: string[];
      source: ExtractionSource;
      raw_ai_output: unknown;
      error: null;
    }
  | {
      success: false;
      extracted: null;
      error: { code: ExtractionErrorCode; message: string };
    };

/** GET /api/state */
export interface WorldState {
  schools: School[]; needs: CommunityNeed[]; fields: Field[]; coaches: Coach[];
  kits: EquipmentKit[]; transport: TransportOffer[]; sponsors: SponsorBudget[];
  bundles: OpportunityBundle[]; assignments: Assignment[]; evidence: DeliveryEvidence[];
}

/** POST /api/needs/:id/solve */
export interface SolveResponse {
  need_id: string;
  run_id: string;
  feasible: boolean;
  bundles: OpportunityBundle[]; // persisted, with real ids — approve these
  binding_constraint: BindingConstraint | null;
  trace: TraceItem[];
}

/** POST /api/simulate — exactly the engine's SimulateResult plus the budget actually used. */
export interface SimulateResponse {
  per_need: { need_id: string; feasible: boolean; top_bundle: ProposedBundle | null }[];
  optimal_portfolio: { selected_bundle_ids: string[]; total_cost: number; participant_sessions: number };
  computed_ms: number;
  need_ids: string[];
}

/** POST /api/bundles/:id/approve */
export interface ApproveResponse {
  assignment: Assignment;
  need: CommunityNeed;
  sponsor: SponsorBudget;
  total_cost: number;
}

/** GET /api/impact — the only numbers the dashboard and the Narrative Agent may use. */
export interface ImpactSummary {
  needs: Record<"draft" | "unmet" | "matched" | "approved" | "active" | "delivered", number>;
  participant_sessions: number;
  sessions_delivered: number;
  programmes_delivered: number;
  programmes_running: number;
  female_participation_pct: number;
  sponsor_spend: Record<string, { sponsor: string; committed: number; remaining: number }>;
  cost_per_participant_session: number | null;
  unmet_requests: { need_id: string; school: string; message: string; sponsor_request: string }[];
  synthetic_data: true;
}

export interface ReportRecord {
  id: string;
  sponsor_id: string | null;
  status: "streaming" | "done" | "failed";
  text: string;
  source: string;
  created_at: string;
}

/** Every non-2xx response. */
export interface ApiError { error: { code: string; message: string; issues?: unknown } }
