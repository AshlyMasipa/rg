/** Coach: my school's requests, updating live as the coordinator acts on the laptop. */
import { motion } from "motion/react";
import { Inbox, MessageSquarePlus } from "lucide-react";
import { Link } from "react-router";
import { SchoolPicker } from "../components/AppShell";
import { Empty, PageHeader, Skeleton } from "../components/bits";
import { StatusFlow, StatusPill } from "../components/status";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useRole } from "../lib/role";
import { useLookups, useWorld } from "../lib/store";
import { needTitle, needWants, needWhen, timeAgo } from "../lib/utils";

const COACH_COPY = {
  Draft: "Not sent yet.",
  Unmet: "Sent. The coordinator is looking for a field, coach and funding.",
  Matched: "Good news — options found. Waiting for the coordinator to approve one.",
  Approved: "Approved! Your programme is booked.",
  Active: "Sessions are running. Log attendance after each one.",
  Delivered: "All sessions delivered. Well done.",
} as const;

export function MyRequests() {
  const { schoolId } = useRole();
  const { state } = useWorld();
  const L = useLookups();
  if (!state) return <Skeleton className="h-64" />;

  const mine = state.needs.filter((n) => n.school_id === schoolId).sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="My requests" subtitle={<span className="flex items-center gap-2">School <SchoolPicker /></span>} />
      {mine.length === 0 ? (
        <Empty icon={<Inbox />} title="No requests yet">
          <Link to="/capture"><Button className="mt-2"><MessageSquarePlus /> Report a need</Button></Link>
        </Empty>
      ) : (
        <div className="space-y-3">
          {mine.map((n) => {
            const prog = L.programmes.find((p) => p.need?.id === n.id);
            return (
              <motion.div key={n.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{needTitle(n)}</p>
                      <p className="text-sm text-ink-2">{needWhen(n)} · needs {needWants(n)}</p>
                      <p className="text-xs text-ink-3">Sent {timeAgo(n.created_at)}</p>
                    </div>
                    <StatusPill status={n.status} size="lg" />
                  </div>
                  <StatusFlow status={n.status} compact />
                  <p className="text-sm">{COACH_COPY[n.status]}</p>
                  {prog?.bundle && (
                    <div className="rounded-xl bg-brand-50 p-3 text-sm">
                      <b>{L.nameOf(prog.bundle.field_id)}</b> with <b>{L.nameOf(prog.bundle.coach_id)}</b>
                      {prog.bundle.kit_id && <> · {L.nameOf(prog.bundle.kit_id)}</>}
                      <div className="text-ink-2">Starts {prog.assignment.start_date} · funded by {L.nameOf(prog.bundle.sponsor_id)}</div>
                      <div className="mt-1 text-ink-2">{prog.evidence.length} of {prog.assignment.weeks * n.days.length} sessions logged</div>
                    </div>
                  )}
                  {(n.status === "Approved" || n.status === "Active") && (
                    <Link to="/delivery"><Button variant="outline" className="w-full">Log attendance</Button></Link>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
