/**
 * Seeded role switcher: shows governance (who may do what) without auth.
 * Stored per device, so the phone stays "Coach" and the laptop "Coordinator".
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "coach" | "coordinator" | "sponsor";

export const ROLES: { id: Role; label: string; who: string }[] = [
  { id: "coach", label: "Coach", who: "Coach Thandi · reports needs, logs attendance" },
  { id: "coordinator", label: "Coordinator", who: "Gauteng provincial coordinator · approves matches" },
  { id: "sponsor", label: "Sponsor / SA Rugby", who: "Sees aggregate impact only" },
];

interface RoleCtx {
  role: Role;
  setRole: (r: Role) => void;
  schoolId: string;
  setSchoolId: (id: string) => void;
}

const Ctx = createContext<RoleCtx | null>(null);

function read(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode: fine */ }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const url = new URLSearchParams(location.search);
  const valid = (r: string | null): r is Role => r === "coach" || r === "coordinator" || r === "sponsor";
  const [role, setRoleState] = useState<Role>(() => {
    const fromUrl = url.get("role");
    if (valid(fromUrl)) return fromUrl;
    const stored = read("rg.role", matchMedia("(max-width: 640px)").matches ? "coach" : "coordinator");
    return valid(stored) ? stored : "coordinator";
  });
  const [schoolId, setSchoolIdState] = useState(url.get("school") ?? read("rg.school", "school-thabo"));

  useEffect(() => write("rg.role", role), [role]);
  useEffect(() => write("rg.school", schoolId), [schoolId]);

  return (
    <Ctx.Provider value={{ role, setRole: setRoleState, schoolId, setSchoolId: setSchoolIdState }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRole() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRole must be used inside <RoleProvider>");
  return v;
}
