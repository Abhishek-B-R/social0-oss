import type { FastifyInstance } from "fastify";
import type { PublishPlatformJob } from "@social0/shared";
import {
  recordPlatformResultServer,
  trackPlatformPhaseServer,
} from "../lib/record-platform-result-server.js";
import { executePublish } from "./execute-publish.js";
import { maybeFinalizePostPublish } from "./finalize-post.js";

/**
 * Run one platform publish on the API server (Node).
 * Used for immediate Twitter publishes and as a fallback path.
 */
export async function runPlatformJobOnServer(
  app: FastifyInstance | null,
  job: PublishPlatformJob,
): Promise<void> {
  if (job.trackingId) {
    await trackPlatformPhaseServer(
      app,
      job,
      "platform_uploading",
      `Uploading to ${job.platform}`,
    );
  }

  try {
    const result = await executePublish(
      job.postId,
      job.userId,
      job.publicationId,
    );

    const pubResult = result.results.find(
      (r) =>
        r.connectedAccountId === job.connectedAccountId ||
        r.platform === job.platform,
    );
    const success = pubResult?.status === "published";
    const failureMessage =
      pubResult?.error ??
      result.error ??
      (pubResult ? "Platform publish failed" : "No publish result for platform");

    if (job.trackingId) {
      await recordPlatformResultServer(
        app,
        job,
        success,
        success ? `Published to ${job.platform}` : failureMessage,
      );
    }

    await maybeFinalizePostPublish(job.postId, job.userId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Platform publish failed";
    console.error("[runPlatformJobOnServer] failed", job.platform, err);
    if (job.trackingId) {
      await recordPlatformResultServer(app, job, false, message);
    }
  }
}
