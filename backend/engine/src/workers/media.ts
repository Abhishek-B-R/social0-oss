import { Worker, type ConnectionOptions } from "bullmq";
import { JOB_NAMES, QUEUES, type MediaConfirmJob } from "@social0/shared";

export function startMediaWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  return new Worker<MediaConfirmJob>(
    QUEUES.MEDIA,
    async (job) => {
      console.info(
        `[engine] media.confirm mediaId=${job.data.mediaId} userId=${job.data.userId}`,
      );
      return { ok: true };
    },
    { connection, concurrency },
  );
}
