import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { initialCompareState, reduceCompare } from "./compare";
import { REFERENCE_PRIVACY } from "./constants";
import { ReferencePanel } from "./ReferencePanel";

const noop = () => {};

describe("panel Comparar con fotografia", () => {
  it("ofrece carga local con input file, modos, opacidad, guias y el texto de privacidad", () => {
    const { container } = render(
      <ReferencePanel state={initialCompareState} error={null} narrow={false} onFile={noop} onMode={noop} onOpacity={noop} onGuides={noop} onClear={noop} onExit={noop} />,
    );
    const input = container.querySelector('input[type="file"]');
    expect(input?.getAttribute("accept")).toBe("image/*");
    expect(screen.getByText("Comparar con fotografía")).toBeTruthy();
    expect(screen.getByText(REFERENCE_PRIVACY)).toBeTruthy();
    for (const label of ["Render", "Foto", "Superposición", "Sin guías", "Silueta", "Tercios"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    // Sin foto, Foto y Superposicion y el deslizador estan deshabilitados.
    expect((screen.getByRole("button", { name: "Foto" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
  });

  it("con foto cargada habilita el deslizador 0-100 % y notifica los cambios", () => {
    const onOpacity = vi.fn();
    const onMode = vi.fn();
    const state = reduceCompare(initialCompareState, { type: "load", url: "blob:local/1" });
    render(
      <ReferencePanel state={state} error={null} narrow onFile={noop} onMode={onMode} onOpacity={onOpacity} onGuides={noop} onClear={noop} onExit={noop} />,
    );
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.disabled).toBe(false);
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("100");
    fireEvent.change(slider, { target: { value: "80" } });
    expect(onOpacity).toHaveBeenCalledWith(0.8);
    fireEvent.click(screen.getByRole("button", { name: "Foto" }));
    expect(onMode).toHaveBeenCalledWith("photo");
  });
});
