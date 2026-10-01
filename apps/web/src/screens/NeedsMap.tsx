/**
 * Screen 2 — Needs & capacity map (coordinator, laptop).
 * Queue of requests · live map · Agent Timeline. Solving a need animates the
 * markers from the constraint agent's paced trace, then draws the best bundle.
 */
import { motion } from "motion/react";
import { ArrowRight, Loader2, Radar, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AgentTimeline } from "../components/AgentTimeline";
import { ErrorNote, PageHeader, Skeleton } from "../components/bits";
import { markerStates, SolveMap } from "../components/SolveMap";
import { StatusPill } from "../components/status";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle } from "../components/ui/card";
import { useLookups, useWorld } from "../lib/store";
import { useSolve } from "../lib/useSolve";
import { cn, needTitle, needWants, needWhen, rand } from "../lib/utils";

const ORDER = { Unmet: 0, Matched: 1, Draft: 2, Approved: 3, Active: 4, Delivered: 5 } as const;

export function NeedsMap() {
  const { state, events } = useWorld();
  const L = useLookups();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("need"));

  const needs = useMemo(
    () => [...(state?.needs ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.created_at.localeCompare(a.created_at)),
    [state?.needs],
  );

  // Default selection: the newest open request. A request that arrives while
  // this screen is open (the coach just pressed Confirm) is selected at once.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!needs.length) return;
    const ids = new Set(needs.map((n) => n.id));
    const prev = known.current;
    known.current = ids;
    const arrived = prev ? needs.filter((n) => !prev.has(n.id)) : [];
    if (arrived.length) { setSelected(arrived[arrived.length - 1].id); return; }
    if (selected && ids.has(selected)) return;
    const open = needs.filter((n) => n.status === "Unmet" || n.status === "Matched").sort((a, b) => b.created_at.localeCompare(a.created_at));
    setSelected((open[0] ?? needs[0]).id);
  }, [needs, selected]);

  const need = needs.find((n) => n.id === selected) ?? null;
  const { runId, running, done, solve, error } = useSolve(need?.id);
  const bundles = useMemo(
    () => (state?.bundles ?? []).filter((b) => b.need_id === need?.id).sort((a, b) => a.rank - b.rank),
    [state?.bundles, need?.id],
  );
  const best = bundles[0] ?? null;
  const showRoute = !!best && (!runId || done);
  const markers = useMemo(() => markerStates(events, runId, showRoute ? best : null), [events, runId, best, showRoute]);

  if (!state) return <Skeleton className="h-[70vh]" />;

  const select = (id: string) => { setSelected(id); setParams({ need: id }, { replace: true }); };
  const canSolve = need && (need.status === "Unmet" || need.status === "Matched");

  return (
    <div>
      <PageHeader
        title="Gauteng needs & capacity"
        subtitle={`${state.schools.length} schools · ${state.fields.length} fields · ${state.coaches.length} coaches · ${state.kits.length} kits · ${state.transport.length} transport offers · ${state.sponsors.length} sponsors`}
      />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_340px]">
        {/* ---------- queue ---------- */}
        <div className="space-y-3">
          <Card>
            <CardHeader><CardTitle>Requests</CardTitle></CardHeader>
            <ul className="max-h-[42vh] space-y-1 overflow-y-auto px-2 pt-1 pb-2 lg:max-h-none">
              {needs.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => select(n.id)}
                    className={cn(
                      "w-full rounded-xl border-2 px-3 py-2 text-left transition-colors",
                      n.id === need?.id ? "border-brand-500 bg-brand-50" : "border-transparent hover:bg-canvas",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{L.nameOf(n.school_id)}</span>
                      <StatusPill status={n.status} />
                    </div>
                    <div className="text-xs text-ink-2">{needTitle(n)} · {needWhen(n)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {need && (
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Selected</p>
              <p className="mt-1 font-bold">{L.nameOf(need.school_id)}</p>
              <p className="text-sm text-ink-2">{needTitle(need)} · {needWhen(need)}</p>
              <p className="text-sm text-ink-2">Needs {needWants(need)} · {need.weeks} weeks</p>
              {need.raw_input && <blockquote className="mt-2 border-l-2 border-brand-100 pl-2 text-[13px] italic text-ink-2">“{need.raw_input}”</blockquote>}

              {canSolve && (
                <Button className="mt-3 w-full" size="lg" onClick={solve} disabled={running}>
                  {running ? <><Loader2 className="animate-spin" /> Checking constraints…</> : <><Search /> {need.status === "Matched" ? "Re-run matching" : "Find matches"}</>}
                </Button>
              )}
              <ErrorNote className="mt-2">{error}</ErrorNote>

              {!running && need.status === "Matched" && best && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-xl bg-brand-50 p-3">
                  <p className="text-sm font-semibold">{bundles.length} safe option{bundles.length === 1 ? "" : "s"} found</p>
                  <p className="text-sm text-ink-2">Best: {L.nameOf(best.field_id)} + {L.nameOf(best.coach_id)} · score {best.score} · {rand(best.weekly_cost * need.weeks)}</p>
                  <Link to={`/needs/${need.id}`}><Button variant="gold" className="mt-2 w-full">Review & approve <ArrowRight /></Button></Link>
                </motion.div>
              )}
              {!running && need.status === "Unmet" && need.last_binding_constraint && (
                <div className="mt-3 rounded-xl bg-warn-bg p-3 text-sm">
                  <p className="font-semibold text-warn">No safe match exists</p>
                  <p className="text-ink-2">{need.last_binding_constraint.message}</p>
                  <Link to={`/needs/${need.id}`} className="mt-1 inline-block font-semibold text-brand-600">See the sponsor-ready request →</Link>
                </div>
              )}
              {["Approved", "Active", "Delivered"].includes(need.status) && (
                <Link to={`/needs/${need.id}`} className="mt-3 inline-block text-sm font-semibold text-brand-600">Open programme →</Link>
              )}
            </Card>
          )}
        </div>

        {/* ---------- map ---------- */}
        <Card className="relative min-h-[420px] overflow-hidden p-1.5 lg:min-h-[640px]">
          <SolveMap
            state={state} needs={state.needs} selectedNeedId={need?.id} onSelectNeed={select}
            markers={markers} bundle={showRoute ? best : null} className="absolute inset-1.5"
          />
          <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex flex-wrap gap-2 rounded-xl bg-surface/95 px-3 py-2 text-[11px] font-medium text-ink-2 shadow">
            <Legend cls="border-[#e19a00] bg-warn-bg" label="Checking / open request" />
            <Legend cls="border-good bg-[#e7f7e7]" label="Passed" />
            <Legend cls="border-[#a9b0ab] bg-[#eceeeb]" label="Failed ×" />
            <Legend cls="border-gold bg-brand-700" label="Chosen" />
          </div>
        </Card>

        {/* ---------- agent timeline ---------- */}
        <Card className="flex max-h-[640px] flex-col lg:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Radar className="size-4 text-brand-600" /> Agent timeline</CardTitle>
            {running && <span className="flex items-center gap-1 text-xs font-semibold text-warn"><span className="size-2 animate-pulse rounded-full bg-gold" /> live</span>}
          </CardHeader>
          <AgentTimeline events={events} className="min-h-48 flex-1 px-3 pb-3" />
          <p className="border-t border-line px-4 py-2 text-[11px] text-ink-3">
            The engine solves in milliseconds; checks are replayed ~80 ms apart so people can follow them.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="flex items-center gap-1"><span className={cn("size-3 rounded-full border-2", cls)} />{label}</span>;
}
