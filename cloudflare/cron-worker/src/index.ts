/**
 * Cloudflare Cron → Social0 Fastify `/api/cron/*` (enqueues BullMQ → background-worker).
 *
 * API_BASE_URL must be the **API host** (e.g. https://api.social0.app), not the SPA.
 */
export interface Env {
  CRON_SECRET: string;
  API_BASE_URL: string;
}

const DAILY_JOBS = [
  "repost",
  "autoplug",
  "token-health",
  "billing-zombie-cleanup",
] as const;

async function hitCron(env: Env, job: string): Promise<Response> {
  const base = env.API_BASE_URL.replace(/\/$/, "");
  return fetch(`${base}/api/cron/${job}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      // ponytail: prod Fastify CORS rejects POST without Origin until cors-policy ships
      Origin: "https://social0.app",
    },
  });
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const cron = event.cron;
    const jobs =
      cron === "*/5 * * * *" ? (["publish-scheduled"] as const) : DAILY_JOBS;

    for (const job of jobs) {
      ctx.waitUntil(
        hitCron(env, job).then(async (res) => {
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.error(
              `[social0-cron] ${job} failed`,
              res.status,
              body.slice(0, 300),
            );
          } else {
            console.log(`[social0-cron] ${job} ok`, res.status);
          }
        }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
