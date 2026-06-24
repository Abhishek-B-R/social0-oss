import { Queue, Worker, UnrecoverableError, type ConnectionOptions } from "bullmq";
import {
  JOB_NAMES,
  QUEUES,
  type PublishPlatformJob,
  type EmailPostFailedJob,
} from "@social0/shared";
import { publishToPlatform } from "@social0/worker";
import { getJobProgress } from "../lib/job-progress.js";

export function startPlatformPublishWorker(
  connection: ConnectionOptions,
  concurrency: number,
) {
  const emailQueue = new Queue<EmailPostFailedJob>(QUEUES.EMAIL, { connection });

  const worker = new Worker<PublishPlatformJob>(
    QUEUES.PLATFORM_PUBLISH,
    async (job) => {
      const data = job.data;
      const progress = getJobProgress();

      if (data.trackingId) {
        await progress.emit({
          trackingId: data.trackingId,
          postId: data.postId,
          userId: data.userId,
          phase: "platform_uploading",
          platform: data.platform,
          connectedAccountId: data.connectedAccountId,
          message: `Uploading to ${data.platform}`,
        });
      }

      console.info(
        `[engine] platform publish post=${data.postId} platform=${data.platform}`,
      );

      const result = await publishToPlatform({
        postId: data.postId,
        userId: data.userId,
        publicationId: data.publicationId,
        connectedAccountId: data.connectedAccountId,
        platform: data.platform,
      });

      if (!result.success) {
        if (data.trackingId) {
          await progress.emit({
            trackingId: data.trackingId,
            postId: data.postId,
            userId: data.userId,
            phase: "platform_failed",
            platform: data.platform,
            connectedAccountId: data.connectedAccountId,
            message: result.error ?? "Platform publish failed",
          });
        }

        await emailQueue.add(
          JOB_NAMES.EMAIL_POST_FAILED,
          {
            userId: data.userId,
            postId: data.postId,
            platform: data.platform,
            connectedAccountId: data.connectedAccountId,
            errorMessage: result.error ?? "Unknown publish error",
          },
          { jobId: `email-failed-${data.publicationId}` },
        );

        throw new UnrecoverableError(
          result.error ?? "Platform publish failed",
        );
      }

      if (data.trackingId) {
        await progress.emit({
          trackingId: data.trackingId,
          postId: data.postId,
          userId: data.userId,
          phase: "platform_success",
          platform: data.platform,
          connectedAccountId: data.connectedAccountId,
          message: `Published to ${data.platform}`,
        });
      }

      return result;
    },
    {
      connection,
      concurrency,
      lockDuration: 180_000,
      stalledInterval: 60_000,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[engine] platform job failed id=${job?.id} platform=${job?.data.platform}`,
      err.message,
    );
  });

  return worker;
}
