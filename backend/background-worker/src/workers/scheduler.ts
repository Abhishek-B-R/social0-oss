import { Worker, type ConnectionOptions } from "bullmq";
import { JOB_NAMES, QUEUES } from "@social0/shared";
import { runPublishScheduledCron } from "../cron/publish-scheduled.js";

async function runCronHandler(
  importPath: string,
  exportName: string,
): Promise<Record<string, unknown>> {
  const mod = await import(importPath);
  const handler = mod[exportName] as (req: Request) => Promise<Response>;
  const req = new Request("http://worker/internal/cron", {
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
    },
  });
  const res = await handler(req);
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: res.ok, status: res.status };
  }
}

/** Background crons only — publish-scheduled, repost, autoplug, Dodo zombie cleanup. */
export function startSchedulerWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  return new Worker(
    QUEUES.SCHEDULER,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.CRON_PUBLISH_SCHEDULED:
          return runPublishScheduledCron();
        case JOB_NAMES.CRON_REPOST:
          return runCronHandler("../cron/repost-run.js", "GET");
        case JOB_NAMES.CRON_AUTOPLUG:
          return runCronHandler("../cron/autoplug-run.js", "GET");
        case JOB_NAMES.CRON_BILLING_ZOMBIE_CLEANUP:
          return runCronHandler("../cron/billing-zombie-run.js", "GET");
        default:
          console.warn(`[background-worker] unknown scheduler job: ${job.name}`);
          return { ok: false, error: "unknown_job" };
      }
    },
    { connection, concurrency },
  );
}
