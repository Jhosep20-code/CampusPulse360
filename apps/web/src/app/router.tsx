import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { AppProviders } from "./context";
import { Layout } from "./Layout";
import { PageSkeleton } from "../components/ui";
import CommandCenter from "../pages/CommandCenter";

const Incidents = lazy(() => import("../pages/Incidents"));
const IncidentDetail = lazy(() => import("../pages/IncidentDetail"));
const SpaceDetail = lazy(() => import("../pages/SpaceDetail"));
const Iot = lazy(() => import("../pages/Iot"));
const Automations = lazy(() => import("../pages/Automations"));
const Assistant = lazy(() => import("../pages/Assistant"));
const SystemPage = lazy(() => import("../pages/SystemPage"));
const Access = lazy(() => import("../pages/Access"));
const ARPage = lazy(() => import("../ar/ARPage"));
const WatchView = lazy(() => import("../pages/WatchView"));
const NotFound = lazy(() => import("../pages/NotFound"));

function Root() {
  return (
    <AppProviders>
      <Outlet />
    </AppProviders>
  );
}

export const routes = [
  {
    element: <Root />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <CommandCenter /> },
          { path: "incidentes", element: <Incidents /> },
          { path: "incidentes/:id", element: <IncidentDetail /> },
          { path: "espacios/:id", element: <SpaceDetail /> },
          { path: "iot", element: <Iot /> },
          { path: "automatizaciones", element: <Automations /> },
          { path: "asistente", element: <Assistant /> },
          { path: "sistema", element: <SystemPage /> },
          { path: "acceso", element: <Access /> },
          { path: "ar", element: <ARPage /> },
          { path: "*", element: <NotFound /> },
        ],
      },
      // Alias historico: /watch redirige a /reloj.
      { path: "watch", element: <Navigate to="/reloj" replace /> },
      {
        path: "reloj",
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <WatchView />
          </Suspense>
        ),
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
