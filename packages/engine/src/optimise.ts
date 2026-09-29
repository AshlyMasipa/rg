export interface PortfolioCandidate {
  bundle_id: string;
  cost: number;
  participants: number;
  sessions: number;
}

export interface PortfolioResult {
  selected_bundle_ids: string[];
  total_cost: number;
  participant_sessions: number;
}

const UNIT = 100; // costs rounded up to R100 units per spec

export function optimisePortfolio(
  candidates: PortfolioCandidate[],
  budget: number
): PortfolioResult {
  const units = candidates.map((c) => Math.ceil(c.cost / UNIT));
  const values = candidates.map((c) => c.participants * c.sessions);
  const capacityUnits = Math.floor(budget / UNIT);

  // dp[w] = best value achievable with budget w units
  const dp: number[] = new Array(capacityUnits + 1).fill(0);
  // keep[i][w] = true if item i is used in the optimal solution for budget w
  const keep: boolean[][] = candidates.map(() => new Array(capacityUnits + 1).fill(false));

  for (let i = 0; i < candidates.length; i++) {
    const w = units[i];
    const v = values[i];
    for (let cap = capacityUnits; cap >= w; cap--) {
      const withItem = dp[cap - w] + v;
      if (withItem > dp[cap]) {
        dp[cap] = withItem;
        keep[i][cap] = true;
      }
    }
  }

  // backtrack to find selected items
  const selected: string[] = [];
  let cap = capacityUnits;
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (keep[i][cap]) {
      selected.push(candidates[i].bundle_id);
      cap -= units[i];
    }
  }

  const selectedSet = new Set(selected);
  const totalCost = candidates
    .filter((c) => selectedSet.has(c.bundle_id))
    .reduce((sum, c) => sum + c.cost, 0);
  const participantSessions = candidates
    .filter((c) => selectedSet.has(c.bundle_id))
    .reduce((sum, c) => sum + c.participants * c.sessions, 0);

  return {
    selected_bundle_ids: selected,
    total_cost: totalCost,
    participant_sessions: participantSessions,
  };
}