/**
 * Screen 1 — Live Capture (coach, mobile-first, must work at 375px).
 * Typed message → Extraction Agent → editable fields with confidence bars →
 * coach confirms → POST /api/needs (status Unmet). Voice is a later feature:
 * the mic slot is reserved but disabled.
 */
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Loader2, Mic, PencilLine, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { AgeGroup, CommunityNeed, Day, ExtractedNeed, Gender } from "shared";
import { AgentTimeline } from "../components/AgentTimeline";
import { SchoolPicker } from "../components/AppShell";
import { ErrorNote, SyntheticBadge } from "../components/bits";
import { StatusFlow, StatusPill } from "../components/status";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input, Select, Textarea } from "../components/ui/input";
import { api, ApiError, type ExtractResponse } from "../lib/api";
import { useRole } from "../lib/role";
import { useWorld } from "../lib/store";
import { CONFIDENCE_THRESHOLD, cn, DAY_LABEL, DAYS, todayLocal } from "../lib/utils";

/** Section 5 scripted inputs: rehearse these, don't improvise on stage. */
const EXAMPLES = [
  { label: "28 U16 girls · Tuesdays", text: "We've got 28 under-16 girls who can train on Tuesdays after school. We need a field, a coach and six balls." },
  { label: "Messy version", text: "28 u16 girls, tues aftr skool, need field + coach + 6 balls pls" },
];

const SENT_TITLE: Record<CommunityNeed["status"], string> = {
  Draft: "Saved", Unmet: "Request sent", Matched: "Options found", Approved: "Approved — you’re booked!",
  Active: "Programme running", Delivered: "Programme delivered",
};

const BLANK: ExtractedNeed = {
  age_group: "U16", gender: "mixed", participants: 0, days: [], start_time: "15:00", end_time: "17:00",
  needs: { field: false, coach: false, balls: 0, transport: false },
};

type FieldKey = "age_group" | "gender" | "participants" | "days" | "start_time" | "end_time" | "needs";
const FIELD_LABEL: Record<FieldKey, string> = {
  age_group: "Age group", gender: "Team", participants: "Players", days: "Training days",
  start_time: "Starts", end_time: "Ends", needs: "What you need",
};

function ConfidenceBar({ value }: { value: number }) {
  const low = value < CONFIDENCE_THRESHOLD;
  return (
    <div className="flex items-center gap-2" title={`Assistant confidence ${Math.round(value * 100)}%`}>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-line">
        <motion.div
          className={cn("h-full rounded-full", low ? "bg-[#e19a00]" : "bg-good")}
          initial={{ width: 0 }} animate={{ width: `${value * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
      <span className={cn("tabular w-8 text-right text-[11px] font-semibold", low ? "text-warn" : "text-ink-3")}>{Math.round(value * 100)}%</span>
    </div>
  );
}

function FieldRow({
  k, confidence, missing, edited, children, index,
}: { k: FieldKey; confidence?: number; missing: boolean; edited: boolean; children: ReactNode; index: number }) {
  const flag = !edited && (missing || (confidence !== undefined && confidence < CONFIDENCE_THRESHOLD));
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }}
      className={cn("min-w-0 rounded-xl border px-3 py-2.5 transition-colors", flag ? "border-[#f0c35a] bg-warn-bg" : "border-line bg-surface")}
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{FIELD_LABEL[k]}</span>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          {edited ? (
            <Badge variant="good"><Check /> Checked by you</Badge>
          ) : missing ? (
            <Badge variant="warn"><TriangleAlert /> Not found — please fill in</Badge>
          ) : flag ? (
            <Badge variant="warn"><TriangleAlert /> Please check</Badge>
          ) : null}
          {confidence !== undefined && !edited && <ConfidenceBar value={missing ? 0 : confidence} />}
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button" aria-pressed={on} onClick={() => onChange(!on)}
      className={cn(
        "flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors",
        on ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-2",
      )}
    >
      {on && <Check className="size-4" />}{children}
    </button>
  );
}

export function LiveCapture() {
  const { schoolId } = useRole();
  const { state, events, resetCount } = useWorld();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "extracting" | "review" | "saving" | "saved">("idle");
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [form, setForm] = useState<ExtractedNeed>(BLANK);
  const [weeks, setWeeks] = useState(8);
  const [edited, setEdited] = useState<Set<FieldKey>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CommunityNeed | null>(null);
  const startedAt = useRef(0);

  useEffect(() => { reset(); }, [resetCount]); // demo reset clears the screen

  const school = state?.schools.find((s) => s.id === schoolId);
  const live = created && state?.needs.find((n) => n.id === created.id);
  const conf = result?.success ? result.confidence : undefined;
  const missing = new Set(result?.success ? result.missing_fields : []);

  function reset() {
    setText(""); setPhase("idle"); setResult(null); setForm(BLANK); setWeeks(8);
    setEdited(new Set()); setError(null); setCreated(null);
  }

  async function extract() {
    setError(null); setPhase("extracting"); startedAt.current = Date.now();
    try {
      const r = await api.extract({ text, school_id: schoolId, input_mode: "text", current_date: todayLocal() });
      setResult(r);
      setForm(r.success ? r.extracted : { ...BLANK });
      setEdited(new Set());
      setPhase("review");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  }

  function manual() {
    setResult(null); setForm({ ...BLANK }); setEdited(new Set()); setPhase("review");
  }

  function patch<K extends keyof ExtractedNeed>(key: K, value: ExtractedNeed[K], field: FieldKey = key as FieldKey) {
    setForm((f) => ({ ...f, [key]: value }));
    setEdited((s) => new Set(s).add(field));
  }
  const patchNeeds = (p: Partial<ExtractedNeed["needs"]>) => patch("needs", { ...form.needs, ...p }, "needs");

  const problems = useMemo(() => {
    const p: string[] = [];
    if (form.participants < 1) p.push("How many players?");
    if (!form.days.length) p.push("Pick at least one training day");
    if (form.start_time >= form.end_time) p.push("The session must end after it starts");
    if (!form.needs.field && !form.needs.coach && !form.needs.transport && form.needs.balls === 0) p.push("Say what you need");
    return p;
  }, [form]);

  async function confirm() {
    if (problems.length) return;
    setPhase("saving"); setError(null);
    try {
      const need = await api.createNeed({
        school_id: schoolId, ...form, weeks,
        raw_input: text || undefined,
        extraction_confidence: conf,
      });
      setCreated(need);
      setPhase("saved");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the request.");
      setPhase("review");
    }
  }

  const extractionEvents = (e: (typeof events)[number]) => e.agent === "extraction" && e.at >= startedAt.current - 50;

  // ---------------- saved: the live status card (flips on the phone when the laptop approves) ----------------
  if (phase === "saved" && created) {
    const n = live ?? created;
    return (
      <div className="mx-auto max-w-lg">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden">
            <div className="bg-brand-700 px-5 py-5 text-white">
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-white/15"><Check /></div>
              <h1 className="text-xl font-bold">{SENT_TITLE[n.status]}</h1>
              <p className="text-sm text-white/80">{n.status === "Unmet" ? "The provincial coordinator can see it now." : "Updated live by the provincial coordinator."} This card updates by itself.</p>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{n.participants} {n.age_group} {n.gender} · {school?.name}</p>
                  <p className="text-sm text-ink-2">{n.days.map((d) => DAY_LABEL[d]).join(", ")} {n.start_time}–{n.end_time} · {n.weeks} weeks</p>
                </div>
                <StatusPill status={n.status} size="lg" />
              </div>
              <StatusFlow status={n.status} compact />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={reset}><RotateCcw /> New request</Button>
                <Link to="/requests" className="flex-1"><Button className="w-full">My requests <ArrowRight /></Button></Link>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Report a need</h1>
          <SyntheticBadge />
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-ink-2">
          Reporting for <SchoolPicker />
        </div>
      </div>

      {/* ---------- message ---------- */}
      <Card className="p-4">
        <label htmlFor="need-text" className="mb-2 block text-sm font-semibold">Describe what your team needs</label>
        <div className="relative">
          <Textarea
            id="need-text" rows={4} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="e.g. 28 under-16 girls, Tuesdays after school, need a field, a coach and 6 balls"
            className="pr-12" disabled={phase === "extracting"}
          />
          <button
            type="button" disabled aria-label="Voice input (coming soon)" title="Voice input is coming soon"
            className="absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-canvas text-ink-3 opacity-60"
          >
            <Mic className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label} type="button" onClick={() => setText(ex.text)} disabled={phase === "extracting"}
              className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-brand-100 hover:text-brand-700"
            >
              {ex.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button size="lg" className="flex-1" onClick={extract} disabled={text.trim().length < 3 || phase === "extracting"}>
            {phase === "extracting" ? <><Loader2 className="animate-spin" /> Reading your message…</> : <><Sparkles /> Extract</>}
          </Button>
          <Button size="lg" variant="ghost" onClick={manual} disabled={phase === "extracting"} title="Skip the assistant">
            <PencilLine /> <span className="hidden min-[400px]:inline">Fill in myself</span>
          </Button>
        </div>
        <ErrorNote className="mt-3">{error}</ErrorNote>
      </Card>

      {/* ---------- live extraction agent steps ---------- */}
      <AnimatePresence>
        {(phase === "extracting" || (phase === "review" && result)) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <AgentTimeline events={events} filter={extractionEvents} className="max-h-36 rounded-xl bg-surface px-2 py-1 ring-1 ring-line" emptyText="Waiting for the extraction agent…" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- review + confirm ---------- */}
      {(phase === "review" || phase === "saving") && (
        <Card className="space-y-2.5 p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Check the details</h2>
            {result?.success && <Badge variant="outline">read by {result.source}</Badge>}
          </div>
          {result && !result.success && (
            <div className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
              <b>The assistant couldn’t read that</b> ({result.error.code}). {result.error.message} Fill in the details below instead.
            </div>
          )}
          {result?.success && Object.values(conf ?? {}).some((v) => v < CONFIDENCE_THRESHOLD) && (
            <p className="text-sm text-ink-2">Anything in <span className="rounded bg-warn-bg px-1 font-semibold text-warn">amber</span> is a guess. Tap it to correct it — you stay in control.</p>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <FieldRow k="age_group" index={0} confidence={conf?.age_group} missing={missing.has("age_group")} edited={edited.has("age_group")}>
              <Select value={form.age_group} onChange={(e) => patch("age_group", e.target.value as AgeGroup)}>
                {(["U12", "U14", "U16", "U18"] as AgeGroup[]).map((a) => <option key={a}>{a}</option>)}
              </Select>
            </FieldRow>
            <FieldRow k="gender" index={1} confidence={conf?.gender} missing={missing.has("gender")} edited={edited.has("gender")}>
              <Select value={form.gender} onChange={(e) => patch("gender", e.target.value as Gender)}>
                <option value="girls">Girls</option><option value="boys">Boys</option><option value="mixed">Mixed</option>
              </Select>
            </FieldRow>
          </div>

          <FieldRow k="participants" index={2} confidence={conf?.participants} missing={missing.has("participants")} edited={edited.has("participants")}>
            <Input
              type="number" inputMode="numeric" min={1} max={500} value={form.participants || ""} placeholder="How many players?"
              onChange={(e) => patch("participants", Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
              className="tabular text-base font-semibold"
            />
          </FieldRow>

          <FieldRow k="days" index={3} confidence={conf?.days} missing={missing.has("days")} edited={edited.has("days")}>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const on = form.days.includes(d);
                return (
                  <button
                    key={d} type="button" aria-pressed={on}
                    onClick={() => patch("days", (on ? form.days.filter((x) => x !== d) : [...form.days, d].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))) as Day[])}
                    className={cn("h-9 min-w-11 rounded-lg border px-2 text-sm font-semibold", on ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-2")}
                  >
                    {DAY_LABEL[d]}
                  </button>
                );
              })}
            </div>
          </FieldRow>

          <div className="grid grid-cols-2 gap-2.5">
            <FieldRow k="start_time" index={4} confidence={conf?.start_time} missing={missing.has("start_time")} edited={edited.has("start_time")}>
              <Input type="time" value={form.start_time} onChange={(e) => patch("start_time", e.target.value)} className="tabular" />
            </FieldRow>
            <FieldRow k="end_time" index={5} confidence={conf?.end_time} missing={missing.has("end_time")} edited={edited.has("end_time")}>
              <Input type="time" value={form.end_time} onChange={(e) => patch("end_time", e.target.value)} className="tabular" />
            </FieldRow>
          </div>

          <FieldRow k="needs" index={6} confidence={conf?.needs} missing={missing.has("needs")} edited={edited.has("needs")}>
            <div className="flex flex-wrap items-center gap-2">
              <Toggle on={form.needs.field} onChange={(v) => patchNeeds({ field: v })}>Field</Toggle>
              <Toggle on={form.needs.coach} onChange={(v) => patchNeeds({ coach: v })}>Coach</Toggle>
              <Toggle on={form.needs.transport} onChange={(v) => patchNeeds({ transport: v })}>Transport</Toggle>
              <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface pr-1 pl-3 text-sm font-semibold text-ink-2">
                Balls
                <Input
                  type="number" inputMode="numeric" min={0} max={50} value={form.needs.balls}
                  onChange={(e) => patchNeeds({ balls: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
                  className="tabular h-8 w-16 text-center"
                />
              </label>
            </div>
          </FieldRow>

          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
            <span className="text-sm text-ink-2">Programme length</span>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <Input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))} className="tabular h-8 w-16 text-center" />
              weeks
            </label>
          </div>

          {problems.length > 0 && <p className="text-sm font-medium text-warn">{problems.join(" · ")}</p>}
          <ErrorNote>{error}</ErrorNote>
          <Button size="lg" variant="gold" className="w-full" onClick={confirm} disabled={problems.length > 0 || phase === "saving"}>
            {phase === "saving" ? <Loader2 className="animate-spin" /> : <Check />} Confirm and send
          </Button>
          <p className="text-center text-[11px] text-ink-3">Counts only. Never type a child’s name — we don’t store them.</p>
        </Card>
      )}
    </div>
  );
}
