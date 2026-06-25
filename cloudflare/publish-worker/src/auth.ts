import {
  CF_PUBLISH_QUEUES,
  type CfPublishPriority,
} from "@social0/shared";
import type { PublishEnqueueRequest, PublishPlatformJob } from "./types";

export { CF_PUBLISH_QUEUES };

export function verifyBearerAuth(
  request: Request,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}

export function parseEnqueueRequest(body: unknown): PublishEnqueueRequest | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.priority !== "now" && o.priority !== "scheduled") return null;
  if (!o.job || typeof o.job !== "object") return null;

  const job = o.job as Record<string, unknown>;
  if (
    typeof job.postId !== "string" ||
    typeof job.userId !== "string" ||
    typeof job.publicationId !== "string" ||
    typeof job.connectedAccountId !== "string" ||
    typeof job.platform !== "string"
  ) {
    return null;
  }

  return {
    priority: o.priority,
    job: job as PublishPlatformJob,
  };
}

export function queueForPriority(priority: CfPublishPriority): string {
  return priority === "now"
    ? CF_PUBLISH_QUEUES.NOW
    : CF_PUBLISH_QUEUES.SCHEDULED;
}

export function isKnownConsumerQueue(queueName: string): boolean {
  return (
    queueName === CF_PUBLISH_QUEUES.NOW ||
    queueName === CF_PUBLISH_QUEUES.SCHEDULED
  );
}
