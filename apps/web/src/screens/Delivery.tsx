/**
 * Screen 5 — Delivery evidence. Coaches log attendance after each session
 * (counts only, never names). The first session moves Approved → Active; the
 * last planned one moves the programme to Delivered.
 */
import { motion } from "motion/react";
import { CalendarCheck, Check, ClipboardCheck, Loader2, Minus, Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty, ErrorNote, PageHeader, Skeleton } from "../components/bits";
import { StatusPill } from "../components/status";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input, Label } from "../components/ui/input";
import { api } from "../lib/api";
import { useRole } from "../lib/role";
import { useLookups, useWorld } from "../lib/store";
import { needTitle, needWhen, num, plannedSessions } from "../lib/utils";

type Programme = ReturnType<typeof useLookups>["programmes"][number];

function AttendanceChart({ p }: { p: Programme }) {
  const data = p.evidence.map((e, i) => ({ name: `S${i + 1}`, date: e.session_date, attendance: e.attendance_count }));
  if (!data.length) return null;
  return (
    <div className="h-36" role="img" aria-label={`Attendance per session: ${data.map((d) => d.attendance).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#e3e7e2" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7c8a84" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7c8a84" }} domain={[0, p.need?.participants ?? "auto"]} />
          <Tooltip
            cursor={{ fill: "rgba(42,120,214,.08)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #e3e7e2", fontSize: 12 }}
            formatter={(v) => [`${v} players`, "Attended"]}
            labelFormatter={(_, pl) => (pl?.[0]?.payload as { date?: string })?.date ?? ""}
          />
          <Bar dataKey="attendance" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProgrammeCard({ p }: { p: Programme }) {
  const L = useLookups();
  const need = p.need!;
  const planned = plannedSessions(p.assignment.start_date, need.days, p.assignment.weeks);
  const logged = p.evidence.length;
  const nextDate = planned[logged] ?? planned[planned.length - 1];
  const [date, setDate] = useState(nextDate);
  const [count, setCount] = useState(need.participants);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => setDate(nextDate), [nextDate]);

  const total = p.evidence.reduce((s, e) => s + e.attendance_count, 0);
  const open = need.status === "Approved" || need.status === "Active";

  async function log() {
    setBusy(true); setError(null);
    try {
      await api.evidence(p.assignment.id, { session_date: date, attendance_count: count });
      setFlash(true); setTimeout(() => setFlash(false), 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-brand-600">{p.school?.name}</p>
          <p className="font-bold">{needTitle(need)} · {needWhen(need)}</p>
          <p className="text-sm text-ink-2">{L.nameOf(p.bundle?.field_id)} · {L.nameOf(p.bundle?.coach_id)} · from {p.assignment.start_date}</p>
        </div>
        <StatusPill status={need.status} size="lg" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-canvas p-2"><div className="tabular text-xl font-bold">{logged}<span className="text-sm text-ink-3">/{planned.length}</span></div><div className="text-[11px] text-ink-3">sessions</div></div>
        <div className="rounded-xl bg-canvas p-2"><div className="tabular text-xl font-bold">{num(total)}</div><div className="text-[11px] text-ink-3">participant-sessions</div></div>
        <div className="rounded-xl bg-canvas p-2"><div className="tabular text-xl font-bold">{logged ? Math.round(total / logged) : "—"}</div><div className="text-[11px] text-ink-3">avg attendance</div></div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-label={`${logged} of ${planned.length} sessions`}>
        <motion.div className="h-full rounded-full bg-brand-500" animate={{ width: `${(logged / planned.length) * 100}%` }} />
      </div>

      <div className="mt-3"><AttendanceChart p={p} /></div>

      {open ? (
        <div className="mt-4 rounded-xl border border-line p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="size-4 text-brand-600" /> Log session {logged + 1} of {planned.length}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor={`d-${p.assignment.id}`}>Session date</Label>
              <Input id={`d-${p.assignment.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Players who attended</Label>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" aria-label="One fewer" onClick={() => setCount((c) => Math.max(0, c - 1))}><Minus /></Button>
                <Input type="number" inputMode="numeric" value={count} min={0} onChange={(e) => setCount(Math.max(0, Number(e.target.value) || 0))} className="tabular w-16 text-center text-base font-bold" />
                <Button variant="outline" size="icon" aria-label="One more" onClick={() => setCount((c) => c + 1)}><Plus /></Button>
              </div>
            </div>
            <Button size="lg" onClick={log} disabled={busy || !date}>
              {busy ? <Loader2 className="animate-spin" /> : flash ? <Check /> : <CalendarCheck />} {flash ? "Logged" : "Log session"}
            </Button>
          </div>
          <ErrorNote className="mt-2">{error}</ErrorNote>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-3"><Users className="size-3" /> A head count only. No names, no photos.</p>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">
          <Check className="size-4" /> All {planned.length} sessions delivered — verified by attendance evidence.
        </p>
      )}
    </Card>
  );
}

export function Delivery() {
  const { role, schoolId } = useRole();
  const { state } = useWorld();
  const L = useLookups();
  if (!state) return <Skeleton className="h-64" />;

  const list = L.programmes
    .filter((p) => p.need && (role !== "coach" || p.need.school_id === schoolId))
    .sort((a, b) => Number(a.need!.status === "Delivered") - Number(b.need!.status === "Delivered"));

  return (
    <div className={role === "coach" ? "mx-auto max-w-lg" : "mx-auto max-w-4xl"}>
      <PageHeader
        title={role === "coach" ? "Attendance" : "Delivery evidence"}
        subtitle={role === "coach" ? `Programmes at ${L.nameOf(schoolId)}` : "Every approved programme and the sessions it has actually delivered."}
      />
      {list.length === 0 ? (
        <Empty icon={<ClipboardCheck />} title="No approved programmes yet">Once the coordinator approves a match, it appears here so attendance can be logged.</Empty>
      ) : (
        <div className="grid gap-4">{list.map((p) => <ProgrammeCard key={p.assignment.id} p={p} />)}</div>
      )}
    </div>
  );
}
