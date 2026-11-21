import type { Env } from "./env";
export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM spaces").first<{ n: number }>();
    return Response.json({ spaces: r?.n ?? 0 });
  },
} satisfies ExportedHandler<Env>;
