import type { FastifyInstance } from "fastify";
import type { PublishPostJob } from "@social0/shared";
import {
  createPublishTrackingId,
  dispatchPublishPost,
  queueNameForJob,
  useCloudflarePublishDispatch,
  assertPublishDispatchConfigured,
} from "./publish-dispatch.js";
import {
  prepareAndEnqueuePublish,
  PublishNotDispatchedError,
  type PublishBackend,
} from "./publish-enqueue.js";

export {
  createPublishTrackingId,
  queueNameForJob,
  useCloudflarePublishDispatch,
};

/**
 * Publish now. There is no delayed publish: scheduling is a `scheduled_at`
 * write that the `publish-scheduled` cron picks up.
 */
export async function enqueuePublishPost(
  app: FastifyInstance,
  data: PublishPostJob,
  opts?: { trackingId?: string; onlyFromStatus?: "draft" },
) {
  return dispatchPublishPost(app, data, { ...opts, priority: "now" });
}

/**
 * Enqueue from BFF/RPC - returns immediately; never runs executePublish inline.
 * Same fan-out as every other publish (`prepareAndEnqueuePublish`), whichever
 * backend runs the platform jobs.
 */
export async function enqueuePublishPostStandalone(
  data: PublishPostJob,
  opts?: { trackingId?: string },
): Promise<{
  trackingId?: string;
  backend: PublishBackend;
  streamUrl?: string;
}> {
  try {
    assertPublishDispatchConfigured();
  } catch (err) {
    // Nothing was written: the post is exactly as the caller left it.
    throw new PublishNotDispatchedError(err, "unchanged");
  }

  const trackingId =
    opts?.trackingId ?? data.trackingId ?? createPublishTrackingId();

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

function cronJobId(name: string): string {
  // BullMQ rejects custom ids containing ':' — use a stable, colon-free dedup key.
  return `cron-${name.replace(/\./g, "-")}`;
}

export async function enqueueCronJob(app: FastifyInstance, name: string) {
  const jobId = cronJobId(name);
  const existing = await app.queues.scheduler.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting" || state === "delayed") {
      return existing;
    }
    await existing.remove();
  }
  return app.queues.scheduler.add(
    name,
    { triggeredAt: Date.now() },
    { jobId },
  );
}
