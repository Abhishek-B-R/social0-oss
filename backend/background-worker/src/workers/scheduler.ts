import { Worker, type ConnectionOptions } from "bullmq";
import { JOB_NAMES, QUEUES } from "@social0/shared";
import { runPublishScheduledCron } from "../cron/publish-scheduled.js";
import { runBillingZombieCleanup } from "../cron/billing-zombie-run.js";
import { runRepostCron } from "../cron/repost-run.js";
import { runAutoplugCron } from "../cron/autoplug-run.js";

const CRON_RUNNERS: Record<string, () => Promise<unknown>> = {
  [JOB_NAMES.CRON_PUBLISH_SCHEDULED]: runPublishScheduledCron,
  [JOB_NAMES.CRON_REPOST]: runRepostCron,
  [JOB_NAMES.CRON_AUTOPLUG]: runAutoplugCron,
  [JOB_NAMES.CRON_BILLING_ZOMBIE_CLEANUP]: runBillingZombieCleanup,
};

/**
 * One slot per cron, so no cron waits behind another.
 *
 * With a single slot, publish-scheduled queued behind autoplug and repost,
 * which call X once per row: a slow or stalled run there held every
 * scheduled post (and the lookahead arming that assumes a scan every tick)
 * until it finished. `enqueueCronJob` reuses a cron's job while it is waiting
 * or active, so the publish triggers that arrived meanwhile were dropped.
 */
export const SCHEDULER_CONCURRENCY = Object.keys(CRON_RUNNERS).length;

/** Cron names with a run in progress in this process. */
const running = new Set<string>();

/**
 * Run one scheduler job, at most one per cron name at a time.
 *
 * The slots above are for different crons running side by side, not for two
 * scans of the same one. Each cron has a fixed job id, so the API does not
 * queue a second copy while one is active, but BullMQ can still hand a job
 * out again if its lock lapsed while this process was busy running it. That
 * copy is completed as skipped; the next tick picks up whatever it would have
 * done.
 */
export async function processSchedulerJob(name: string): Promise<unknown> {
  const run = CRON_RUNNERS[name];
  if (!run) {
    console.warn(`[background-worker] unknown scheduler job: ${name}`);
    return { ok: false, error: "unknown_job" };
  }
  if (running.has(name)) {
    console.info(
      `[background-worker] ${name} still running; skipping this trigger`,
    );
    return { ok: true, skipped: "already_running" };
  }
  running.add(name);
  try {
    return await run();
  } finally {
    running.delete(name);
  }
}

/** Background crons only — publish-scheduled, repost, autoplug, Dodo zombie cleanup. */
export function startSchedulerWorker(
  connection: ConnectionOptions,
  concurrency: number = SCHEDULER_CONCURRENCY,
) {
  return new Worker(QUEUES.SCHEDULER, (job) => processSchedulerJob(job.name), {
    connection,
    concurrency,
  });
}
