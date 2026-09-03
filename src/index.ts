import { runFetch } from "./fetch/run";
import { handleWeb } from "./web/router";

export interface Env {
  DB: D1Database;
  GITHUB_TOKEN?: string;
  SITE_URL: string;
  SITE_NAME: string;
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runFetch(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      const last = await env.DB.prepare(
        "SELECT MAX(run_at) AS run_at, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS errors FROM fetch_runs WHERE run_at = (SELECT MAX(run_at) FROM fetch_runs)"
      ).first<{ run_at: string | null; errors: number | null }>();
      return Response.json({ last_run: last?.run_at ?? null, errors: last?.errors ?? 0 });
    }

    return handleWeb(request, env);
  },
} satisfies ExportedHandler<Env>;
