import type { PublishPlatformJob } from "../types/jobs.js";
import {
  CF_PUBLISH_QUEUES,
  type CfPublishPriority,
} from "../constants/cf-publish-queues.js";
import {
  CF_PUBLISH_SIGNATURE_HEADER,
  CF_PUBLISH_TIMESTAMP_HEADER,
  signPublishRequestBody,
} from "./cf-publish-hmac.js";

export type CfPublishClientConfig = {
  workerUrl: string;
  hmacSecret: string;
};

export function cfPublishQueueName(priority: CfPublishPriority): string {
  return priority === "now" ? CF_PUBLISH_QUEUES.NOW : CF_PUBLISH_QUEUES.SCHEDULED;
}

/** POST one platform job to the Cloudflare publish Worker (HMAC-signed body). */
export async function cfEnqueuePlatformJob(
  job: PublishPlatformJob,
  priority: CfPublishPriority,
  config: CfPublishClientConfig,
): Promise<void> {
  const base = config.workerUrl.replace(/\/$/, "");
  const body = JSON.stringify({ priority, job });
  const { timestamp, signature } = await signPublishRequestBody(
    body,
    config.hmacSecret,
  );

  const res = await fetch(`${base}/enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CF_PUBLISH_TIMESTAMP_HEADER]: timestamp,
      [CF_PUBLISH_SIGNATURE_HEADER]: signature,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF publish enqueue failed: ${res.status} ${text}`);
  }
}

export function cfPublishClientFromEnv(): CfPublishClientConfig | null {
  const workerUrl = process.env.CF_PUBLISH_WORKER_URL?.trim();
  const hmacSecret = process.env.CF_PUBLISH_HMAC_SECRET?.trim();
  if (!workerUrl || !hmacSecret) return null;
  return { workerUrl, hmacSecret };
}

export function useCloudflarePublishFromEnv(): boolean {
  if (process.env.PUBLISH_DISPATCH === "cloudflare") return true;
  if (process.env.PUBLISH_DISPATCH === "bullmq") return false;
  return Boolean(cfPublishClientFromEnv());
}
