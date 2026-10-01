import { AnimatePresence, motion } from "motion/react";
import { Check, CircleDot, X, Flag } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AgentName } from "shared";
import type { StampedEvent } from "../lib/store";
import { cn } from "../lib/utils";

export const AGENT_META: Record<AgentName, { label: string; chip: string; dot: string }> = {
  extraction: { label: "Extraction", chip: "bg-[#e3eefb] text-[#1c5cab]", dot: "bg-agent-extraction" },
  constraint: { label: "Constraint", chip: "bg-[#ebe8fa] text-[#4a3aa7]", dot: "bg-agent-constraint" },
  simulation: { label: "Simulation", chip: "bg-[#dcf5ec] text-[#0f7a55]", dot: "bg-agent-simulation" },
  narrative: { label: "Narrative", chip: "bg-[#fde8df] text-[#b8481c]", dot: "bg-agent-narrative" },
};

const STATUS_ICON = {
  start: <CircleDot className="size-3.5 text-warn" aria-label="started" />,
  pass: <Check className="size-3.5 text-good" aria-label="pass" />,
  fail: <X className="size-3.5 text-bad" aria-label="fail" />,
  done: <Flag className="size-3.5 text-brand-700" aria-label="done" />,
};

/** Scrolling list of agent:event rows with agent-coloured chips. */
export function AgentTimeline({
  events, className, filter, emptyText = "Agent activity appears here as it happens.",
}: {
  events: StampedEvent[];
  className?: string;
  filter?: (e: StampedEvent) => boolean;
  emptyText?: string;
}) {
  const rows = (filter ? events.filter(filter) : events).slice(-120);
  const box = useRef<HTMLDivElement>(null);
  // Scroll only this list to its newest row. (scrollIntoView would also scroll the
  // whole page, which yanked the screen down on every check while matching.)
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight > el.clientHeight) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [rows.length]);

  return (
    <div ref={box} className={cn("overflow-y-auto overscroll-contain", className)} aria-live="polite">
      {rows.length === 0 && <p className="px-1 py-6 text-center text-sm text-ink-3">{emptyText}</p>}
      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {rows.map((e) => (
            <motion.li
              key={e.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "flex items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] leading-snug",
                e.status === "fail" && "bg-bad-bg/50",
                e.status === "done" && "bg-brand-50",
              )}
            >
              <span className="mt-0.5">{STATUS_ICON[e.status]}</span>
              <span className={cn("mt-px shrink-0 rounded px-1.5 text-[10px] font-bold uppercase tracking-wide", AGENT_META[e.agent].chip)}>
                {AGENT_META[e.agent].label}
              </span>
              <span className={cn("min-w-0 flex-1", e.status === "fail" ? "text-ink-2" : "text-ink")}>
                {e.check && <span className="mr-1.5 rounded bg-canvas px-1 font-mono text-[11px] text-ink-3 ring-1 ring-line">{e.check}</span>}
                {e.message}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
