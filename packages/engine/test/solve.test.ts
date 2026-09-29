import { describe, it, expect } from 'vitest';
import { solve } from '../src/solve';
import type { CommunityNeed, World, AllocationPolicy, Day } from '../src/types';
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
const unmatchableNeed: CommunityNeed = seed.needs.unmatchable as any;

describe('hard constraints — one failing test per check (H0-H3 baseline)', () => {
  it('rejects a coach without the safeguarding credential (Dlamini)', () => {
    const result = solve({ need: demoNeed, world, policy });
    const dlaminiUsed = result.bundles.some(b => b.coach_id === 'coach-dlamini');
    expect(dlaminiUsed).toBe(false);
  });

  it('rejects a coach not available at the need\'s day/time', () => {
    // Mokoena is only free wed/fri; demo need is tue
    const result = solve({ need: demoNeed, world, policy });
    const mokoenaUsed = result.bundles.some(b => b.coach_id === 'coach-mokoena');
    expect(mokoenaUsed).toBe(false);
  });

  it('rejects a field with capacity below the need\'s participant count', () => {
    const tinyField = { ...world.fields[0], id: 'field-tiny', capacity: 5 };
    const result = solve({
      need: demoNeed,
      world: { ...world, fields: [tinyField] },
      policy,
    });
    expect(result.feasible).toBe(false);
  });

  it('rejects a kit with fewer balls than needed', () => {
    const emptyKit = { ...world.kits[1], id: 'kit-empty', ball_count: 0 };
    const result = solve({
      need: demoNeed,
      world: { ...world, kits: [emptyKit] },
      policy,
    });
    expect(result.feasible).toBe(false);
  });

  it('rejects when total cost over need.weeks exceeds sponsor remaining', () => {
    const brokeSponsor = { ...world.sponsors[0], id: 'sponsor-broke', remaining: 10 };
    const result = solve({
      need: demoNeed,
      world: { ...world, sponsors: [brokeSponsor] },
      policy,
    });
    expect(result.feasible).toBe(false);
  });

  it('rejects a bundle that double-books a coach against existing bookings', () => {
    const booking = {
      id: 'assign-1', bundle_id: 'bundle-existing', owner_role: 'coordinator' as const,
      start_date: '2026-09-01', weeks: 8,
      field_id: 'field-orlando', coach_id: 'coach-naidoo',
      days: ['tue' as const], start_time: '15:00', end_time: '17:00',
    };
    const result = solve({ need: demoNeed, world: { ...world, bookings: [booking] }, policy });
    const naidooReused = result.bundles.some(b => b.coach_id === 'coach-naidoo');
    expect(naidooReused).toBe(false);
  });

  it('rejects travel beyond max_travel_km without a transport offer', () => {
    const farCoach = { ...world.coaches[0], id: 'coach-far', home_lat: -27.5, home_lng: 29.5, max_travel_km: 2 };
    const result = solve({
      need: demoNeed,
      world: { ...world, coaches: [farCoach], transport: [] },
      policy,
    });
    const farCoachUsed = result.bundles.some(b => b.coach_id === 'coach-far');
    expect(farCoachUsed).toBe(false);
  });

  it('returns the seeded unmatchable need as infeasible with a binding constraint', () => {
    const result = solve({ need: unmatchableNeed, world, policy });
    expect(result.feasible).toBe(false);
    expect(result.binding_constraint).not.toBeNull();
  });
});

describe('edge cases (balls:0, tie-breaking, multi-day)', () => {
  it('balls:0 needs no kit at all, even with zero kits available', () => {
    const noBallsNeed = { ...demoNeed, needs: { ...demoNeed.needs, balls: 0 } };
    const result = solve({ need: noBallsNeed, world: { ...world, kits: [] }, policy });
    expect(result.feasible).toBe(true);
    expect(result.bundles[0].kit_id).toBeNull();
  });

  it('breaks ties deterministically by cost, then field_id, then coach_id', () => {
    // Two fields, same cost/capacity, one coach — forces identical scores
    const tiedFieldB = { ...world.fields[0], id: 'field-aaa-tied', name: 'Tied Field A' };
    const tiedFieldA = { ...world.fields[0], id: 'field-zzz-tied', name: 'Tied Field Z' };
    const result = solve({
      need: demoNeed,
      world: { ...world, fields: [tiedFieldA, tiedFieldB] },
      policy,
    });
    // both fields identical except id -> tie-break must pick field-aaa-tied first (alphabetical)
    expect(result.bundles[0].field_id).toBe('field-aaa-tied');
  });

  it('requires field, coach and transport to cover every day for a multi-day need', () => {
    const multiDayNeed = { ...demoNeed, days: ['tue', 'thu'] as Day[] };
    const result = solve({ need: multiDayNeed, world, policy });
    expect(result.feasible).toBe(false);
  });

  it('succeeds for a multi-day need when field and coach cover both days', () => {
    const multiDayNeed = { ...demoNeed, days: ['tue', 'thu'] as Day[] };
    const flexField = {
      ...world.fields[0],
      id: 'field-flex',
      availability: [
        { day: 'tue' as const, start: '14:00', end: '18:00' },
        { day: 'thu' as const, start: '14:00', end: '18:00' },
      ],
    };
    const flexCoach = {
      ...world.coaches[0],
      id: 'coach-flex',
      availability: [
        { day: 'tue' as const, start: '15:00', end: '17:00' },
        { day: 'thu' as const, start: '15:00', end: '17:00' },
      ],
    };
    const result = solve({
      need: multiDayNeed,
      world: { ...world, fields: [flexField], coaches: [flexCoach] },
      policy,
    });
    expect(result.feasible).toBe(true);
    // cost should reflect 2 sessions/week, not 1
    expect(result.bundles[0].weekly_cost).toBe(
      (flexField.cost_per_session + flexCoach.cost_per_session) * 2
    );
  });
});