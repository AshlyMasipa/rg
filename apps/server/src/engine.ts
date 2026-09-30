/**
 * ADAPTER between the server and Person B's engine (packages/engine).
 * Routes and services import from here, never from "engine" directly, so if
 * B changes a function name or shape this is the only file to touch.
 *
 * The type checks at the bottom make `pnpm typecheck` FAIL if the shared
 * contract and B's engine types ever drift apart.
 */
import * as engine from "engine";
import type {
  AllocationPolicy, Booking, BindingConstraint, CommunityNeed, Field, Coach, EquipmentKit,
  ProposedBundle, School, SimulateBody, SponsorBudget, TraceItem, TransportOffer,
} from "shared";

export interface EngineWorld {
  schools: School[];
  fields: Field[];
  coaches: Coach[];
  kits: EquipmentKit[];
  transport: TransportOffer[];
  sponsors: SponsorBudget[];
  bookings: Booking[];
}

export interface EngineSolveResult {
  feasible: boolean;
  bundles: ProposedBundle[];
  binding_constraint: BindingConstraint | null;
  trace: TraceItem[];
}

export const DEFAULT_POLICY: AllocationPolicy = {
  weights: { travel: 30, capacity: 20, priority: 25, cost: 25 },
};

export function runSolve(need: CommunityNeed, world: EngineWorld, policy = DEFAULT_POLICY): EngineSolveResult {
  return engine.solve({ need, world, policy });
}

export function runSimulate(
  needIds: string[],
  overrides: SimulateBody["overrides"],
  allNeeds: CommunityNeed[],
  world: EngineWorld,
  policy = DEFAULT_POLICY,
) {
  return engine.simulate(needIds, overrides, allNeeds, world, policy);
}

// ---------------------------------------------------------------------------
// Compile-time contract checks (no runtime cost). If one of these errors,
// shared/src/types.ts and engine/src/types.ts have drifted — fix before merging.
// ---------------------------------------------------------------------------
type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;

export type _Checks = [
  // what we pass in must be accepted by the engine
  Assert<Extends<CommunityNeed, engine.CommunityNeed>>,
  Assert<Extends<EngineWorld, engine.World>>,
  Assert<Extends<AllocationPolicy, engine.AllocationPolicy>>,
  // what the engine returns must fit what we persist / send to the frontend
  Assert<Extends<engine.SolveResult, EngineSolveResult>>,
  Assert<Extends<engine.BundleCandidate, ProposedBundle>>,
  Assert<Extends<engine.TraceItem, TraceItem>>,
  Assert<Extends<SimulateBody["overrides"], engine.SimulateOverrides>>,
];
