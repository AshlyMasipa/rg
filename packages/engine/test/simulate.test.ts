import { describe, it, expect } from 'vitest';
import { simulate } from '../src/simulate';
import type { CommunityNeed, World, AllocationPolicy } from '../src/types';
import seed from '../fixtures/seed.json';

const policy: AllocationPolicy = {
  weights: { travel: 30, capacity: 20, priority: 25, cost: 25 },
};

const world: World = {
  schools: seed.schools as any,
  fields: seed.fields as any,
  coaches: seed.coaches as any,
  kits: seed.kits as any,
  transport: seed.transport as any,
  sponsors: seed.sponsors as any,
  bookings: [],
};

const demoNeed: CommunityNeed = seed.needs.demo as any;

const secondNeed: CommunityNeed = {
  id: 'need-2',
  school_id: 'school-lerato',
  age_group: 'U16',
  gender: 'girls',
  participants: 22,
  days: ['tue'],
  start_time: '15:00',
  end_time: '17:00',
  needs: { field: true, coach: true, balls: 6, transport: false },
  weeks: 8,
  status: 'Unmet',
};

const allNeeds = [demoNeed, secondNeed];

describe('simulate', () => {
  it('returns feasible results for both needs with no overrides', () => {
    const result = simulate(['need-1', 'need-2'], undefined, allNeeds, world, policy);
    expect(result.per_need).toHaveLength(2);
    expect(result.per_need.every((n) => n.feasible)).toBe(true);
    expect(result.optimal_portfolio.selected_bundle_ids.length).toBeGreaterThan(0);
    expect(result.computed_ms).toBeGreaterThanOrEqual(0);
  });

  it('removing the only qualified coach makes a need infeasible', () => {
    const result = simulate(
      ['need-1'],
      { remove_coach_ids: ['coach-naidoo'] },
      allNeeds,
      world,
      policy
    );
    expect(result.per_need[0].feasible).toBe(false);
    expect(result.per_need[0].top_bundle).toBeNull();
  });

  it('shrinking max_travel_km can push a feasible need into infeasible', () => {
    const baseline = simulate(['need-1'], undefined, allNeeds, world, policy);
    const shrunk = simulate(['need-1'], { max_travel_km: 0.01 }, allNeeds, world, policy);
    expect(baseline.per_need[0].feasible).toBe(true);
    expect(shrunk.per_need[0].feasible).toBe(false);
  });

  it('respects an explicit budget override in the portfolio optimizer', () => {
    const result = simulate(['need-1', 'need-2'], { budget: 1 }, allNeeds, world, policy);
    expect(result.optimal_portfolio.total_cost).toBe(0);
    expect(result.optimal_portfolio.selected_bundle_ids).toHaveLength(0);
  });

  it('an unknown need_id is reported infeasible rather than throwing', () => {
    const result = simulate(['does-not-exist'], undefined, allNeeds, world, policy);
    expect(result.per_need[0]).toEqual({
      need_id: 'does-not-exist',
      feasible: false,
      top_bundle: null,
    });
  });
});