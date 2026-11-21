import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, SchemaError, api, getLive } from "./api";

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cliente de la API", () => {
  it("acepta una respuesta que cumple el esquema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ authenticated: false, role: "visitor", name: null })));
    await expect(api.session()).resolves.toEqual({ authenticated: false, role: "visitor", name: null });
  });

  it("rechaza respuestas fuera de esquema con un error controlado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ authenticated: "si", role: "root" })));
    const err = await api.session().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SchemaError);
    expect((err as SchemaError).status).toBe(502);
  });

  it("convierte problem+json en un Error con el titulo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({ type: "about:blank", title: "Incidencia no encontrada", status: 404, detail: "id inexistente" }, { status: 404, headers: { "Content-Type": "application/problem+json" } }),
      ),
    );
    const err = await api.incident("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Incidencia no encontrada");
    expect((err as ApiError).status).toBe(404);
  });

  it("falla de forma controlada si no hay red", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const err = await api.campus().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
  });

  it("getLive envia If-None-Match y trata 304 como sin cambios", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", f);
    await expect(getLive('"abc"')).resolves.toEqual({ kind: "not-modified" });
    const init = f.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBe('"abc"');
  });
});
