import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./db";
import { HttpError } from "./problem";

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);
/** /ingest no lleva Origin ni navegador: se autentica solo por HMAC. */
const INGEST_PATH = "/api/v1/ingest";

/** Cabeceras de seguridad en todas las respuestas de la API (incluidos errores). */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
  if (c.env.ENVIRONMENT !== "local") {
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
};

/** Proteccion CSRF: JSON obligatorio y Origin (si existe) igual a WEBAUTHN_ORIGIN. */
export const mutationGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (MUTATING.has(c.req.method) && c.req.path !== INGEST_PATH) {
    const ct = (c.req.header("content-type") ?? "").toLowerCase();
    if (!ct.startsWith("application/json")) {
      throw new HttpError(415, "Content-Type debe ser application/json");
    }
    const origin = c.req.header("origin");
    if (origin !== undefined && origin !== c.env.WEBAUTHN_ORIGIN) {
      throw new HttpError(403, "Origen no permitido");
    }
  }
  await next();
};
