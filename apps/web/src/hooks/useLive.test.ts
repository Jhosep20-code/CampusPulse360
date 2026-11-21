import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLive } from "./useLive";

const snapshot = {
  generated_at: 1_700_000_000_000,
  simulated: true,
  kpis: {
    spaces_total: 1,
    spaces_ok: 1,
    spaces_warning: 0,
    spaces_critical: 0,
    spaces_offline: 0,
    occupancy_total: 10,
    capacity_total: 40,
    avg_co2_ppm: 600,
    avg_temp_c: 22,
    power_total_w: 1000,
    open_incidents: 0,
  },
  spaces: [],
};

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setHidden(false);
});

describe("useLive", () => {
  it("pausa el sondeo mientras document.hidden", async () => {
    setHidden(true);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    renderHook(() => useLive(10_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("consulta al instante cuando la pestana esta visible y usa ETag despues", async () => {
    setHidden(false);
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200, headers: { ETag: '"v1"', "Content-Type": "application/json" } }))
      .mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", f);
    const { result } = renderHook(() => useLive(10_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("live");
    expect(result.current.data?.kpis.spaces_total).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(f).toHaveBeenCalledTimes(2);
    const init = f.mock.calls[1]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBe('"v1"');
    expect(result.current.status).toBe("live");
    expect(result.current.data?.kpis.spaces_total).toBe(1);
  });

  it("pasa a reconectando y luego sin conexion tras fallos consecutivos", async () => {
    setHidden(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const { result } = renderHook(() => useLive(10_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("reconnecting");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000 + 4_000);
    });
    expect(result.current.status).toBe("offline");
  });
});
