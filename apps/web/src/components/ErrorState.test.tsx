import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorState, friendlyError, isChunkLoadError } from "./ui";

describe("mensajes de error de produccion", () => {
  it("no muestra instrucciones de desarrollo (wrangler, puertos)", () => {
    render(<ErrorState error={new TypeError("l is not a function")} />);
    expect(screen.queryByText(/wrangler|8787/i)).toBeNull();
    expect(screen.getByText(/error inesperado/i)).toBeInTheDocument();
  });
  it("traduce errores de red y de fragmentos", () => {
    expect(friendlyError(Object.assign(new Error("No se pudo conectar con la API"), { status: 0 }))).toMatch(/conexión/);
    const chunk = new TypeError("Failed to fetch dynamically imported module: /assets/x.js");
    expect(isChunkLoadError(chunk)).toBe(true);
    expect(friendlyError(chunk)).toMatch(/versión nueva/);
  });
});
