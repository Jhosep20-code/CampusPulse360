import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ADMIN_STATE = resolve(here, ".auth/admin.json");

/**
 * Crea una sesion de administrador SOLO DE PRUEBA en el D1 local del contenedor
 * (via `docker compose exec`). El token es aleatorio por ejecucion y nunca sale
 * del entorno local de pruebas.
 */
export default async function globalSetup(): Promise<void> {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:8787";
  // Contra un entorno remoto (p. ej. produccion) NUNCA se crean sesiones: solo pruebas de visitante.
  const host = new URL(base).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    mkdirSync(dirname(ADMIN_STATE), { recursive: true });
    writeFileSync(ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }
  // Espera a que la API responda (el stack puede estar arrancando).
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/api/v1/system/health`);
      if (r.ok) break;
    } catch {
      /* reintento */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  const sql =
    `INSERT OR IGNORE INTO users (id,name,role,created_at) VALUES ('usr_e2e_admin','Admin e2e (prueba)','admin',${now}); ` +
    `INSERT INTO sessions (id_hash,user_id,expires_at,created_at) VALUES ('${hash}','usr_e2e_admin',${now + 3_600_000},${now});`;
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "api", "./node_modules/.bin/wrangler", "d1", "execute", "campuspulse-db", "--local", "--command", sql],
    { cwd: resolve(here, "../.."), stdio: "pipe" },
  );
  const url = new URL(base);
  mkdirSync(dirname(ADMIN_STATE), { recursive: true });
  writeFileSync(
    ADMIN_STATE,
    JSON.stringify({
      cookies: [
        { name: "cp_session", value: token, domain: url.hostname, path: "/", expires: Math.floor(now / 1000) + 3600, httpOnly: true, secure: url.protocol === "https:", sameSite: "Strict" },
      ],
      origins: [],
    }),
  );
}
