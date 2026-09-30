import type { SimulateBody, SimulateResponse } from "shared";
import { runSimulate } from "../engine";
import { emit } from "../realtime";
import { newId } from "../lib/ids";
import { loadNeeds, loadWorld } from "../lib/world";

/** What-if re-solve. Pure: never writes to the DB. */
export function simulate(body: SimulateBody): SimulateResponse {
  const allNeeds = loadNeeds();
  const needIds =
    body.need_ids ?? allNeeds.filter((n) => n.status === "Unmet" || n.status === "Matched").map((n) => n.id);
  const run_id = newId("run");

  emit("agent:event", {
    agent: "simulation", step: 0, status: "start", run_id,
    message: `Re-solving ${needIds.length} need${needIds.length === 1 ? "" : "s"} with ${describe(body.overrides)}`,
  });

  const result = runSimulate(needIds, body.overrides, allNeeds, loadWorld());
  const feasible = result.per_need.filter((p) => p.feasible).length;

  emit("agent:event", {
    agent: "simulation", step: 1, status: "done", run_id,
    message: `${feasible}/${needIds.length} feasible · best portfolio R${result.optimal_portfolio.total_cost.toLocaleString("en-ZA")} → ${result.optimal_portfolio.participant_sessions} participant-sessions (${result.computed_ms} ms)`,
  });

  return { ...result, need_ids: needIds };
}

function describe(o: SimulateBody["overrides"]) {
  const parts: string[] = [];
  if (o.remove_coach_ids?.length) parts.push(`${o.remove_coach_ids.length} coach(es) removed`);
  if (o.budget !== undefined) parts.push(`budget R${o.budget.toLocaleString("en-ZA")}`);
  if (o.max_travel_km !== undefined) parts.push(`max travel ${o.max_travel_km} km`);
  return parts.length ? parts.join(", ") : "current resources";
}
