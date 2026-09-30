/**
 * Screen 6 — Impact dashboard (sponsor / SA Rugby leadership).
 * Every number comes from GET /api/impact, i.e. from real workflow state.
 * Participant-session = one participant attending one delivered session.
 */
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { FileText, HandCoins, Loader2, Sparkles, Target, Users, Venus } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ImpactSummary, NeedStatus } from "shared";
import { PageHeader, Skeleton, SyntheticBadge } from "../components/bits";
import { StatusPill } from "../components/status";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Select } from "../components/ui/input";
import { useReport } from "../lib/useReport";
import { useWorld } from "../lib/store";
import { cn, num, rand } from "../lib/utils";

function CountUp({ value, format = num }: { value: number; format?: (n: number) => string }) {
  const mv = useMotionValue(0);
  const out = useTransform(mv, (v) => format(Math.round(v)));
  useEffect(() => { const c = animate(mv, value, { duration: 0.9, ease: "easeOut" }); return () => c.stop(); }, [value, mv]);
  return <motion.span>{out}</motion.span>;
}

function Kpi({ icon, label, value, sub, hero }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; hero?: boolean }) {
  return (
    <Card className={cn("p-4", hero && "bg-brand-700 text-white sm:col-span-2 lg:col-span-1 lg:row-span-2 lg:flex lg:flex-col lg:justify-between")}>
      <div className={cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-wide [&_svg]:size-4", hero ? "text-gold" : "text-ink-3")}>{icon}{label}</div>
      <div className={cn("tabular mt-2 font-extrabold tracking-tight", hero ? "text-5xl lg:text-6xl" : "text-3xl")}>{value}</div>
      {sub && <p className={cn("mt-1 text-sm", hero ? "text-white/75" : "text-ink-2")}>{sub}</p>}
    </Card>
  );
}

function SpendChart({ impact }: { impact: ImpactSummary }) {
  const data = Object.values(impact.sponsor_spend).map((s) => ({ name: s.sponsor, committed: s.committed, remaining: s.remaining }));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-series-1" /> Committed to programmes</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-series-muted" /> Still available</span>
      </div>
      <div className="h-40" role="img" aria-label={data.map((d) => `${d.name}: ${rand(d.committed)} committed, ${rand(d.remaining)} available`).join("; ")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={18}>
            <CartesianGrid horizontal={false} stroke="#e3e7e2" />
            <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7c8a84" }} tickFormatter={(v) => `R${v / 1000}k`} />
            <YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#13201b" }} />
            <Tooltip cursor={{ fill: "rgba(42,120,214,.06)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e3e7e2", fontSize: 12 }} formatter={(v, k) => [rand(Number(v)), k === "committed" ? "Committed" : "Available"]} />
            <Bar dataKey="committed" stackId="s" fill="#2a78d6" stroke="#fff" strokeWidth={2} radius={[4, 0, 0, 4]} />
            <Bar dataKey="remaining" stackId="s" fill="#d9dcd6" stroke="#fff" strokeWidth={2} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function WeeklyChart() {
  const { state } = useWorld();
  const byDate = new Map<string, number>();
  for (const e of state?.evidence ?? []) byDate.set(e.session_date, (byDate.get(e.session_date) ?? 0) + e.attendance_count);
  const data = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
    date, label: new Date(`${date}T12:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }), v,
  }));
  if (!data.length) return <p className="py-10 text-center text-sm text-ink-3">No sessions delivered yet. Attendance appears here as coaches log it.</p>;
  return (
    <div className="h-48" role="img" aria-label={`Participant-sessions by session date: ${data.map((d) => `${d.label} ${d.v}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap={3}>
          <CartesianGrid vertical={false} stroke="#e3e7e2" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7c8a84" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7c8a84" }} />
          <Tooltip cursor={{ fill: "rgba(42,120,214,.08)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e3e7e2", fontSize: 12 }} formatter={(v) => [`${v}`, "Participant-sessions"]} />
          <Bar dataKey="v" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReportPanel({ impact }: { impact: ImpactSummary }) {
  const { text, status, source, generate } = useReport();
  const sponsors = Object.entries(impact.sponsor_spend);
  const [sponsorId, setSponsorId] = useState(sponsors[0]?.[0] ?? "");
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><FileText className="size-4 text-brand-600" /> Sponsor impact update</CardTitle>
          <CardDescription>Written by the Narrative Agent from the aggregated figures above only — no names, no rows.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Select value={sponsorId} onChange={(e) => setSponsorId(e.target.value)} className="w-auto">
            {sponsors.map(([id, s]) => <option key={id} value={id}>{s.sponsor}</option>)}
          </Select>
          <Button onClick={() => generate(sponsorId || undefined)} disabled={status === "streaming"}>
            {status === "streaming" ? <Loader2 className="animate-spin" /> : <Sparkles />} {text ? "Regenerate" : "Generate report"}
          </Button>
        </div>
        {(text || status === "streaming") && (
          <motion.article initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl bg-canvas p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="warn">Pilot data</Badge>
              <SyntheticBadge />
              {source && <Badge variant="outline">source: {source}</Badge>}
            </div>
            <div className={cn("space-y-3 text-[15px] leading-relaxed whitespace-pre-line", status === "streaming" && "caret")}>
              {text || "Writing…"}
            </div>
          </motion.article>
        )}
        {status === "error" && <p className="text-sm text-bad">Couldn’t start the report. Check the server connection.</p>}
      </CardContent>
    </Card>
  );
}

const PIPE: NeedStatus[] = ["Unmet", "Matched", "Approved", "Active", "Delivered"];

export function Impact() {
  const { impact, state } = useWorld();
  if (!impact || !state) return <Skeleton className="h-96" />;
  const committed = Object.values(impact.sponsor_spend).reduce((s, x) => s + x.committed, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Impact" subtitle="Gauteng pilot · verified from attendance evidence, not claims" right={<SyntheticBadge />} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi hero icon={<Users />} label="Participant-sessions" value={<CountUp value={impact.participant_sessions} />} sub={`${impact.sessions_delivered} sessions delivered · one player at one session = 1`} />
        <Kpi icon={<Target />} label="Programmes" value={<><CountUp value={impact.programmes_delivered} /> <span className="text-base font-semibold text-ink-3">delivered</span></>} sub={`${impact.programmes_running} running now`} />
        <Kpi icon={<Venus />} label="Female participation" value={<><CountUp value={impact.female_participation_pct} />%</>} sub="of participant-sessions" />
        <Kpi icon={<HandCoins />} label="Cost per participant-session" value={impact.cost_per_participant_session === null ? "—" : rand(impact.cost_per_participant_session)} sub={`${rand(committed)} committed by sponsors`} />
        <Card className="p-4 sm:col-span-2 lg:col-span-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Request pipeline</p>
          <div className="grid grid-cols-5 gap-2">
            {PIPE.map((s) => (
              <div key={s} className="rounded-xl bg-canvas p-2 text-center">
                <div className="tabular text-2xl font-bold">{impact.needs[s.toLowerCase() as keyof ImpactSummary["needs"]]}</div>
                <StatusPill status={s} className="mt-1" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Participant-sessions by session date</CardTitle></CardHeader>
          <CardContent><WeeklyChart /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sponsor funding</CardTitle></CardHeader>
          <CardContent><SpendChart impact={impact} /></CardContent>
        </Card>
      </div>

      {impact.unmet_requests.length > 0 && (
        <Card className="border-[#f0c35a]">
          <CardHeader>
            <div>
              <CardTitle>Unmet needs → funded requests</CardTitle>
              <CardDescription>Where capacity truly doesn’t exist, the gap becomes a precise ask.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {impact.unmet_requests.map((u) => (
              <div key={u.need_id} className="rounded-xl bg-brand-900 p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold">{u.school}</p>
                <p className="mt-1 font-semibold">{u.sponsor_request}</p>
                <p className="mt-1 text-xs text-white/70">Why: {u.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ReportPanel impact={impact} />
    </div>
  );
}
