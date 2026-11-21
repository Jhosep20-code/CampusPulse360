import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { sha256Hex } from "../src/lib/hmac";
import { SPACE_TEST, api, assignTestGateway, sessionCookie } from "./helpers";

beforeAll(async () => {
  await assignTestGateway();
});

describe("control de acceso", () => {
  it("POST /scenarios sin sesion -> 401", async () => {
    const res = await api("/scenarios/normalizar", { method: "POST" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("GET /auth/session sin sesion devuelve visitor", async () => {
    const res = await api("/auth/session");
    expect(await res.json()).toEqual({ authenticated: false, role: "visitor", name: null });
  });

  it("un operador no puede usar endpoints de admin (403) y GET /auth/session lo reconoce", async () => {
    const { cookie } = await sessionCookie("operator");
    const sc = await api("/scenarios/normalizar", { method: "POST", cookie });
    expect(sc.status).toBe(403);
    const rule = await api("/rules/RULE_CO2_HIGH", { method: "PATCH", cookie, json: { enabled: false } });
    expect(rule.status).toBe(403);
    const info = (await (await api("/auth/session", { cookie })).json()) as { authenticated: boolean; role: string };
    expect(info).toMatchObject({ authenticated: true, role: "operator" });
  });

  it("un admin supera la autorizacion de /scenarios (no 401/403)", async () => {
    const { cookie } = await sessionCookie("admin");
    const res = await api("/scenarios/escenario-inexistente", { method: "POST", cookie });
    expect(res.status).toBe(404);
  });

  it("un admin puede modificar una regla y queda en auditoria", async () => {
    const { cookie, userId } = await sessionCookie("admin");
    const res = await api("/rules/RULE_CO2_HIGH", { method: "PATCH", cookie, json: { threshold: 1300 } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { threshold: number }).threshold).toBe(1300);
    const row = await env.DB.prepare("SELECT action FROM audit_log WHERE actor = ? AND action = 'rule.update'")
      .bind(userId)
      .first();
    expect(row).not.toBeNull();
    const bad = await api("/rules/RULE_CO2_HIGH", { method: "PATCH", cookie, json: {} });
    expect(bad.status).toBe(400);
  });

  it("una sesion caducada o con token falso no autentica", async () => {
    const res = await api("/scenarios/normalizar", { method: "POST", cookie: "cp_session=" + "a".repeat(43) });
    expect(res.status).toBe(401);
  });

  it("logout borra la sesion", async () => {
    const { cookie } = await sessionCookie("operator");
    const out = await api("/auth/logout", { method: "POST", cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("cp_session=");
    const after = (await (await api("/auth/session", { cookie })).json()) as { authenticated: boolean };
    expect(after.authenticated).toBe(false);
  });
});

describe("incidencias", () => {
  it("PATCH de operador reconoce la incidencia, agrega evento y audita; resolver fija closed_at", async () => {
    const { cookie, userId } = await sessionCookie("operator");
    const incId = `inc_test_${crypto.randomUUID().replace(/-/g, "")}`;
    await env.DB.prepare(
      `INSERT INTO incidents (id, space_id, rule_id, title, status, severity, opened_at, dedup_key)
       VALUES (?, ?, NULL, 'CO2 elevado (prueba)', 'open', 'warning', ?, ?)`,
    )
      .bind(incId, SPACE_TEST, Date.now(), `test:${incId}`)
      .run();

    const list = await api(`/incidents?status=open&space_id=${SPACE_TEST}`);
    expect(list.status).toBe(200);
    const items = ((await list.json()) as { items: { id: string; diagnosis: unknown }[] }).items;
    expect(items.find((i) => i.id === incId)?.diagnosis).toBeNull();

    const ack = await api(`/incidents/${incId}`, { method: "PATCH", cookie, json: { status: "acknowledged", comment: "en revision" } });
    expect(ack.status).toBe(200);
    const detail = (await ack.json()) as {
      incident: { status: string };
      events: { kind: string; detail: string | null; actor: string }[];
    };
    expect(detail.incident.status).toBe("acknowledged");
    expect(detail.events.some((e) => e.kind === "acknowledged" && e.detail === "en revision")).toBe(true);

    const audit = await env.DB.prepare("SELECT 1 AS x FROM audit_log WHERE actor = ? AND action = 'incident.acknowledged' AND target = ?")
      .bind(userId, incId)
      .first();
    expect(audit).not.toBeNull();

    const dup = await api(`/incidents/${incId}`, { method: "PATCH", cookie, json: { status: "acknowledged" } });
    expect(dup.status).toBe(409);

    const res = await api(`/incidents/${incId}`, { method: "PATCH", cookie, json: { status: "resolved" } });
    expect(res.status).toBe(200);
    const done = (await res.json()) as { incident: { status: string; closed_at: number | null } };
    expect(done.incident.status).toBe("resolved");
    expect(done.incident.closed_at).not.toBeNull();

    const get = await api(`/incidents/${incId}`);
    expect(((await get.json()) as { events: unknown[] }).events).toHaveLength(2);
  });

  it("PATCH sin sesion -> 401, incidencia inexistente -> 404, cuerpo invalido -> 400", async () => {
    expect((await api("/incidents/inc_x", { method: "PATCH", json: { status: "resolved" } })).status).toBe(401);
    const { cookie } = await sessionCookie("operator");
    expect((await api("/incidents/inc_no_existe", { method: "PATCH", cookie, json: { status: "resolved" } })).status).toBe(404);
    expect((await api("/incidents/inc_x", { method: "PATCH", cookie, json: { status: "borrar" } })).status).toBe(400);
  });
});

describe("registro de passkeys", () => {
  it("register/options con token incorrecto -> 403", async () => {
    const res = await api("/auth/passkey/register/options", {
      method: "POST",
      json: { bootstrap_token: "token-equivocado", name: "Intruso", role: "admin" },
    });
    expect(res.status).toBe(403);
  });

  it("register/options con el token correcto -> 200 con challenge", async () => {
    const res = await api("/auth/passkey/register/options", {
      method: "POST",
      json: { bootstrap_token: "test-bootstrap-token", name: "Admin Prueba", role: "admin" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challenge_id: string; options: { challenge: string; rp: { id: string } } };
    expect(body.challenge_id).toMatch(/^chl_/);
    expect(body.options.challenge.length).toBeGreaterThan(10);
    expect(body.options.rp.id).toBe("localhost");
    const row = await env.DB.prepare("SELECT kind, expires_at FROM auth_challenges WHERE id = ?").bind(body.challenge_id).first<{
      kind: string;
      expires_at: number;
    }>();
    expect(row?.kind).toBe("register");
    expect(row!.expires_at).toBeGreaterThan(Date.now());
  });

  it("register/verify con desafio inexistente -> 400 y login/options -> 200", async () => {
    const res = await api("/auth/passkey/register/verify", {
      method: "POST",
      json: { challenge_id: "chl_inexistente", response: { id: "a", rawId: "a", type: "public-key", response: {} } },
    });
    expect(res.status).toBe(400);
    const lo = await api("/auth/passkey/login/options", { method: "POST", json: {} });
    expect(lo.status).toBe(200);
    expect(((await lo.json()) as { options: { challenge: string } }).options.challenge).toBeTruthy();
  });

  it("un token de arranque ya usado se rechaza con 403 (ultima prueba: toca bootstrap_tokens)", async () => {
    const hash = await sha256Hex("test-bootstrap-token");
    await env.DB.prepare("INSERT INTO bootstrap_tokens (token_hash, role, expires_at, used_at) VALUES (?, 'admin', ?, ?)")
      .bind(hash, Date.now(), Date.now())
      .run();
    try {
      const res = await api("/auth/passkey/register/options", {
        method: "POST",
        json: { bootstrap_token: "test-bootstrap-token", name: "Otro", role: "operator" },
      });
      expect(res.status).toBe(403);
    } finally {
      await env.DB.prepare("DELETE FROM bootstrap_tokens WHERE token_hash = ?").bind(hash).run();
    }
  });
});

describe("proteccion CSRF y limites", () => {
  it("POST mutante con Origin ajeno -> 403", async () => {
    const res = await api("/ai/chat", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      json: { message: "hola" },
    });
    expect(res.status).toBe(403);
  });

  it("POST sin Content-Type JSON -> 415", async () => {
    const res = await api("/ai/chat", { method: "POST", headers: { "content-type": "text/plain" }, body: "hola" });
    expect(res.status).toBe(415);
  });

  it("POST con Origin propio pasa la guardia", async () => {
    const res = await api("/auth/passkey/login/options", {
      method: "POST",
      headers: { origin: "http://localhost:5173" },
      json: {},
    });
    expect(res.status).toBe(200);
  });

  it("la 7.a peticion de chat en un minuto -> 429 con Retry-After", async () => {
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 7; i++) {
      last = await api("/ai/chat", { method: "POST", json: { message: "estado del campus" } });
      statuses.push(last.status);
      if (i < 6) await last.arrayBuffer();
    }
    expect(statuses[6]).toBe(429);
    expect(statuses.slice(0, 6).every((s) => s !== 429)).toBe(true);
    expect(last!.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});
