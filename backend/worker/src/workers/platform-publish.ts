import { Queue, Worker, UnrecoverableError, type ConnectionOptions } from "bullmq";
import {
  JOB_NAMES,
  QUEUES,
  type PublishPlatformJob,
} from "@social0/shared";
import { executePublish } from "../publish/execute-publish.js";
import { maybeFinalizePostPublish } from "../publish/finalize-post.js";
import { getJobProgress } from "../lib/job-progress.js";
import {
  isPublicationAlreadyPublished,
  recordPublishAttempt,
  recordPublishFailure,
} from "../lib/publish-reliability.js";
import {
  isCircuitOpen,
  recordCircuitFailure,
  recordCircuitSuccess,
} from "../lib/circuit-breaker.js";
import { dispatchUserWebhooks } from "../lib/user-webhooks.js";

async function processPlatformJob(
  job: { id?: string; data: PublishPlatformJob; attemptsMade: number },
  dlq: Queue<PublishPlatformJob>,
) {
  const data = job.data;
  const progress = getJobProgress();
  const attempt = job.attemptsMade + 1;

  if (isCircuitOpen(data.platform)) {
    throw new Error(`Circuit open for ${data.platform} — try again shortly`);
  }

  if (await isPublicationAlreadyPublished(data.publicationId)) {
    console.info(
      `[worker] skip already published publication=${data.publicationId}`,
    );
    await maybeFinalizePostPublish(data.postId, data.userId);
    return { skipped: true, reason: "already_published" };
  }

  await recordPublishAttempt({
    ...data,
    jobId: job.id,
    attempt,
    status: "started",
  });

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
    `[worker] platform publish post=${data.postId} platform=${data.platform} publication=${data.publicationId} attempt=${attempt}`,
  );

  const result = await executePublish(
    data.postId,
    data.userId,
    data.publicationId,
  );

  const pubResult = result.results.find(
    (r) => r.connectedAccountId === data.connectedAccountId,
  );
  const success = pubResult?.status === "published";

  if (!success) {
    const errMsg =
      pubResult?.error ?? result.error ?? "Platform publish failed";

    recordCircuitFailure(data.platform);

    await recordPublishAttempt({
      ...data,
      jobId: job.id,
      attempt,
      status: "failed",
      error: errMsg,
    });

    if (data.trackingId) {
      await progress.emit({
        trackingId: data.trackingId,
        postId: data.postId,
        userId: data.userId,
        phase: "platform_failed",
        platform: data.platform,
        connectedAccountId: data.connectedAccountId,
        message: errMsg,
      });
    }

    await maybeFinalizePostPublish(data.postId, data.userId);
    throw new UnrecoverableError(errMsg);
  }

  recordCircuitSuccess(data.platform);

  await recordPublishAttempt({
    ...data,
    jobId: job.id,
    attempt,
    status: "succeeded",
  });

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

  await dispatchUserWebhooks({
    userId: data.userId,
    event: "publish.platform_success",
    payload: {
      postId: data.postId,
      publicationId: data.publicationId,
      platform: data.platform,
      platformPostUrl: pubResult?.platformPostUrl,
    },
  });

  await maybeFinalizePostPublish(data.postId, data.userId);
  return pubResult;
}

export function startPlatformPublishWorker(
  connection: ConnectionOptions,
  concurrency: number,
  queueName: string,
) {
  const dlq = new Queue<PublishPlatformJob>(QUEUES.PLATFORM_PUBLISH_DLQ, {
    connection,
  });

  const worker = new Worker<PublishPlatformJob>(
    queueName,
    async (job) => processPlatformJob(job, dlq),
    {
      connection,
      concurrency,
      lockDuration: 180_000,
      stalledInterval: 60_000,
      maxStalledCount: 2,
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    console.error(
      `[worker] platform job failed id=${job.id} platform=${job.data.platform} queue=${queueName}`,
      err.message,
    );

    const maxAttempts = job.opts.attempts ?? 5;
    if (job.attemptsMade >= maxAttempts) {
      await recordPublishFailure({
        publicationId: job.data.publicationId,
        postId: job.data.postId,
        userId: job.data.userId,
        platform: job.data.platform,
        connectedAccountId: job.data.connectedAccountId,
        error: err.message,
        jobId: job.id,
        attempts: job.attemptsMade,
      });
      await dlq.add(JOB_NAMES.PUBLISH_PLATFORM, job.data, {
        jobId: `dlq-${job.data.publicationId}`,
        removeOnComplete: false,
        removeOnFail: false,
      });
      await dispatchUserWebhooks({
        userId: job.data.userId,
        event: "publish.platform_failed",
        payload: {
          postId: job.data.postId,
          publicationId: job.data.publicationId,
          platform: job.data.platform,
          error: err.message,
        },
      });
    }
  });

  return worker;
}
