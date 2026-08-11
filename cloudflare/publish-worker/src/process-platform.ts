import { bootstrapWorkerRuntime } from "./runtime/bootstrap";
import { recordPlatformResult, trackPlatformPhase } from "./job-progress-db";
import { acquirePlatformPublishSlot } from "./publish-concurrency";
import type { PublishPlatformJob, PublishResult } from "./types";

type ExecutorModule = {
  executePublish: (
    postId: string,
    userId?: string,
    publicationIdFilter?: string,
  ) => Promise<PublishResult>;
};

type FinalizeModule = {
  maybeFinalizePostPublish: (postId: string, userId: string) => Promise<void>;
};

/**
 * Static-path dynamic imports (no @vite-ignore, no string concat) so wrangler
 * bundles the publish code, but module evaluation waits until after bootstrap
 * injects Worker secrets into process.env.
 */
async function loadWorkerModules() {
  const [executor, finalize] = await Promise.all([
    import(
      "../../../backend/server/src/publish/execute-publish.js"
    ) as Promise<ExecutorModule>,
    import(
      "../../../backend/server/src/publish/finalize-post.js"
    ) as Promise<FinalizeModule>,
  ]);
  return { executor, finalize };
}

/**
 * Publish one platform directly from Postgres + R2 - no API callbacks.
 * Bundles backend/server publish code at deploy time (nodejs_compat).
 */
export async function processPlatformJob(
  job: PublishPlatformJob,
  env: Env,
): Promise<void> {
  bootstrapWorkerRuntime(env);

  if (job.trackingId) {
    await trackPlatformPhase(
      env,
      job,
      "platform_uploading",
      `Uploading to ${job.platform}`,
      { skipAuth: true },
    );
  }

  const slot = await acquirePlatformPublishSlot(
    job.platform,
    job.publicationId,
  );

  try {
    const { executor, finalize } = await loadWorkerModules();
    const result = await executor.executePublish(
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
      await recordPlatformResult(
        env,
        job,
        success,
        success ? `Published to ${job.platform}` : failureMessage,
        { skipAuth: true },
      );
    }

    await finalize.maybeFinalizePostPublish(job.postId, job.userId);
  } catch (err) {
    console.error("[processPlatformJob] failed", job.platform, err);
    if (job.trackingId) {
      const message =
        err instanceof Error ? err.message : "Platform publish failed";
      await recordPlatformResult(env, job, false, message, {
        skipAuth: true,
      }).catch(() => undefined);
    }
    // Still finalize so aggregate status + failure email can fire if this
    // was the last platform (and pubs were marked failed before the throw).
    try {
      const { finalize } = await loadWorkerModules();
      await finalize.maybeFinalizePostPublish(job.postId, job.userId);
    } catch (finalizeErr) {
      console.error("[processPlatformJob] finalize failed", finalizeErr);
    }
  } finally {
    if (slot) await slot.release();
  }
}
