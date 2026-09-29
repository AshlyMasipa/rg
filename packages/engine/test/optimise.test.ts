import { describe, it, expect } from 'vitest';
import { optimisePortfolio, type PortfolioCandidate } from '../src/optimise';

describe('optimisePortfolio', () => {
  it('matches a hand-computed 4-item case', () => {
    // Hand-worked: budget 1000
    // A: cost 400, value 28*8=224
    // B: cost 500, value 20*8=160
    // C: cost 300, value 15*8=120
    // D: cost 600, value 30*8=240
    // Best combo under budget: A+D = cost 1000, value 464
    const candidates: PortfolioCandidate[] = [
      { bundle_id: 'A', cost: 400, participants: 28, sessions: 8 },
      { bundle_id: 'B', cost: 500, participants: 20, sessions: 8 },
      { bundle_id: 'C', cost: 300, participants: 15, sessions: 8 },
      { bundle_id: 'D', cost: 600, participants: 30, sessions: 8 },
    ];
    const result = optimisePortfolio(candidates, 1000);
    expect(result.participant_sessions).toBe(464);
    expect(result.total_cost).toBe(1000);
    expect(new Set(result.selected_bundle_ids)).toEqual(new Set(['A', 'D']));
  });

  it('respects the budget ceiling — never exceeds it', () => {
    const candidates: PortfolioCandidate[] = [
      { bundle_id: 'X', cost: 5000, participants: 40, sessions: 8 },
      { bundle_id: 'Y', cost: 4000, participants: 25, sessions: 8 },
    ];
    const result = optimisePortfolio(candidates, 6000);
    expect(result.total_cost).toBeLessThanOrEqual(6000);
  });

  it('runs 30 items under a R50,000 budget in under 50ms', () => {
    const candidates: PortfolioCandidate[] = Array.from({ length: 30 }, (_, i) => ({
      bundle_id: `bundle-${i}`,
      cost: 500 + i * 137,
      participants: 10 + (i % 15),
      sessions: 8,
    }));
    const start = performance.now();
    optimisePortfolio(candidates, 50000);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});