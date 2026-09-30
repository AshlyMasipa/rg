/**
 * Screens 3 + 4 — Match alternatives and Approval (coordinator).
 * Two ranked bundles with "Why this match?" (deterministic, from the engine),
 * then the coordinator selects, assigns an owner and a start date.
 * Infeasible needs show the binding constraint as a sponsor-ready request.
 */
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, Check, ClipboardCopy, Handshake, History, ListChecks, Loader2, Search, ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import type { AuditEvent, CommunityNeed, OwnerRole } from "shared";
import { AgentTimeline } from "../components/AgentTimeline";
import { BundleCard } from "../components/BundleCard";
import { Empty, ErrorNote, Skeleton } from "../components/bits";
import { StatusFlow, StatusPill } from "../components/status";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input, Label, Select } from "../components/ui/input";
import { api } from "../lib/api";
import { useLookups, useWorld } from "../lib/store";
import { useSolve } from "../lib/useSolve";
import { cn, needTitle, needWants, needWhen, nextOccurrence, rand, timeAgo } from "../lib/utils";

export function NeedsIndex() {
  const { state } = useWorld();
  if (!state) return <Skeleton className="h-64" />;
  const pick =
    [...state.needs].filter((n) => n.status === "Matched").sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ??
    [...state.needs].filter((n) => n.status === "Unmet").sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ??
    state.needs[0];
  return pick ? <Navigate to={`/needs/${pick.id}`} replace /> : <Empty title="No requests yet">Coaches’ requests appear here.</Empty>;
}

function NeedRail({ current }: { current: string }) {
  const { state } = useWorld();
  const L = useLookups();
  const needs = [...(state?.needs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <nav aria-label="Requests" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
      {needs.map((n) => (
        <Link
          key={n.id} to={`/needs/${n.id}`}
          className={cn(
            "min-w-52 rounded-xl border px-3 py-2 transition-colors lg:min-w-0",
            n.id === current ? "border-brand-500 bg-brand-50" : "border-line bg-surface hover:border-brand-100",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold">{L.nameOf(n.school_id)}</span>
            <StatusPill status={n.status} />
          </div>
          <div className="truncate text-xs text-ink-2">{needTitle(n)} · {needWhen(n)}</div>
        </Link>
      ))}
    </nav>
  );
}

function useAudit(need: CommunityNeed | undefined, bundleIds: string[]) {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const key = `${need?.id}:${need?.status}:${bundleIds.join(",")}`;
  useEffect(() => {
    if (!need) return;
    let live = true;
    api.audit(500).then((all) => {
      if (!live) return;
      const ids = new Set([need.id, ...bundleIds]);
      setRows(all.filter((a) => ids.has(a.entity_id) || (a.detail as { need_id?: string } | null)?.need_id === need.id).reverse());
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rows;
}

const ACTION_LABEL: Record<string, string> = {
  "need.created": "Request created",
  "need.solved": "Matching engine run",
  "bundle.approved": "Bundle approved",
  "evidence.logged": "Attendance logged",
};

export function MatchApprove() {
  const { id = "" } = useParams();
  const { state, events } = useWorld();
  const L = useLookups();
  const navigate = useNavigate();
  const need = state?.needs.find((n) => n.id === id);
  const { runId, running, solve, error: solveError } = useSolve(need?.id);

  const bundles = useMemo(
    () => (state?.bundles ?? []).filter((b) => b.need_id === id).sort((a, b) => a.rank - b.rank),
    [state?.bundles, id],
  );
  const programme = L.programmes.find((p) => p.need?.id === id);
  const [selected, setSelected] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerRole>("coordinator");
  const [start, setStart] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [justApproved, setJustApproved] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [copied, setCopied] = useState(false);
  const audit = useAudit(need, bundles.map((b) => b.id));

  useEffect(() => { setSelected(null); setJustApproved(false); setApproveError(null); setShowTrace(false); }, [id]);
  useEffect(() => { if (need && !start) setStart(nextOccurrence(need.days)); }, [need, start]);
  useEffect(() => { if (running) setShowTrace(true); }, [running]);

  if (!state) return <Skeleton className="h-96" />;
  if (!need) return <Empty title="Request not found">It may have been cleared by a demo reset. <Link className="font-semibold text-brand-600" to="/needs">Back to requests</Link></Empty>;

  const chosen = bundles.find((b) => b.id === selected) ?? bundles[0];
  const sponsor = chosen && L.sponsors.get(chosen.sponsor_id);
  const total = chosen ? chosen.weekly_cost * need.weeks : 0;
  const canSolve = need.status === "Unmet" || need.status === "Matched";
  const conf = need.extraction_confidence ?? {};
  const flagged = Object.entries(conf).filter(([, v]) => v < 0.7).map(([k]) => k.replace("_", " "));

  async function approve() {
    if (!chosen) return;
    setApproving(true); setApproveError(null);
    try {
      await api.approve(chosen.id, { owner_role: owner, start_date: start || undefined });
      setJustApproved(true);
    } catch (e) {
      setApproveError((e as Error).message);
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-2">
        <Link to="/map" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Map</Link>
        <NeedRail current={id} />
      </aside>

      <div className="min-w-0 space-y-4">
        {/* ---------- need header ---------- */}
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-600">{L.nameOf(need.school_id)}</p>
              <h1 className="text-2xl font-bold tracking-tight">{needTitle(need)}</h1>
              <p className="text-sm text-ink-2">{needWhen(need)} · {need.weeks} weeks · needs {needWants(need)}</p>
            </div>
            <StatusPill status={need.status} size="lg" />
          </div>
          <div className="mt-3"><StatusFlow status={need.status} /></div>
          {need.raw_input && (
            <blockquote className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm italic text-ink-2">
              “{need.raw_input}” <span className="not-italic text-ink-3">— coach’s message</span>
            </blockquote>
          )}
          {flagged.length > 0 && (
            <p className="mt-2 text-xs text-ink-3">Coach confirmed low-confidence fields: {flagged.join(", ")}.</p>
          )}
          {canSolve && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={solve} disabled={running} variant={bundles.length ? "outline" : "default"}>
                {running ? <><Loader2 className="animate-spin" /> Checking constraints…</> : <><Search /> {bundles.length || need.last_binding_constraint ? "Re-run matching" : "Find matches"}</>}
              </Button>
              {runId && (
                <Button variant="ghost" onClick={() => setShowTrace((s) => !s)}><ListChecks /> {showTrace ? "Hide" : "Show"} constraint checks</Button>
              )}
            </div>
          )}
          <ErrorNote className="mt-2">{solveError}</ErrorNote>
          <AnimatePresence>
            {showTrace && runId && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <AgentTimeline events={events} filter={(e) => e.run_id === runId} className="mt-3 max-h-64 rounded-xl bg-canvas p-2" />
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* ---------- infeasible: sponsor-ready request ---------- */}
        {need.status === "Unmet" && need.last_binding_constraint && !running && (
          <Card className="border-[#f0c35a] p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-warn-bg p-2 text-warn"><ShieldAlert className="size-6" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold">No safe match exists — so we won’t force one</h2>
                <p className="text-sm text-ink-2">Binding constraint <Badge variant="outline" className="ml-1 font-mono">{need.last_binding_constraint.check}</Badge></p>
                <p className="mt-2">{need.last_binding_constraint.message}</p>
                <div className="mt-4 rounded-xl bg-brand-900 p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold">Sponsor-ready request</p>
                  <p className="mt-1 text-base font-semibold">{need.last_binding_constraint.sponsor_request}</p>
                  <p className="mt-1 text-xs text-white/70">For {L.nameOf(need.school_id)} · {needTitle(need)} · {needWhen(need)}</p>
                  <Button
                    size="sm" variant="gold" className="mt-3"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`${need.last_binding_constraint!.sponsor_request} — ${L.nameOf(need.school_id)}, ${needTitle(need)}, ${needWhen(need)}`);
                      setCopied(true); setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check /> : <ClipboardCopy />} {copied ? "Copied" : "Copy request"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-ink-3">RugbyGrid separates coordination failure from true scarcity. This one is scarcity, and it now has a price tag.</p>
              </div>
            </div>
          </Card>
        )}

        {need.status === "Unmet" && !need.last_binding_constraint && !running && bundles.length === 0 && (
          <Empty icon={<Search />} title="Not matched yet">Run the matching engine to find a field, coach, kit, transport and sponsor that all fit.</Empty>
        )}

        {/* ---------- matched: options + approval ---------- */}
        {need.status === "Matched" && bundles.length > 0 && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold">{bundles.length} safe option{bundles.length > 1 ? "s" : ""}</h2>
              <p className="mb-3 text-sm text-ink-2">Every hard constraint passed — time, travel, capacity, age-group credential, safeguarding, kit, budget and no double-booking. Pick one to approve.</p>
              <div className="grid gap-4 md:grid-cols-2">
                {bundles.map((b) => (
                  <BundleCard key={b.id} bundle={b} need={need} selected={chosen?.id === b.id} onSelect={() => setSelected(b.id)} />
                ))}
              </div>
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Handshake className="size-4 text-brand-600" /> Approve and assign</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="owner">Owner</Label>
                    <Select id="owner" value={owner} onChange={(e) => setOwner(e.target.value as OwnerRole)}>
                      <option value="coordinator">Provincial coordinator</option>
                      <option value="coach">School coach</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="start">First session</Label>
                    <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Sponsor commitment</Label>
                    <p className="tabular text-sm"><b>{rand(total)}</b> of {rand(sponsor?.remaining ?? 0)}</p>
                    <p className="text-xs text-ink-3">{sponsor?.sponsor} → {rand((sponsor?.remaining ?? 0) - total)} left after</p>
                  </div>
                </div>
                <ErrorNote>{approveError}</ErrorNote>
                <Button size="lg" variant="gold" className="w-full sm:w-auto" onClick={approve} disabled={approving || !chosen}>
                  {approving ? <Loader2 className="animate-spin" /> : <Check />}
                  Approve {L.nameOf(chosen?.field_id)} + {L.nameOf(chosen?.coach_id)}
                </Button>
                <p className="text-xs text-ink-3">A person approves every allocation. The approval is logged to the audit trail and the coach’s phone updates instantly.</p>
              </CardContent>
            </Card>
          </>
        )}

        {/* ---------- approved / running / delivered ---------- */}
        {programme?.bundle && ["Approved", "Active", "Delivered"].includes(need.status) && (
          <motion.div initial={justApproved ? { scale: 0.97, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} className="space-y-4">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-700 px-5 py-4 text-white">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold">{justApproved ? "Approved just now" : "Programme"}</p>
                  <p className="text-lg font-bold">{L.nameOf(programme.bundle.field_id)} + {L.nameOf(programme.bundle.coach_id)}</p>
                  <p className="text-sm text-white/80">
                    Starts {programme.assignment.start_date} · owner {programme.assignment.owner_role} · {rand(programme.bundle.weekly_cost * programme.assignment.weeks)} committed by {L.nameOf(programme.bundle.sponsor_id)}
                  </p>
                </div>
                <Button variant="gold" onClick={() => navigate("/delivery")}>Delivery <ArrowRight /></Button>
              </div>
              <div className="px-5 py-4">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold">Sessions delivered</span>
                  <span className="tabular">{programme.evidence.length} / {programme.assignment.weeks * need.days.length}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <motion.div className="h-full rounded-full bg-brand-500" initial={{ width: 0 }} animate={{ width: `${(programme.evidence.length / (programme.assignment.weeks * need.days.length)) * 100}%` }} />
                </div>
              </div>
            </Card>
            <BundleCard bundle={programme.bundle} need={need} selected />
          </motion.div>
        )}

        {/* ---------- audit trail ---------- */}
        {audit.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4 text-brand-600" /> Audit trail</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-1.5 border-l-2 border-line pl-4">
                {audit.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-brand-500" />
                    <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action.replace("need.status.", "Status → ")}</span>
                    <span className="text-ink-3"> · {a.actor_role} · {timeAgo(a.created_at)}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
