/**
 * Needs & capacity map. Markers react to the constraint agent's live stream:
 *   start → pulsing amber · pass → green · fail → grey with a small ×
 * After a run finishes, the recommended bundle is drawn school → field ← coach.
 */
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { CommunityNeed, OpportunityBundle, WorldState } from "shared";
import type { StampedEvent } from "../lib/store";

export type MarkerState = "idle" | "active" | "pass" | "fail" | "chosen";
type Kind = "school" | "field" | "coach";

const GLYPH: Record<Kind, string> = {
  // tiny inline SVGs so the map needs no icon font or network assets
  school: '<path d="M3 10 12 5l9 5-9 5-9-5Z"/><path d="M7 12v4c3 2 7 2 10 0v-4"/>',
  field: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M3 12h18"/>',
  coach: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
};

function icon(kind: Kind, state: MarkerState, selected: boolean, label?: string, extra = "") {
  const html = `
    <div class="rg-marker rg-${kind} rg-${state} ${selected ? "rg-selected" : ""} ${extra}">
      <span class="rg-ring"></span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[kind]}</svg>
      ${state === "fail" ? '<b class="rg-x">×</b>' : ""}
      ${label && (kind === "school" || state === "chosen" || state === "active") ? `<em class="rg-label">${label}</em>` : ""}
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [34, 34], iconAnchor: [17, 17] });
}

/** Reduce one run's events to a state per marker id. */
export function markerStates(events: StampedEvent[], runId: string | null, bundle?: OpportunityBundle | null) {
  const out = new Map<string, MarkerState>();
  if (!runId) return out;
  const run = events.filter((e) => e.run_id === runId && e.agent === "constraint");
  const done = run.some((e) => e.status === "done");
  const seenPass = new Set<string>();
  for (const e of run) {
    if (!e.ref_id || e.status === "done" || e.status === "start") continue;
    if (e.status === "pass") { seenPass.add(e.ref_id); out.set(e.ref_id, "pass"); }
    else if (!seenPass.has(e.ref_id)) out.set(e.ref_id, "fail");
  }
  const last = [...run].reverse().find((e) => e.ref_id && e.status !== "done");
  if (!done && last?.ref_id) out.set(last.ref_id, "active");
  if (done && bundle) { out.set(bundle.field_id, "chosen"); out.set(bundle.coach_id, "chosen"); }
  return out;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length) map.flyToBounds(L.latLngBounds(points), { padding: [70, 70], maxZoom: 15, duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/** Leaflet measures its container once; re-measure when the layout changes. */
function Resizer() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export function SolveMap({
  state, needs, selectedNeedId, onSelectNeed, markers, bundle, className,
}: {
  state: WorldState;
  needs: CommunityNeed[];
  selectedNeedId?: string | null;
  onSelectNeed?: (needId: string) => void;
  markers: Map<string, MarkerState>;
  bundle?: OpportunityBundle | null;
  className?: string;
}) {
  const all = useMemo<[number, number][]>(
    () => [
      ...state.schools.map((s) => [s.lat, s.lng] as [number, number]),
      ...state.fields.map((f) => [f.lat, f.lng] as [number, number]),
      ...state.coaches.map((c) => [c.home_lat, c.home_lng] as [number, number]),
    ],
    [state.schools, state.fields, state.coaches],
  );

  const selectedNeed = needs.find((n) => n.id === selectedNeedId);
  const school = selectedNeed && state.schools.find((s) => s.id === selectedNeed.school_id);
  const field = bundle && state.fields.find((f) => f.id === bundle.field_id);
  const coach = bundle && state.coaches.find((c) => c.id === bundle.coach_id);
  // After a match is found, zoom in on the bundle: school → field ← coach.
  const points: [number, number][] =
    school && field && coach ? [[school.lat, school.lng], [field.lat, field.lng], [coach.home_lat, coach.home_lng]] : all;

  return (
    <div className={className}>
      <MapContainer center={[-26.22, 28.02]} zoom={12} scrollWheelZoom className="h-full w-full rounded-2xl" attributionControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
        />
        <FitBounds points={points} />
        <Resizer />

        {school && field && (
          <Polyline positions={[[school.lat, school.lng], [field.lat, field.lng]]} pathOptions={{ color: "#0d4f3c", weight: 3, dashArray: "6 6" }} />
        )}
        {coach && field && (
          <Polyline positions={[[coach.home_lat, coach.home_lng], [field.lat, field.lng]]} pathOptions={{ color: "#f5b83d", weight: 3, dashArray: "2 6" }} />
        )}

        {state.schools.map((s) => {
          const schoolNeeds = needs.filter((n) => n.school_id === s.id);
          const open = schoolNeeds.find((n) => n.status === "Unmet" || n.status === "Matched");
          const target = open ?? schoolNeeds[schoolNeeds.length - 1];
          return (
            <Marker
              key={s.id}
              position={[s.lat, s.lng]}
              icon={icon("school", markers.get(s.id) ?? "idle", s.id === school?.id, s.name, open ? "rg-open" : "")}
              eventHandlers={{ click: () => target && onSelectNeed?.(target.id) }}
            >
              <Tooltip direction="top" offset={[0, -14]}>
                <b>{s.name}</b>
                <br />
                {schoolNeeds.length ? schoolNeeds.map((n) => `${n.participants} ${n.age_group} ${n.gender} · ${n.status}`).join(" / ") : "No requests yet"}
              </Tooltip>
            </Marker>
          );
        })}
        {state.fields.map((f) => (
          <Marker key={f.id} position={[f.lat, f.lng]} icon={icon("field", markers.get(f.id) ?? "idle", false, f.name)}>
            <Tooltip direction="top" offset={[0, -14]}>
              <b>{f.name}</b><br />Capacity {f.capacity} · R{f.cost_per_session}/session<br />
              {f.availability.map((w) => `${w.day} ${w.start}–${w.end}`).join(", ")}
            </Tooltip>
          </Marker>
        ))}
        {state.coaches.map((c) => (
          <Marker key={c.id} position={[c.home_lat, c.home_lng]} icon={icon("coach", markers.get(c.id) ?? "idle", false, `Coach ${c.name}`)}>
            <Tooltip direction="top" offset={[0, -14]}>
              <b>Coach {c.name}</b><br />{c.credentials.join(" · ")}<br />
              {c.availability.map((w) => `${w.day} ${w.start}–${w.end}`).join(", ")} · travels ≤ {c.max_travel_km} km
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
