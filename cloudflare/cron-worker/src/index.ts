/**
 * Cloudflare Cron → Social0 Fastify `/api/cron/*` (enqueues BullMQ → background-worker).
 *
 * API_BASE_URL must be the **API host** (e.g. https://api.social0.app), not the SPA.
 */
export interface Env {
  CRON_SECRET: string;
  API_BASE_URL: string;
}

const CRON_JOBS: Record<string, readonly string[]> = {
  "*/5 * * * *": ["publish-scheduled", "autoplug"],
  "*/10 * * * *": ["repost"],
  "0 6 * * *": ["token-health", "billing-zombie-cleanup"],
};

async function hitCron(env: Env, job: string): Promise<Response> {
  const base = env.API_BASE_URL?.replace(/\/$/, "");
  if (!base || !env.CRON_SECRET) {
    throw new Error("API_BASE_URL and CRON_SECRET must be set");
  }
  return fetch(`${base}/api/cron/${job}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const jobs = CRON_JOBS[controller.cron];
    if (!jobs) {
      console.error(`[social0-cron] unknown schedule: ${controller.cron}`);
      return;
    }

    for (const job of jobs) {
      ctx.waitUntil(
        hitCron(env, job)
          .then(async (res) => {
            if (!res.ok) {
              const body = await res.text().catch(() => "");
              console.error(
                `[social0-cron] ${job} failed`,
                res.status,
                body.slice(0, 300),
              );
              return;
            }
            console.log(`[social0-cron] ${job} ok`, res.status);
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[social0-cron] ${job} error`, msg);
          }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
