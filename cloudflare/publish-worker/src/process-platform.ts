import { bootstrapWorkerRuntime } from "./runtime/bootstrap";
import { recordPlatformResult, trackPlatformPhase } from "./job-progress-db";
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
    );
  }

  const { executor, finalize } = await loadWorkerModules();
  const result = await executor.executePublish(
    job.postId,
    job.userId,
    job.publicationId,
  );

  const pubResult = result.results.find(
    (r) => r.connectedAccountId === job.connectedAccountId,
  );
  const success = pubResult?.status === "published";

  if (job.trackingId) {
    await recordPlatformResult(
      env,
      job,
      success,
      success
        ? `Published to ${job.platform}`
        : (pubResult?.error ?? result.error ?? "Platform publish failed"),
    );
  }

  await finalize.maybeFinalizePostPublish(job.postId, job.userId);

  if (!success) {
    throw new Error(
      pubResult?.error ?? result.error ?? "Platform publish failed",
    );
  }
}
