/**
 * World state for every screen. REST is the source of truth; the socket only
 * tells us *when* to refresh (and carries the live agent/report streams).
 * On every (re)connect we refetch GET /api/state — never trust socket state alone.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentEvent, CommunityNeed, ImpactSummary, OpportunityBundle, WorldState } from "shared";
import { api } from "./api";
import { socket } from "./socket";

export type StampedEvent = AgentEvent & { key: number; at: number };

interface Store {
  state: WorldState | null;
  impact: ImpactSummary | null;
  events: StampedEvent[];
  connected: boolean;
  loadError: string | null;
  /** bumps on every demo reset so screens can clear local UI state */
  resetCount: number;
  refresh: () => Promise<void>;
  clearEvents: () => void;
}

const Ctx = createContext<Store | null>(null);
const MAX_EVENTS = 300;

export function WorldProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorldState | null>(null);
  const [impact, setImpact] = useState<ImpactSummary | null>(null);
  const [events, setEvents] = useState<StampedEvent[]>([]);
  const [connected, setConnected] = useState(socket.connected);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([api.state(), api.impact()]);
      setState(s);
      setImpact(i);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  /** Coalesce bursts of socket events into one refetch. */
  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), 120);
  }, [refresh]);

  useEffect(() => {
    void refresh();

    const onConnect = () => { setConnected(true); void refresh(); };
    const onDisconnect = () => setConnected(false);
    const onAgent = (e: AgentEvent) =>
      setEvents((prev) => {
        const next = [...prev, { ...e, key: ++seq.current, at: Date.now() }];
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      });
    const onNeed = (need: CommunityNeed) => {
      // Patch immediately so the phone flips status without waiting for the refetch.
      setState((s) => {
        if (!s) return s;
        const exists = s.needs.some((n) => n.id === need.id);
        return { ...s, needs: exists ? s.needs.map((n) => (n.id === need.id ? need : n)) : [...s.needs, need] };
      });
      scheduleRefresh();
    };
    const onBundles = (p: { need_id: string; bundles: OpportunityBundle[] }) => {
      setState((s) => (s ? { ...s, bundles: [...s.bundles.filter((b) => b.need_id !== p.need_id), ...p.bundles] } : s));
      scheduleRefresh();
    };
    const onReset = () => {
      setEvents([]);
      setResetCount((n) => n + 1);
      void refresh();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("agent:event", onAgent);
    socket.on("need:updated", onNeed);
    socket.on("bundles:proposed", onBundles);
    socket.on("demo:reset", onReset);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("agent:event", onAgent);
      socket.off("need:updated", onNeed);
      socket.off("bundles:proposed", onBundles);
      socket.off("demo:reset", onReset);
    };
  }, [refresh, scheduleRefresh]);

  const value = useMemo<Store>(
    () => ({ state, impact, events, connected, loadError, resetCount, refresh, clearEvents: () => setEvents([]) }),
    [state, impact, events, connected, loadError, resetCount, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorld() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorld must be used inside <WorldProvider>");
  return v;
}

/** Lookup helpers derived from world state. */
export function useLookups() {
  const { state } = useWorld();
  return useMemo(() => {
    const by = <T extends { id: string }>(xs: T[] | undefined) => new Map((xs ?? []).map((x) => [x.id, x]));
    const schools = by(state?.schools);
    const fields = by(state?.fields);
    const coaches = by(state?.coaches);
    const kits = by(state?.kits);
    const transport = by(state?.transport);
    const sponsors = by(state?.sponsors);
    const needs = by(state?.needs);
    const bundles = by(state?.bundles);
    const assignments = by(state?.assignments);
    const nameOf = (id: string | null | undefined): string => {
      if (!id) return "—";
      return (
        schools.get(id)?.name ?? fields.get(id)?.name ??
        (coaches.get(id) ? `Coach ${coaches.get(id)!.name}` : undefined) ??
        kits.get(id)?.description ?? transport.get(id)?.provider ?? sponsors.get(id)?.sponsor ?? id
      );
    };
    /** assignment → bundle → need, for delivery and impact views */
    const programmes = (state?.assignments ?? []).map((a) => {
      const bundle = bundles.get(a.bundle_id);
      const need = bundle ? needs.get(bundle.need_id) : undefined;
      const evidence = (state?.evidence ?? [])
        .filter((e) => e.assignment_id === a.id)
        .sort((x, y) => x.session_date.localeCompare(y.session_date));
      return { assignment: a, bundle, need, school: need ? schools.get(need.school_id) : undefined, evidence };
    });
    return { schools, fields, coaches, kits, transport, sponsors, needs, bundles, assignments, nameOf, programmes };
  }, [state]);
}
