// Mirrors packages/shared once A commits it — keep field names identical
// so swapping imports later is a one-line change.

export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type AgeGroup = 'U12' | 'U14' | 'U16' | 'U18';
export type Gender = 'girls' | 'boys' | 'mixed';
export type NeedStatus = 'Draft' | 'Unmet' | 'Matched' | 'Approved' | 'Active' | 'Delivered';

export interface TimeWindow {
  day: Day;
  start: string; // 'HH:MM'
  end: string;   // 'HH:MM'
}

export interface School {
  id: string;
  name: string;
  lat: number;
  lng: number;
  synthetic: boolean;
}

export interface CommunityNeed {
  id: string;
  school_id: string;
  age_group: AgeGroup;
  gender: Gender;
  participants: number;
  days: Day[];
  start_time: string;
  end_time: string;
  needs: {
    field: boolean;
    coach: boolean;
    balls: number;
    transport: boolean;
  };
  weeks: number;
  status: NeedStatus;
}

export interface Field {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  availability: TimeWindow[];
  cost_per_session: number;
}

export interface Coach {
  id: string;
  name: string;
  credentials: string[]; // e.g. ["U16", "safeguarding", "boksmart"]
  availability: TimeWindow[];
  home_lat: number;
  home_lng: number;
  max_travel_km: number;
  cost_per_session: number;
}

export interface EquipmentKit {
  id: string;
  description: string;
  ball_count: number;
  available: boolean;
}

export interface TransportOffer {
  id: string;
  provider: string;
  seats: number;
  availability: TimeWindow[];
  cost_per_trip: number;
}

export interface SponsorBudget {
  id: string;
  sponsor: string;
  remaining: number;
  priorities: string[]; // e.g. ["female-participation"]
}

// NOTE FOR A: this only has bundle_id/dates, not field_id/coach_id/day/time.
// To check double-booking, the engine needs to know which field+coach+timeslot
// each existing Assignment occupies. Either (a) pass the resolved
// OpportunityBundle alongside each Assignment, or (b) flatten field_id/coach_id
// onto Assignment itself. Flag this with A before H10 — don't guess.
export interface Assignment {
  id: string;
  bundle_id: string;
  owner_role: 'coordinator' | 'coach';
  start_date: string;
  weeks: number;
  // temporary until clarified — remove once real contract confirms:
  field_id?: string;
  coach_id?: string;
  days?: Day[];
  start_time?: string;
  end_time?: string;
}

export interface AllocationPolicy {
  weights: {
    travel: number;   // 30
    capacity: number; // 20
    priority: number; // 25
    cost: number;     // 25
  };
}

export interface World {
  schools: School[];
  fields: Field[];
  coaches: Coach[];
  kits: EquipmentKit[];
  transport: TransportOffer[];
  sponsors: SponsorBudget[];
  bookings: Assignment[];
}

export interface SolveInput {
  need: CommunityNeed;
  world: World;
  policy: AllocationPolicy;
}

export interface TraceItem {
  step: number;
  check: string;
  subject: string;
  status: 'pass' | 'fail';
  message: string;
}

export interface ScoreBreakdown {
  travel: number;
  capacity: number;
  priority: number;
  cost: number;
}

export interface BundleCandidate {
  rank: number;
  field_id: string;
  coach_id: string;
  kit_id: string | null;
  transport_id: string | null;
  sponsor_id: string;
  weekly_cost: number;
  score: number;
  score_breakdown: ScoreBreakdown;
  explanation: string[];
}

export interface BindingConstraint {
  check: string;
  message: string;
  sponsor_request: string;
}

export interface SolveResult {
  feasible: boolean;
  bundles: BundleCandidate[];
  binding_constraint: BindingConstraint | null;
  trace: TraceItem[];
}