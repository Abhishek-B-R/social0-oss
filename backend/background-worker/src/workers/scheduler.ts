import { Worker, type ConnectionOptions } from "bullmq";
import { JOB_NAMES, QUEUES } from "@social0/shared";
import { runPublishScheduledCron } from "../cron/publish-scheduled.js";
import { runBillingZombieCleanup } from "../cron/billing-zombie-run.js";
import { runRepostCron } from "../cron/repost-run.js";
import { runAutoplugCron } from "../cron/autoplug-run.js";

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
          return runRepostCron();
        case JOB_NAMES.CRON_AUTOPLUG:
          return runAutoplugCron();
        case JOB_NAMES.CRON_BILLING_ZOMBIE_CLEANUP:
          return runBillingZombieCleanup();
        default:
          console.warn(
            `[background-worker] unknown scheduler job: ${job.name}`,
          );
          return { ok: false, error: "unknown_job" };
      }
    },
    { connection, concurrency },
  );
}
