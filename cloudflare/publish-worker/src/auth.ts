import {
  CF_PUBLISH_SIGNATURE_HEADER,
  CF_PUBLISH_TIMESTAMP_HEADER,
  verifyPublishRequestBody,
} from "@social0/shared";
import { SUPPORTED_PLATFORMS, CF_PUBLISH_QUEUES } from "@social0/shared";
import type { CfPublishPriority } from "@social0/shared";
import type { PublishEnqueueRequest, PublishPlatformJob } from "./types";
import { parsePublishPlatformJob } from "./validate-job";

export { CF_PUBLISH_QUEUES };

export async function verifyEnqueueAuth(
  request: Request,
  secret: string | undefined,
  rawBody: string,
): Promise<boolean> {
  if (!secret) return false;
  return verifyPublishRequestBody(
    rawBody,
    secret,
    request.headers.get(CF_PUBLISH_TIMESTAMP_HEADER),
    request.headers.get(CF_PUBLISH_SIGNATURE_HEADER),
  );
}

export function parseEnqueueRequest(body: unknown): PublishEnqueueRequest | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.priority !== "now" && o.priority !== "scheduled") return null;
  if (!o.job || typeof o.job !== "object") return null;

  const job = parsePublishPlatformJob(o.job as Record<string, unknown>);
  if (!job) return null;

  return {
    priority: o.priority as CfPublishPriority,
    job,
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

export { SUPPORTED_PLATFORMS };
