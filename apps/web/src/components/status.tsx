import { Check, CircleDashed, CircleDot, Clock3, FlagTriangleRight, Handshake, PlayCircle } from "lucide-react";
import { motion } from "motion/react";
import type { NeedStatus } from "shared";
import { cn } from "../lib/utils";

export const STATUS_FLOW: NeedStatus[] = ["Draft", "Unmet", "Matched", "Approved", "Active", "Delivered"];

const STYLE: Record<NeedStatus, { cls: string; icon: typeof Check; hint: string }> = {
  Draft: { cls: "bg-line text-ink-2", icon: CircleDashed, hint: "Not submitted yet" },
  Unmet: { cls: "bg-warn-bg text-warn", icon: Clock3, hint: "Waiting for a match" },
  Matched: { cls: "bg-[#e3eefb] text-[#1c5cab]", icon: CircleDot, hint: "Options found, awaiting approval" },
  Approved: { cls: "bg-[#ebe8fa] text-[#4a3aa7]", icon: Handshake, hint: "Approved by the coordinator" },
  Active: { cls: "bg-brand-100 text-brand-700", icon: PlayCircle, hint: "Sessions running" },
  Delivered: { cls: "bg-brand-700 text-white", icon: FlagTriangleRight, hint: "All sessions delivered" },
};

/** Status is always icon + label, never colour alone. Re-animates when it changes. */
export function StatusPill({ status, className, size = "sm" }: { status: NeedStatus; className?: string; size?: "sm" | "lg" }) {
  const s = STYLE[status];
  const Icon = s.icon;
  return (
    <motion.span
      key={status}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 26 }}
      title={s.hint}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap",
        size === "lg" ? "px-3 py-1 text-sm [&_svg]:size-4" : "px-2.5 py-0.5 text-xs [&_svg]:size-3.5",
        s.cls, className,
      )}
    >
      <Icon aria-hidden />
      {status}
    </motion.span>
  );
}

/** The canonical Draft → … → Delivered flow as a stepper. */
export function StatusFlow({ status, compact = false }: { status: NeedStatus; compact?: boolean }) {
  const idx = STATUS_FLOW.indexOf(status);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto" aria-label={`Status: ${status}`}>
      {STATUS_FLOW.slice(1).map((s, i) => {
        const n = i + 1;
        const done = n < idx;
        const current = n === idx;
        return (
          <li key={s} className="flex items-center gap-1">
            {i > 0 && <span className={cn("h-0.5 w-3 sm:w-6 rounded", done || current ? "bg-brand-500" : "bg-line")} />}
            <span
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap transition-colors",
                current && "border-brand-700 bg-brand-700 text-white",
                done && "border-brand-100 bg-brand-50 text-brand-700",
                !done && !current && "border-line text-ink-3",
              )}
            >
              {done && <Check className="size-3" aria-hidden />}
              {compact && !current ? s.slice(0, 1) : s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
