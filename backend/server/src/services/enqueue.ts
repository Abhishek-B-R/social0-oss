import { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import {
  JOB_NAMES,
  QUEUES,
  getRedisUrl,
  type PublishPostJob,
  type TokenRefreshJob,
  type MediaConfirmJob,
  type BillingSyncJob,
} from "@social0/shared";
import {
  createPublishTrackingId,
  dispatchPublishPost,
  queueNameForJob,
  useCloudflarePublishDispatch,
} from "./publish-dispatch.js";

export { createPublishTrackingId, queueNameForJob, useCloudflarePublishDispatch };

export async function enqueuePublishPost(
  app: FastifyInstance,
  data: PublishPostJob,
  opts?: { delay?: number; trackingId?: string },
) {
  return dispatchPublishPost(app, data, opts);
}

/** Enqueue from BFF/RPC — returns immediately; never runs executePublish inline. */
export async function enqueuePublishPostStandalone(
  data: PublishPostJob,
  opts?: { trackingId?: string },
): Promise<{ trackingId?: string; backend: "cloudflare" | "bullmq" }> {
  const trackingId = opts?.trackingId ?? data.trackingId;

  if (useCloudflarePublishDispatch()) {
    const { id, backend } = await dispatchPublishPost(
      null as unknown as FastifyInstance,
      { ...data, trackingId },
    );
    return { trackingId: trackingId ?? id, backend };
  }

  const connection = { url: getRedisUrl() };
  const queue = new Queue<PublishPostJob>(QUEUES.PUBLISH, { connection });
  const jobId = trackingId
    ? `publish-${trackingId}`
    : `publish-${data.postId}-${Date.now()}`;

  await queue.add(JOB_NAMES.PUBLISH_POST, { ...data, trackingId }, { jobId });
  await queue.close();

  return { trackingId, backend: "bullmq" };
}

export async function enqueueTokenRefresh(
  app: FastifyInstance,
  data: TokenRefreshJob,
) {
  return app.queues.token.add(JOB_NAMES.TOKEN_REFRESH, data);
}

export async function enqueueMediaConfirm(
  app: FastifyInstance,
  data: MediaConfirmJob,
) {
  return app.queues.media.add(JOB_NAMES.MEDIA_CONFIRM, data);
}

export async function enqueueBillingSync(
  app: FastifyInstance,
  data: BillingSyncJob,
) {
  return app.queues.billing.add(JOB_NAMES.BILLING_SYNC, data);
}

export async function enqueueCronJob(
  app: FastifyInstance,
  name: string,
) {
  return app.queues.scheduler.add(name, { triggeredAt: Date.now() });
}
