import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { authRoutes } from "./auth/passkeys";
import type { AppEnv } from "./lib/db";
import { HttpError, problemResponse } from "./lib/problem";
import { mutationGuard, securityHeaders } from "./lib/security";
import { incidentRoutes } from "./routes/incidents";
import { ingestRoutes } from "./routes/ingest";
import { opsRoutes } from "./routes/ops";
import { publicRoutes } from "./routes/public";
import { systemRoutes } from "./routes/system";

export const app = new Hono<AppEnv>();

app.use("/api/*", securityHeaders);
app.use("/api/*", mutationGuard);

app.route("/api/v1", ingestRoutes);
app.route("/api/v1", publicRoutes);
app.route("/api/v1", incidentRoutes);
app.route("/api/v1", opsRoutes);
app.route("/api/v1", systemRoutes);
app.route("/api/v1/auth", authRoutes);

app.notFound(() => problemResponse(404, "No encontrado", "Ruta de API desconocida"));

app.onError((err) => {
  if (err instanceof HttpError) {
    return problemResponse(err.status, err.message, err.detail, err.errors, err.headers);
  }
  if (err instanceof ZodError) {
    return problemResponse(
      400,
      "Solicitud invalida",
      "La validacion de la entrada fallo",
      err.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    );
  }
  if (err instanceof HTTPException) {
    return problemResponse(err.status, err.message || "Error");
  }
  // Nunca se devuelven detalles internos al cliente.
  console.error("error no controlado", err);
  return problemResponse(500, "Error interno");
});
