import { solve } from './solve';
import { optimisePortfolio, type PortfolioCandidate } from './optimise';
import type { CommunityNeed, World, AllocationPolicy, BundleCandidate } from './types';

export interface SimulateOverrides {
  remove_coach_ids?: string[];
  budget?: number;
  max_travel_km?: number;
}

export interface PerNeedResult {
  need_id: string;
  feasible: boolean;
  top_bundle: BundleCandidate | null;
}

export interface OptimalPortfolio {
  selected_bundle_ids: string[];
  total_cost: number;
  participant_sessions: number;
}

export interface SimulateResult {
  per_need: PerNeedResult[];
  optimal_portfolio: OptimalPortfolio;
  computed_ms: number;
}

/**
 * Pure function — no DB, no clock beyond performance.now() for computed_ms.
 * Caller (A's /api/simulate route) is responsible for loading `allNeeds`
 * and `world` from SQLite before calling this.
 */
export function simulate(
  needIds: string[],
  overrides: SimulateOverrides | undefined,
  allNeeds: CommunityNeed[],
  world: World,
  policy: AllocationPolicy
): SimulateResult {
  const start = performance.now();

  // Never mutate the caller's world — build an overridden copy instead.
  let effectiveWorld = world;

  if (overrides?.remove_coach_ids?.length) {
    const removed = new Set(overrides.remove_coach_ids);
    effectiveWorld = {
      ...effectiveWorld,
      coaches: effectiveWorld.coaches.filter((c) => !removed.has(c.id)),
    };
  }

  if (overrides?.max_travel_km !== undefined) {
    const cap = overrides.max_travel_km;
    effectiveWorld = {
      ...effectiveWorld,
      coaches: effectiveWorld.coaches.map((c) => ({
        ...c,
        max_travel_km: Math.min(c.max_travel_km, cap),
      })),
    };
  }

  const perNeed: PerNeedResult[] = [];
  const portfolioCandidates: PortfolioCandidate[] = [];

  for (const needId of needIds) {
    const need = allNeeds.find((n) => n.id === needId);
    if (!need) {
      perNeed.push({ need_id: needId, feasible: false, top_bundle: null });
      continue;
    }

    const result = solve({ need, world: effectiveWorld, policy });
    const topBundle = result.bundles[0] ?? null;
    perNeed.push({ need_id: needId, feasible: result.feasible, top_bundle: topBundle });

    if (topBundle) {
      // ASSUMPTION (see NOTES.md #3): "sessions" for the knapsack value
      // (participants * sessions) is need.weeks * need.days.length — i.e.
      // total sessions delivered over the whole program, not per week.
      // The contract doesn't define this explicitly.
      const sessions = need.weeks * need.days.length;

      // Bundle IDs don't exist yet at this stage (the pure engine never
      // persists), so synthesize one scoped to the need. A will replace
      // this with the real opportunity_bundles.id once bundles are persisted.
      portfolioCandidates.push({
        bundle_id: `${needId}-top`,
        cost: topBundle.weekly_cost * need.weeks,
        participants: need.participants,
        sessions,
      });
    }
  }

  // No budget override = no cap: fund everything by defaulting the budget
  // to the sum of all candidate costs.
  const budget =
    overrides?.budget ?? portfolioCandidates.reduce((sum, c) => sum + c.cost, 0);

  const optimalPortfolio = optimisePortfolio(portfolioCandidates, budget);
  const computedMs = Math.round((performance.now() - start) * 100) / 100;

  return { per_need: perNeed, optimal_portfolio: optimalPortfolio, computed_ms: computedMs };
}