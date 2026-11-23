import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampusContext, LiveContext } from "../app/context";
import { makeCampus } from "../twin/fixtures";

/**
 * Regresion del defecto movil "Error al mostrar la pagina / l is not a function"
 * (Galaxy S25 Ultra). Causa: un useEffect con flecha concisa devolvia el
 * resultado de handle.setWidth() (un Vector3 de three) y React lo trataba como
 * funcion de limpieza. Solo ocurre con una sesion WebXR activa.
 * El handle simulado devuelve deliberadamente un objeto, como three.
 */
const handle = {
  end: vi.fn(async () => {}),
  setWidth: vi.fn(() => ({ x: 1, y: 1, z: 1 }) as unknown as void),
  setColors: vi.fn(),
  setSelected: vi.fn(),
  resetPlacement: vi.fn(),
};
vi.mock("./xrSession", () => ({ startArSession: vi.fn(async () => handle) }));

class Catch extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(e: Error) {
    this.props.onError(e);
  }
  override render() {
    return this.state.failed ? <p>fallo</p> : this.props.children;
  }
}

describe("ARPage con sesion WebXR activa", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "xr", {
      value: { isSessionSupported: vi.fn(async () => true) },
      configurable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200, headers: { "content-type": "model/gltf-binary" } })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "xr");
  });

  it("ampliar, reducir y salir de la pagina no rompen el render", async () => {
    const errors: Error[] = [];
    const ui = render(
      <MemoryRouter>
        <CampusContext.Provider value={{ data: makeCampus(), error: null, loading: false, reload: () => {} }}>
          <LiveContext.Provider value={{ data: null, status: "live", lastUpdated: null }}>
            <Catch onError={(e) => errors.push(e)}>
              <ARPageLazy />
            </Catch>
          </LiveContext.Provider>
        </CampusContext.Provider>
      </MemoryRouter>,
    );
    const startBtn = await screen.findByRole("button", { name: /Iniciar AR/ });
    await waitFor(() => expect(startBtn).toBeEnabled());
    await act(async () => {
      fireEvent.click(startBtn);
    });
    const bigger = await screen.findByRole("button", { name: "Ampliar maqueta" });
    await act(async () => {
      fireEvent.click(bigger);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reducir maqueta" }));
    });
    ui.unmount();
    expect(errors.map((e) => e.message)).toEqual([]);
    expect(handle.setWidth).toHaveBeenCalled();
  });
});

// Import diferido para que el mock de ./xrSession se aplique antes.
const { default: ARPageLazy } = await import("./ARPage");
