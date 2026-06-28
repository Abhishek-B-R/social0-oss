import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUES, type EmailPostFailedJob } from "@social0/shared";
import { maybeSendPostFailureEmail } from "../lib/post-failure-email.js";

export function startEmailWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  return new Worker<EmailPostFailedJob>(
    QUEUES.EMAIL,
    async (job) => {
      await maybeSendPostFailureEmail({
        userId: job.data.userId,
        postId: job.data.postId,
        failures: [
          {
            platform: job.data.platform,
            error: job.data.errorMessage,
          },
        ],
      });
      return { sent: true };
    },
    { connection, concurrency },
  );
}
