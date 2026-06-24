import { Worker, type ConnectionOptions } from "bullmq";
import { JOB_NAMES, QUEUES } from "@social0/shared";

export function startSchedulerWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  return new Worker(
    QUEUES.SCHEDULER,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.CRON_PUBLISH_SCHEDULED:
          console.info("[engine] cron publish-scheduled — wire DB scan + publish queue");
          break;
        case JOB_NAMES.CRON_REPOST:
          console.info("[engine] cron repost — wire resurface logic");
          break;
        case JOB_NAMES.CRON_AUTOPLUG:
          console.info("[engine] cron autoplug — wire automation");
          break;
        default:
          console.info(`[engine] scheduler job ${job.name}`);
      }
      return { ok: true };
    },
    { connection, concurrency },
  );
}
