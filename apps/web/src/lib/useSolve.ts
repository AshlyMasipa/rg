import { useCallback, useMemo, useState } from "react";
import { api } from "./api";
import { useWorld } from "./store";

/**
 * Solve a need and follow its paced constraint trace. Also picks up a solve
 * started on another device (latest constraint run for this need).
 */
export function useSolve(needId: string | null | undefined) {
  const { events } = useWorld();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runId = useMemo(() => {
    if (!needId) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.agent === "constraint" && e.need_id === needId && e.run_id) return e.run_id;
    }
    return null;
  }, [events, needId]);

  const runEvents = useMemo(() => (runId ? events.filter((e) => e.run_id === runId) : []), [events, runId]);
  const done = runEvents.some((e) => e.status === "done");
  const running = busy || (!!runId && !done);

  const solve = useCallback(async () => {
    if (!needId) return;
    setBusy(true); setError(null);
    try {
      await api.solve(needId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [needId]);

  return { runId, runEvents, running, done, solve, error };
}
