/**
 * Budget simulator (stretch feature from the brief, contract 2.4).
 * "With R20,000, which combination of programmes creates the most
 * participant-sessions?" Re-solves every open need on each change and runs
 * the 0/1 knapsack. Pure: never writes to the DB. computed_ms proves it's real.
 */
import { motion } from "motion/react";
import { CheckCircle2, CircleSlash, Gauge, RotateCcw, Timer, UserX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SimulateResponse } from "shared";
import { ErrorNote, PageHeader, Skeleton } from "../components/bits";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { api } from "../lib/api";
import { useLookups, useWorld } from "../lib/store";
import { cn, needTitle, needWhen, num, rand } from "../lib/utils";

export function Simulator() {
  const { state, resetCount } = useWorld();
  const L = useLookups();
  const [removed, setRemoved] = useState<string[]>([]);
  const [budgetOn, setBudgetOn] = useState(false);
  const [budget, setBudget] = useState(20000);
  const [travelOn, setTravelOn] = useState(false);
  const [travel, setTravel] = useState(15);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [baseline, setBaseline] = useState<SimulateResponse | null>(null);
  const [roundTrip, setRoundTrip] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const openCount = state?.needs.filter((n) => n.status === "Unmet" || n.status === "Matched").length ?? 0;
  const stateKey = state ? state.needs.map((n) => n.status).join() + state.sponsors.map((s) => s.remaining).join() : "";

  // Baseline = current resources, no overrides.
  useEffect(() => {
    if (!state) return;
    api.simulate({ overrides: {} }).then(setBaseline).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, resetCount]);

  useEffect(() => {
    if (!state) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const t0 = performance.now();
      try {
        const r = await api.simulate({
          overrides: {
            ...(removed.length ? { remove_coach_ids: removed } : {}),
            ...(budgetOn ? { budget } : {}),
            ...(travelOn ? { max_travel_km: travel } : {}),
          },
        });
        if (my !== seq.current) return;
        setResult(r); setRoundTrip(Math.round(performance.now() - t0)); setError(null);
      } catch (e) {
        if (my === seq.current) setError((e as Error).message);
      }
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removed.join(), budgetOn, budget, travelOn, travel, stateKey, resetCount]);

  const selected = useMemo(() => new Set(result?.optimal_portfolio.selected_bundle_ids ?? []), [result]);

  if (!state) return <Skeleton className="h-96" />;
  const delta = result && baseline ? result.optimal_portfolio.participant_sessions - baseline.optimal_portfolio.participant_sessions : 0;
  const reset = () => { setRemoved([]); setBudgetOn(false); setBudget(20000); setTravelOn(false); setTravel(15); };

  return (
    <div className="space-y-4">
      <PageHeader
        title="What-if simulator"
        subtitle={`Re-solves all ${openCount} open request${openCount === 1 ? "" : "s"} and picks the portfolio with the most participant-sessions. Nothing is saved.`}
        right={<Button variant="outline" onClick={reset}><RotateCcw /> Reset</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* ---------- controls ---------- */}
        <Card>
          <CardHeader><CardTitle>Change the world</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Coaches available</p>
              <div className="space-y-1.5">
                {state.coaches.map((c) => {
                  const out = removed.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setRemoved((r) => (out ? r.filter((x) => x !== c.id) : [...r, c.id]))}
                      aria-pressed={!out}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                        out ? "border-dashed border-line bg-canvas text-ink-3 line-through" : "border-line bg-surface",
                      )}
                    >
                      <span><b>Coach {c.name}</b> <span className="text-xs text-ink-3">· {c.credentials.join(", ")}</span></span>
                      {out ? <UserX className="size-4" /> : <CheckCircle2 className="size-4 text-good" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-3">
                Sponsor budget cap
                <input type="checkbox" checked={budgetOn} onChange={(e) => setBudgetOn(e.target.checked)} className="size-4 accent-[#0d4f3c]" />
              </label>
              <input
                type="range" min={0} max={40000} step={500} value={budget} disabled={!budgetOn}
                onChange={(e) => { setBudget(Number(e.target.value)); setBudgetOn(true); }}
                className="w-full accent-[#0d4f3c]" aria-label="Budget"
              />
              <p className="tabular text-sm font-semibold">{budgetOn ? rand(budget) : "No cap (fund everything feasible)"}</p>
              <div className="mt-1 flex gap-1.5">
                {[10000, 20000].map((b) => (
                  <button key={b} onClick={() => { setBudget(b); setBudgetOn(true); }} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink-2 hover:border-brand-100">{rand(b)}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-3">
                Max coach travel
                <input type="checkbox" checked={travelOn} onChange={(e) => setTravelOn(e.target.checked)} className="size-4 accent-[#0d4f3c]" />
              </label>
              <input
                type="range" min={1} max={20} step={1} value={travel} disabled={!travelOn}
                onChange={(e) => { setTravel(Number(e.target.value)); setTravelOn(true); }}
                className="w-full accent-[#0d4f3c]" aria-label="Max travel km"
              />
              <p className="tabular text-sm font-semibold">{travelOn ? `${travel} km` : "Each coach’s own limit"}</p>
            </div>
          </CardContent>
        </Card>

        {/* ---------- results ---------- */}
        <div className="space-y-4">
          <ErrorNote>{error}</ErrorNote>
          {!result ? <Skeleton className="h-64" /> : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="bg-brand-700 p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold">Best portfolio</p>
                  <motion.p key={result.optimal_portfolio.participant_sessions} initial={{ scale: 0.9, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} className="tabular mt-1 text-4xl font-extrabold">
                    {num(result.optimal_portfolio.participant_sessions)}
                  </motion.p>
                  <p className="text-sm text-white/80">participant-sessions
                    {baseline && delta !== 0 && <span className={cn("ml-1 font-semibold", delta < 0 ? "text-[#ffb4b4]" : "text-gold")}>({delta > 0 ? "+" : ""}{num(delta)} vs now)</span>}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Total cost</p>
                  <p className="tabular mt-1 text-3xl font-bold">{rand(result.optimal_portfolio.total_cost)}</p>
                  <p className="text-sm text-ink-2">{result.optimal_portfolio.selected_bundle_ids.length} of {result.per_need.length} programmes funded</p>
                </Card>
                <Card className="p-4">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3"><Timer className="size-3.5" /> Re-solved in</p>
                  <motion.p key={result.computed_ms} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} className="tabular mt-1 text-3xl font-bold">{result.computed_ms} ms</motion.p>
                  <p className="text-sm text-ink-2">engine time{roundTrip !== null && ` · ${roundTrip} ms round trip`}</p>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="size-4 text-brand-600" /> Every open request</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {result.per_need.length === 0 && <p className="text-sm text-ink-3">No open requests to simulate. Submit one from the coach’s phone, or reset the demo.</p>}
                  {result.per_need.map((p) => {
                    const need = L.needs.get(p.need_id);
                    const inPortfolio = selected.has(`${p.need_id}-top`);
                    const b = p.top_bundle;
                    return (
                      <motion.div key={p.need_id} layout className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5", inPortfolio ? "border-brand-500 bg-brand-50" : "border-line")}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{need ? L.nameOf(need.school_id) : p.need_id}</p>
                          <p className="text-xs text-ink-2">{need && `${needTitle(need)} · ${needWhen(need)}`}</p>
                        </div>
                        <div className="text-right text-sm">
                          {b ? (
                            <>
                              <p>{L.nameOf(b.field_id)} + {L.nameOf(b.coach_id)} · <span className="tabular">{rand(b.weekly_cost * (need?.weeks ?? 8))}</span></p>
                              {inPortfolio ? <Badge variant="good"><CheckCircle2 /> Funded · {num((need?.participants ?? 0) * (need?.weeks ?? 0) * (need?.days.length ?? 0))} p-s</Badge> : <Badge variant="warn">Feasible, over budget</Badge>}
                            </>
                          ) : (
                            <Badge variant="bad"><CircleSlash /> No safe match</Badge>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </CardContent>
              </Card>
              <p className="text-xs text-ink-3">Portfolio = 0/1 knapsack over each request’s best bundle (value = players × sessions, weight = total cost, R100 units).</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
