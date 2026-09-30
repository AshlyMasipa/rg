import { motion } from "motion/react";
import { Bus, CheckCircle2, Coins, MapPin, Package, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { CommunityNeed, OpportunityBundle, ScoreBreakdown } from "shared";
import { useLookups } from "../lib/store";
import { cn, rand } from "../lib/utils";
import { Badge } from "./ui/badge";

/** Policy weights (Section 2.3): each part of the score is out of these. */
export const WEIGHTS: ScoreBreakdown = { travel: 30, capacity: 20, priority: 25, cost: 25 };
const PART_LABEL: Record<keyof ScoreBreakdown, string> = {
  travel: "Short travel", capacity: "Uses spare capacity", priority: "Sponsor priority fit", cost: "Cost efficiency",
};

export function ScoreBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <dl className="space-y-1.5">
      {(Object.keys(WEIGHTS) as (keyof ScoreBreakdown)[]).map((k) => (
        <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5">
          <dt className="text-xs text-ink-2">{PART_LABEL[k]}</dt>
          <dd className="tabular text-xs font-semibold text-ink">{breakdown[k]}<span className="text-ink-3">/{WEIGHTS[k]}</span></dd>
          <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-series-muted/60">
            <motion.div
              className="h-full rounded-full bg-series-1"
              initial={{ width: 0 }}
              animate={{ width: `${(breakdown[k] / WEIGHTS[k]) * 100}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </div>
      ))}
    </dl>
  );
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 text-ink-3 [&_svg]:size-4">{icon}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function BundleCard({
  bundle, need, selected, onSelect, footer,
}: {
  bundle: OpportunityBundle;
  need: CommunityNeed;
  selected?: boolean;
  onSelect?: () => void;
  footer?: ReactNode;
}) {
  const L = useLookups();
  const [why, setWhy] = useState(bundle.rank === 1);
  const field = L.fields.get(bundle.field_id);
  const coach = L.coaches.get(bundle.coach_id);
  const kit = bundle.kit_id ? L.kits.get(bundle.kit_id) : null;
  const transport = bundle.transport_id ? L.transport.get(bundle.transport_id) : null;
  const sponsor = L.sponsors.get(bundle.sponsor_id);
  const total = bundle.weekly_cost * need.weeks;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: (bundle.rank - 1) * 0.12 }}
      onClick={onSelect}
      className={cn(
        "relative flex cursor-pointer flex-col rounded-2xl border-2 bg-surface p-4 transition-colors",
        selected ? "border-brand-700 shadow-md" : "border-line hover:border-brand-100",
      )}
      aria-pressed={selected}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          {bundle.rank === 1 ? <Badge variant="dark">Recommended</Badge> : <Badge variant="outline">Alternative #{bundle.rank}</Badge>}
          <h3 className="mt-1.5 text-base font-bold leading-tight">
            {field?.name ?? bundle.field_id} + Coach {coach?.name ?? bundle.coach_id}
          </h3>
        </div>
        <div className="text-right">
          <div className="tabular text-3xl font-extrabold leading-none text-brand-700">{bundle.score}</div>
          <div className="text-[11px] font-medium text-ink-3">score / 100</div>
        </div>
      </header>

      <ul className="mb-3 space-y-1.5">
        <Row icon={<MapPin />}>{field?.name} · capacity {field?.capacity}</Row>
        <Row icon={<UserRound />}>Coach {coach?.name} · {coach?.credentials.join(", ")}</Row>
        <Row icon={<Package />}>{kit ? `${kit.description} (${kit.ball_count} balls)` : "No kit needed"}</Row>
        <Row icon={<Bus />}>{transport ? `${transport.provider}, ${transport.seats} seats` : "No transport needed"}</Row>
        <Row icon={<Coins />}>
          {sponsor?.sponsor} · <b className="tabular">{rand(bundle.weekly_cost)}</b>/week ·{" "}
          <b className="tabular">{rand(total)}</b> for {need.weeks} weeks
        </Row>
      </ul>

      <ScoreBars breakdown={bundle.score_breakdown} />

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setWhy((w) => !w); }}
        className="mt-3 self-start text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
      >
        {why ? "Hide" : "Why this match?"}
      </button>
      {why && (
        <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 space-y-1.5 rounded-xl bg-brand-50 p-3">
          {bundle.explanation.map((line) => (
            <li key={line} className="flex gap-2 text-[13px] leading-snug text-ink">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden />
              {line}
            </li>
          ))}
          <li className="pt-1 text-[11px] text-ink-3">Written by the rules engine, not by AI: every line is a constraint that passed.</li>
        </motion.ul>
      )}
      {footer && <div className="mt-4">{footer}</div>}
    </motion.article>
  );
}
