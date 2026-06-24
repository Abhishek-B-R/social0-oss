import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUES, type EmailPostFailedJob } from "@social0/shared";
import { sendPostFailedEmail } from "../email/post-failed.js";

export function startEmailWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  return new Worker<EmailPostFailedJob>(
    QUEUES.EMAIL,
    async (job) => {
      await sendPostFailedEmail(job.data);
      return { sent: true };
    },
    { connection, concurrency },
  );
}
