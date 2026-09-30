// Public entry point for the engine package (added by Person A so the server
// can `import { solve, simulate, optimisePortfolio } from "engine"`).
// Nothing here changes behaviour — it only re-exports B's modules.
export { solve } from './solve';
export { optimisePortfolio } from './optimise';
export type { PortfolioCandidate, PortfolioResult } from './optimise';
export { simulate } from './simulate';
export type {
  SimulateOverrides,
  PerNeedResult,
  OptimalPortfolio,
  SimulateResult,
} from './simulate';
export type * from './types';
