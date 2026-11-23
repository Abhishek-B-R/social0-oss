import { bootstrapWorkerRuntime } from "./runtime/bootstrap";
import { recordPlatformResult, trackPlatformPhase } from "./job-progress-db";
import {
  acquirePublishSlot,
  MAX_SLOT_WAITS,
  type PublishSlot,
} from "./publish-concurrency";
import type { PublishPlatformJob, PublishResult } from "./types";
import { withSql, type Sql } from "./db";

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

type RetryModule = {
  publishRetryDelaySeconds: (error: string | null | undefined, attempt: number) => number | null;
};

/**
 * The platform turned this publish away for a reason that passes (429, 500,
 * 503). Nothing was recorded or finalized: the queue consumer runs the job
 * again after `delaySeconds`, and the delivery is still claimable because the
 * run left it `failed` with an ordinary error.
 */
export class PublishRetryLaterError extends Error {
  constructor(
    readonly delaySeconds: number,
    readonly reason: string,
  ) {
    super(`Retrying in ${delaySeconds}s: ${reason}`);
    this.name = "PublishRetryLaterError";
  }
}

/**
 * Static-path dynamic imports (no @vite-ignore, no string concat) so wrangler
 * bundles the publish code, but module evaluation waits until after bootstrap
 * injects Worker secrets into process.env.
 */
async function loadWorkerModules() {
  const [executor, finalize, retry] = await Promise.all([
    import(
      "../../../backend/server/src/publish/execute-publish.js"
    ) as Promise<ExecutorModule>,
    import(
      "../../../backend/server/src/publish/finalize-post.js"
    ) as Promise<FinalizeModule>,
    import(
      "../../../backend/server/src/lib/publish-retry.js"
    ) as Promise<RetryModule>,
  ]);
  return { executor, finalize, retry };
}

/**
 * Publish one platform directly from Postgres + R2 - no API callbacks.
 * Bundles backend/server publish code at deploy time (nodejs_compat).
 *
 * Throws `PublishSlotBusyError` before doing anything when the platform or the
 * account is at its publish cap; the queue consumer requeues the job.
 * Throws `PublishRetryLaterError` when the platform rate limited or failed the
 * request in a way worth another try (`attempt` is the queue delivery count,
 * 1 for the first run); the consumer retries the message with that delay.
 */
export async function processPlatformJob(
  job: PublishPlatformJob,
  env: Env,
  attempt = 1,
  /** The queue message's client; progress writes share it. */
  sql?: Sql,
): Promise<void> {
  bootstrapWorkerRuntime(env);

  // Before any progress is reported: a job that has to wait has not started.
  let slot: PublishSlot | null = null;
  if ((job.slotWaits ?? 0) < MAX_SLOT_WAITS) {
    slot = await acquirePublishSlot(job);
  } else {
    console.warn(
      `[processPlatformJob] ${job.platform} still at capacity after ${job.slotWaits} waits; publishing without a slot`,
      job.publicationId,
    );
  }

  if (job.trackingId) {
    // Progress only: a failed write must not skip the publish or leak the slot.
    try {
      await trackPlatformPhase(
        env,
        job,
        "platform_uploading",
        `Uploading to ${job.platform}`,
        { skipAuth: true, sql },
      );
    } catch (err) {
      console.error("[processPlatformJob] progress write failed", err);
    }
  }

  try {
    const { executor, finalize, retry } = await loadWorkerModules();
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
    // Another live run holds this delivery (queue redelivery, or Publish now
    // racing the cron). This run did nothing, so it has nothing to record:
    // writing "failed" would demote the row mid-upload, and the owning run
    // records the result and finalizes the post.
    if (pubResult?.inProgressElsewhere) {
      console.warn(
        "[processPlatformJob] publication owned by another run, skipping",
        job.platform,
        job.publicationId,
      );
      return;
    }
    const success = pubResult?.status === "published";
    const failureMessage =
      pubResult?.error ??
      result.error ??
      (pubResult ? "Platform publish failed" : "No publish result for platform");

    // A 429: try again later instead of failing the post, its email and its
    // webhook now. Only the platform's own answer counts, never a lost
    // connection (the post may exist).
    const retryIn =
      !success && pubResult ? retry.publishRetryDelaySeconds(pubResult.error, attempt) : null;
    if (retryIn !== null) {
      // executePublish already wrote the row `failed`. Put it back to
      // `pending` so another platform's finalize (and the unfinalized sweep)
      // waits for this retry instead of sending a failure email now. The
      // stale-publishing sweep still fails it if the retry never comes.
      await withSql(env, sql, (db) =>
        db`update post_publications set status = 'pending', last_error = ${failureMessage}, updated_at = now() where id = ${job.publicationId} and status = 'failed'`,
      );
      if (job.trackingId) {
        await trackPlatformPhase(
          env,
          job,
          "platform_uploading",
          `${job.platform} asked us to slow down. Retrying in ${retryIn}s`,
          { skipAuth: true, sql },
        ).catch(() => undefined);
      }
      throw new PublishRetryLaterError(retryIn, failureMessage);
    }

    if (job.trackingId) {
      await recordPlatformResult(
        env,
        job,
        success,
        success ? `Published to ${job.platform}` : failureMessage,
        { skipAuth: true, sql },
      );
    }

    await finalize.maybeFinalizePostPublish(job.postId, job.userId);
  } catch (err) {
    if (err instanceof PublishRetryLaterError) throw err;
    console.error("[processPlatformJob] failed", job.platform, err);
    if (job.trackingId) {
      const message =
        err instanceof Error ? err.message : "Platform publish failed";
      await recordPlatformResult(env, job, false, message, {
        skipAuth: true,
        sql,
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
