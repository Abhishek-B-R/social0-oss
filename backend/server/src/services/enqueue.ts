import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  JOB_NAMES,
  QUEUES,
  type PublishPostJob,
  type TokenRefreshJob,
  type MediaConfirmJob,
  type BillingSyncJob,
} from "@social0/shared";

export async function enqueuePublishPost(
  app: FastifyInstance,
  data: PublishPostJob,
  opts?: { delay?: number; trackingId?: string },
) {
  const trackingId = opts?.trackingId ?? data.trackingId;
  const jobId = trackingId
    ? `publish-${trackingId}`
    : opts?.delay
      ? `publish-scheduled-${data.postId}-${Date.now()}`
      : `publish-${data.postId}-${Date.now()}`;

  return app.queues.publish.add(
    JOB_NAMES.PUBLISH_POST,
    { ...data, trackingId },
    {
      jobId,
      delay: opts?.delay,
    },
  );
}

export function createPublishTrackingId() {
  return randomUUID();
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

export function queueNameForJob(jobName: string): string {
  if (jobName.startsWith("publish.")) return QUEUES.PUBLISH;
  if (jobName.startsWith("email.")) return QUEUES.EMAIL;
  if (jobName.startsWith("token.")) return QUEUES.TOKEN;
  if (jobName.startsWith("billing.")) return QUEUES.BILLING;
  if (jobName.startsWith("cron.")) return QUEUES.SCHEDULER;
  if (jobName.startsWith("media.")) return QUEUES.MEDIA;
  return QUEUES.PUBLISH;
}
