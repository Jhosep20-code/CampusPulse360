import { app } from "./app";
import type { Env } from "./env";
import { runIncidentBot } from "./engine/incident-bot";
import { runReportBot } from "./engine/report-bot";
import { runCloudSimTick } from "./engine/cloud-sim";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return app.fetch(req, env, ctx);
    }
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response("Not Found", { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = Date.now();
    const run = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        console.error(`cron ${name} fallo`, err);
      }
    };
    if (controller.cron === "* * * * *") {
      // Primero el simulador en la nube (solo si CLOUD_SIM=on y no hay gateway activo) y luego el bot.
      ctx.waitUntil(
        (async () => {
          await run("cloud-sim", () => runCloudSimTick(env, now));
          await run("incident-bot", () => runIncidentBot(env, now));
        })(),
      );
    } else if (controller.cron === "0 12 * * *") {
      ctx.waitUntil(run("report-bot", () => runReportBot(env, now)));
    }
  },
} satisfies ExportedHandler<Env>;
