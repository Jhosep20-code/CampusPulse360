import type { LiveSnapshot } from "@campuspulse/contracts";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const LIVE: LiveSnapshot = {
  generated_at: 1_700_000_000_000,
  simulated: true,
  kpis: {
    spaces_total: 10,
    spaces_ok: 8,
    spaces_warning: 1,
    spaces_critical: 1,
    spaces_offline: 0,
    occupancy_total: 120,
    capacity_total: 400,
    avg_co2_ppm: 812,
    avg_temp_c: 22,
    power_total_w: 5000,
    open_incidents: 1,
  },
  spaces: [],
};

// Los proveedores reales sondean la API: se sustituyen por un contexto fijo y datos de prueba.
vi.mock("../app/context", async (orig) => {
  const actual = await orig<typeof import("../app/context")>();
  return {
    ...actual,
    AppProviders: ({ children }: { children: ReactNode }) => (
      <actual.LiveContext.Provider value={{ data: LIVE, status: "live", lastUpdated: 1_700_000_000_000 }}>
        {children}
      </actual.LiveContext.Provider>
    ),
  };
});
vi.mock("../hooks/useActiveIncidents", () => ({
  useActiveIncidents: () => ({
    data: [
      {
        id: "inc-1",
        space_id: "sp-1",
        rule_id: null,
        title: "CO2 alto en aula 3",
        status: "open",
        severity: "critical",
        opened_at: 1,
        closed_at: null,
        diagnosis: null,
        diagnosis_meta: null,
      },
    ],
    error: null,
    loading: false,
    reload: () => {},
  }),
}));
vi.mock("../pages/CommandCenter", () => ({ default: () => <p>Mando</p> }));

const { routes } = await import("../app/router");

function setViewport(width: number, height = 640) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
}

function renderAt(path: string, width: number) {
  setViewport(width);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("Vista de reloj", () => {
  afterEach(() => {
    setViewport(1024, 768);
  });

  it("/watch redirige a /reloj", async () => {
    const router = renderAt("/watch", 1200);
    await waitFor(() => expect(router.state.location.pathname).toBe("/reloj"));
    expect(await screen.findByTestId("watch-dial")).toBeInTheDocument();
  });

  it("a 220 px renderiza la esfera sin el marco de vista previa", async () => {
    renderAt("/reloj", 220);
    const dial = await screen.findByTestId("watch-dial");
    expect(dial).toHaveStyle({ width: "220px", height: "220px" });
    expect(screen.queryByTestId("watch-preview-frame")).not.toBeInTheDocument();
    expect(screen.queryByText("Vista previa del reloj")).not.toBeInTheDocument();
    // Controles de cambio de pantalla de al menos 44 px.
    expect(screen.getByRole("button", { name: "Pantalla siguiente" })).toHaveStyle({ width: "44px", height: "44px" });
    expect(screen.getByRole("link", { name: "Volver a la app" })).toBeInTheDocument();
  });

  it("a 1200 px aparece el marco de vista previa con selector de tamano y aviso", async () => {
    renderAt("/reloj", 1200);
    expect(await screen.findByTestId("watch-preview-frame")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vista previa del reloj" })).toBeInTheDocument();
    expect(screen.getByText(/Simulación en navegador; prueba en el reloj físico pendiente/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Volver a la app/ })).toHaveAttribute("href", "/");

    const dial = screen.getByTestId("watch-dial");
    expect(dial).toHaveStyle({ width: "225px" });
    fireEvent.click(screen.getByRole("radio", { name: "40 mm" }));
    expect(screen.getByTestId("watch-dial")).toHaveStyle({ width: "198px" });
    expect(screen.getByRole("radio", { name: "40 mm" })).toHaveAttribute("aria-checked", "true");
  });

  it("cambia entre las 3 pantallas con los botones y muestra estado y SIMULADO", async () => {
    renderAt("/reloj", 220);
    const dial = await screen.findByTestId("watch-dial");
    const d = within(dial);

    expect(d.getByText("SIMULADO")).toBeInTheDocument();
    // Estado critico: anillo + texto (no solo color).
    expect(screen.getByTestId("watch-ring")).toHaveAttribute("data-level", "critical");
    expect(d.getByText("Crítico")).toBeInTheDocument();
    expect(d.getByText("CO2 alto en aula 3")).toBeInTheDocument();
    expect(d.getByLabelText("Alerta más grave (actual)")).toBeInTheDocument();

    fireEvent.click(d.getByRole("button", { name: "Pantalla siguiente" }));
    expect(d.getByText("CO₂ medio")).toBeInTheDocument();
    expect(d.getByText("812")).toBeInTheDocument();

    fireEvent.click(d.getByRole("button", { name: "Pantalla siguiente" }));
    expect(d.getByText("Ocupación")).toBeInTheDocument();
    expect(d.getByText("30 %")).toBeInTheDocument();

    fireEvent.click(d.getByRole("button", { name: "Pantalla siguiente" }));
    expect(d.getByText("Alerta más grave")).toBeInTheDocument();

    fireEvent.click(d.getByRole("button", { name: "Pantalla anterior" }));
    expect(d.getByText("Ocupación")).toBeInTheDocument();
  });

  it("la zona viva es aria-live polite y el deslizamiento cambia de pantalla", async () => {
    renderAt("/reloj", 220);
    const dial = await screen.findByTestId("watch-dial");
    expect(dial.querySelector('[aria-live="polite"]')).not.toBeNull();

    act(() => {
      fireEvent.pointerDown(dial, { clientX: 150 });
      fireEvent.pointerUp(dial, { clientX: 60 });
    });
    expect(within(dial).getByText("CO₂ medio")).toBeInTheDocument();
    fireEvent.keyDown(dial, { key: "ArrowLeft" });
    expect(within(dial).getByText("Alerta más grave")).toBeInTheDocument();
  });
});
