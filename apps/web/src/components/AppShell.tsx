import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3, ClipboardCheck, FlaskConical, Inbox, Map as MapIcon, MessageSquarePlus, RotateCcw,
  Settings2, SlidersHorizontal, Sparkles, Split, Wifi, WifiOff, X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { api, type AiMode } from "../lib/api";
import { ROLES, useRole, type Role } from "../lib/role";
import { useWorld } from "../lib/store";
import { cn } from "../lib/utils";
import { SyntheticBadge } from "./bits";
import { Button } from "./ui/button";
import { Select } from "./ui/input";

type NavItem = { to: string; label: string; icon: ReactNode };
export const NAV: Record<Role, NavItem[]> = {
  coach: [
    { to: "/capture", label: "Report a need", icon: <MessageSquarePlus /> },
    { to: "/requests", label: "My requests", icon: <Inbox /> },
    { to: "/delivery", label: "Attendance", icon: <ClipboardCheck /> },
  ],
  coordinator: [
    { to: "/map", label: "Map", icon: <MapIcon /> },
    { to: "/needs", label: "Match & approve", icon: <Split /> },
    { to: "/simulator", label: "Simulator", icon: <SlidersHorizontal /> },
    { to: "/delivery", label: "Delivery", icon: <ClipboardCheck /> },
    { to: "/impact", label: "Impact", icon: <BarChart3 /> },
  ],
  sponsor: [{ to: "/impact", label: "Impact", icon: <BarChart3 /> }],
};
export const HOME: Record<Role, string> = { coach: "/capture", coordinator: "/map", sponsor: "/impact" };

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2 font-extrabold tracking-tight text-brand-700">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className="hidden text-lg min-[400px]:inline">Rugby<span className="text-ink">Grid</span></span>
    </NavLink>
  );
}

const SHORT: Record<Role, string> = { coach: "Coach", coordinator: "Coord.", sponsor: "Sponsor" };

function RoleSwitcher() {
  const { role, setRole } = useRole();
  const nav = useNavigate();
  return (
    <div role="radiogroup" aria-label="Act as" className="flex shrink-0 rounded-xl bg-canvas p-1 ring-1 ring-line">
      {ROLES.map((r) => (
        <button
          key={r.id}
          role="radio"
          aria-checked={role === r.id}
          title={r.who}
          onClick={() => { setRole(r.id); nav(HOME[r.id]); }}
          className={cn(
            "relative whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors sm:text-[13px]",
            role === r.id ? "text-white" : "text-ink-2 hover:text-ink",
          )}
        >
          {role === r.id && <motion.span layoutId="role-pill" className="absolute inset-0 rounded-lg bg-brand-700" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
          <span className="relative"><span className="xl:hidden">{SHORT[r.id]}</span><span className="hidden xl:inline">{r.label}</span></span>
        </button>
      ))}
    </div>
  );
}

/** Demo controls: AI mode, demo reset. Lives behind a gear so it stays out of the pitch. */
function DemoMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AiMode | null>(null);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.aiHealth>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { refresh } = useWorld();
  const { role } = useRole();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api.aiHealth().then((h) => { setHealth(h); setMode(h.mode); }).catch(() => setMsg("Server unreachable"));
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setMsg(null);
    try { await fn(); await refresh(); setMsg(`${label}: done`); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" aria-label="Demo settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Settings2 />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-[1200] mt-2 w-72 rounded-2xl border border-line bg-surface p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">Demo controls</p>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-ink-3 hover:text-ink"><X className="size-4" /></button>
            </div>

            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">AI mode</p>
            <div className="mb-1 flex gap-2">
              {(["mock", "live"] as AiMode[]).map((m) => (
                <Button
                  key={m} size="sm" variant={mode === m ? "default" : "outline"} className="flex-1"
                  disabled={!!busy}
                  onClick={() => run(`AI ${m}`, async () => setMode((await api.setAiMode(m)).mode))}
                >
                  {m === "live" ? <Sparkles /> : <FlaskConical />} {m}
                </Button>
              ))}
            </div>
            {health && (
              <p className="mb-3 text-[11px] leading-snug text-ink-3">
                Model {health.model ?? "—"} · key {health.key_present ? "present" : <b className="text-bad">missing</b>}
                {!health.key_present && mode === "live" && " (live will fall back to rules)"}
              </p>
            )}

            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Reset demo</p>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("Reset to fresh", async () => { await api.reset("fresh"); navigate(HOME[role]); })}>
                <RotateCcw /> Fresh start
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("Jump to 8 weeks later", async () => { await api.reset("eight-weeks-later"); navigate(role === "coach" ? "/delivery" : "/impact"); })}>
                <RotateCcw /> Eight weeks later
              </Button>
            </div>
            {msg && <p className="mt-3 text-xs text-ink-2">{busy ? "…" : msg}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SchoolPicker() {
  const { role, schoolId, setSchoolId } = useRole();
  const { state } = useWorld();
  if (role !== "coach" || !state) return null;
  return (
    <Select aria-label="Your school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className="h-9 w-auto rounded-lg py-0 text-sm font-semibold">
      {state.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </Select>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role } = useRole();
  const { connected, loadError, state } = useWorld();
  const loc = useLocation();
  const items = NAV[role];
  const wide = role !== "coach";

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-[1100] border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
          <Logo />
          <nav className="ml-4 hidden min-w-0 items-center gap-1 lg:flex" aria-label="Main">
            {items.map((i) => (
              <NavLink
                key={i.to} to={i.to}
                className={({ isActive }) => cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium [&_svg]:size-4",
                  isActive ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:text-ink",
                )}
              >
                {i.icon}{i.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span
              className={cn("hidden items-center gap-1 whitespace-nowrap text-xs font-medium sm:flex", connected ? "text-good" : "text-bad")}
              title={connected ? "Live updates connected" : "Reconnecting…"}
            >
              {connected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
              {connected ? "Live" : "Offline"}
            </span>
            <RoleSwitcher />
            <DemoMenu />
          </div>
        </div>
        {(!connected || loadError) && state && (
          <div className="bg-warn-bg px-4 py-1 text-center text-xs font-medium text-warn">
            Reconnecting to the server… changes will appear when the connection is back.
          </div>
        )}
      </header>

      <main key={role} className={cn("mx-auto w-full flex-1 px-4 pt-4 pb-24 lg:pb-10", wide ? "max-w-[1400px]" : "max-w-3xl")}>
        {children}
        <footer className="mt-10 flex flex-wrap items-center justify-center gap-2 text-center text-[11px] text-ink-3">
          <SyntheticBadge />
          <span>Integrations with SA Rugby and sponsor systems are proposed, not live. Counts only — no player names are stored.</span>
        </footer>
      </main>

      {/* phone tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-md justify-around">
          {items.map((i) => {
            const active = loc.pathname.startsWith(i.to);
            return (
              <NavLink key={i.to} to={i.to} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium [&_svg]:size-5", active ? "text-brand-700" : "text-ink-3")}>
                {i.icon}{i.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
