import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { Layout } from "./Layout";

function renderLayout(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<p>Contenido del mando</p>} />
          <Route path="incidentes" element={<p>Lista de incidencias</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  it("renderiza el riel lateral con la navegacion principal", () => {
    renderLayout();
    const rail = screen.getByRole("navigation", { name: "Navegación principal" });
    for (const label of ["Mando", "Incidencias", "Asistente", "IoT", "Automatizaciones", "Sistema", "Acceso"]) {
      expect(within(rail).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renderiza la barra inferior con 5 pestanas", () => {
    renderLayout();
    const bar = screen.getByRole("navigation", { name: "Navegación inferior" });
    expect(within(bar).getAllByRole("link")).toHaveLength(4);
    expect(within(bar).getByRole("button", { name: "Más" })).toBeInTheDocument();
  });

  it("muestra la insignia SIMULADO, la conexion y la sesion", () => {
    renderLayout();
    expect(screen.getByText("Simulado")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /Conexión/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sesión/ })).toBeInTheDocument();
  });

  it("renderiza la ruta hija y marca la pestana activa", () => {
    renderLayout("/incidentes");
    expect(screen.getByText("Lista de incidencias")).toBeInTheDocument();
    const rail = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(rail).getByRole("link", { name: "Incidencias" })).toHaveAttribute("aria-current", "page");
  });

  it("la vista de reloj queda dentro de Más (telefono) y apunta a /reloj en el riel", () => {
    renderLayout();
    const bar = screen.getByRole("navigation", { name: "Navegación inferior" });
    expect(within(bar).queryByRole("link", { name: /reloj/i })).not.toBeInTheDocument();
    fireEvent.click(within(bar).getByRole("button", { name: "Más" }));
    const menu = screen.getByRole("dialog", { name: "Más secciones" });
    expect(within(menu).getByRole("link", { name: "Vista de reloj (vista previa)" })).toHaveAttribute("href", "/reloj");
    const rail = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(rail).getByRole("link", { name: "Vista de reloj" })).toHaveAttribute("href", "/reloj");
  });
});
