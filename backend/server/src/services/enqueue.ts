import { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import {
  JOB_NAMES,
  getRedisUrl,
  platformPublishQueueName,
  type PublishPostJob,
  type PublishPlatformJob,
} from "@social0/shared";
import {
  createPublishTrackingId,
  dispatchPublishPost,
  queueNameForJob,
  useCloudflarePublishDispatch,
} from "./publish-dispatch.js";
import {
  initPublishJobTracking,
  prepareAndEnqueuePublish,
} from "./publish-enqueue.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";
import { resolveJobProgressStore } from "../lib/publish-job-tracking.js";

export {
  createPublishTrackingId,
  queueNameForJob,
  useCloudflarePublishDispatch,
};

export async function enqueuePublishPost(
  app: FastifyInstance,
  data: PublishPostJob,
  opts?: { delay?: number; trackingId?: string },
) {
  const priority =
    opts?.delay && opts.delay > 0 ? ("scheduled" as const) : ("now" as const);
  return dispatchPublishPost(app, data, { ...opts, priority });
}

/** Enqueue from BFF/RPC - returns immediately; never runs executePublish inline. */
export async function enqueuePublishPostStandalone(
  data: PublishPostJob,
  opts?: { trackingId?: string },
): Promise<{
  trackingId?: string;
  backend: "cloudflare" | "bullmq";
  streamUrl?: string;
}> {
  const trackingId =
    opts?.trackingId ?? data.trackingId ?? createPublishTrackingId();

  if (useCloudflarePublishDispatch()) {
    const result = await prepareAndEnqueuePublish(
      null,
      { ...data, trackingId },
      {
        priority: "now",
        trackingId,
      },
    );
    return {
      trackingId,
      backend: result.backend,
      streamUrl: `/api/jobs/${trackingId}/stream`,
    };
  }

  const connection = { url: getRedisUrl() };
  const targets = await loadPublicationTargets({ ...data, trackingId });
  if (targets.length === 0) {
    throw new Error(`No publication targets for post ${data.postId}`);
  }

  await initPublishJobTracking({
    trackingId,
    postId: data.postId,
    userId: data.userId,
    total: targets.length,
  });

  const progress = await resolveJobProgressStore(null);
  await progress.initJob({
    trackingId,
    postId: data.postId,
    userId: data.userId,
    total: targets.length,
  });

  for (const t of targets) {
    const platformJob: PublishPlatformJob = {
      postId: data.postId,
      userId: data.userId,
      trackingId,
      publicationId: t.publicationId,
      connectedAccountId: t.connectedAccountId,
      platform: t.platform,
    };
    const queueName = platformPublishQueueName(t.platform);
    const queue = new Queue<PublishPlatformJob>(queueName, { connection });
    await queue.add(JOB_NAMES.PUBLISH_PLATFORM, platformJob, {
      jobId: `platform-${t.publicationId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 10_000 },
    });
    await queue.close();
  }

  return {
    trackingId,
    backend: "bullmq",
    streamUrl: `/api/jobs/${trackingId}/stream`,
  };
}

export async function enqueueCronJob(app: FastifyInstance, name: string) {
  const jobId = `cron:${name}`;
  try {
    return await app.queues.scheduler.add(
      name,
      { triggeredAt: Date.now() },
      { jobId },
    );
  } catch {
    const existing = await app.queues.scheduler.getJob(jobId);
    if (existing) return existing;
    throw new Error(`Failed to enqueue cron job: ${name}`);
  }
}
