import { Navigate, Route, Routes } from "react-router";
import { AppShell, HOME } from "./components/AppShell";
import { useRole } from "./lib/role";
import { useWorld } from "./lib/store";
import { lazy, Suspense } from "react";
import { LiveCapture } from "./screens/LiveCapture";
import { MyRequests } from "./screens/MyRequests";
import { ErrorNote, Skeleton } from "./components/bits";

// The coach's phone only downloads the capture flow up front; the map (Leaflet)
// and charts (Recharts) load when a laptop screen first needs them.
const NeedsMap = lazy(() => import("./screens/NeedsMap").then((m) => ({ default: m.NeedsMap })));
const MatchApprove = lazy(() => import("./screens/MatchApprove").then((m) => ({ default: m.MatchApprove })));
const NeedsIndex = lazy(() => import("./screens/MatchApprove").then((m) => ({ default: m.NeedsIndex })));
const Simulator = lazy(() => import("./screens/Simulator").then((m) => ({ default: m.Simulator })));
const Delivery = lazy(() => import("./screens/Delivery").then((m) => ({ default: m.Delivery })));
const Impact = lazy(() => import("./screens/Impact").then((m) => ({ default: m.Impact })));

export function App() {
  const { role } = useRole();
  const { state, loadError } = useWorld();
  return (
    <AppShell>
      {!state && loadError && <ErrorNote className="mb-4">{loadError}</ErrorNote>}
      <Suspense fallback={<Skeleton className="h-96" />}>
      <Routes>
        <Route path="/" element={<Navigate to={HOME[role]} replace />} />
        <Route path="/capture" element={<LiveCapture />} />
        <Route path="/requests" element={<MyRequests />} />
        <Route path="/map" element={<NeedsMap />} />
        <Route path="/needs" element={<NeedsIndex />} />
        <Route path="/needs/:id" element={<MatchApprove />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/delivery" element={<Delivery />} />
        <Route path="/impact" element={<Impact />} />
        <Route path="*" element={<Navigate to={HOME[role]} replace />} />
      </Routes>
      </Suspense>
    </AppShell>
  );
}
