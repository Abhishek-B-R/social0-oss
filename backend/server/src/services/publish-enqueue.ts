import { and, eq, inArray, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  getServerSidePublishPlatforms,
  type PublishPlatformJob,
  type PublishPostJob,
} from "@social0/shared";
import { db } from "../db/index.js";
import {
  postPublications,
  posts,
  publishJobEvents,
  publishJobs,
} from "../db/schema.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";
import {
  resolveJobProgressStore,
  safeDbPublishTracking,
} from "../lib/publish-job-tracking.js";
import {
  dispatchPlatformJob,
  useCloudflarePublishDispatch,
  assertPublishDispatchConfigured,
} from "./publish-dispatch.js";
import { startPlatformJobOnServer } from "../publish/server-platform-jobs.js";
import { maybeFinalizePostPublish } from "../publish/finalize-post.js";

export type PublishPriority = "now" | "scheduled";

/** Where platform jobs run: the Cloudflare publish worker, or the API process. */
export type PublishBackend = "cloudflare" | "server";

/**
 * Where a publish that dispatched nothing left the post: handed back as
 * `draft` / `scheduled`, marked `failed`, or `unchanged` because it failed
 * before claiming the post, which is then exactly as the caller left it.
 */
export type UndispatchedPostStatus = "draft" | "scheduled" | "failed" | "unchanged";

/**
 * A publish that sent nothing to any platform. The message is the underlying
 * failure's, unchanged.
 *
 * Callers that charged for the publish need to know this: nothing went out,
 * so whether the charge stands depends on where the post ended up. A post
 * handed back as a draft gets charged again when the user presses Publish
 * again, so that caller refunds; a post marked `failed` is retried for free,
 * so the charge stands.
 */
export class PublishNotDispatchedError extends Error {
  /**
   * Where the post was left, or `null` when recovery found it already moved
   * out of `publishing` by something else and cannot say.
   */
  readonly postStatus: UndispatchedPostStatus | null;

  constructor(cause: unknown, postStatus: UndispatchedPostStatus | null) {
    super(
      cause instanceof Error ? cause.message : "Could not queue this post",
      { cause },
    );
    this.name = "PublishNotDispatchedError";
    this.postStatus = postStatus;
  }
}

/**
 * A fan-out that failed after at least one platform job went out. Those jobs
 * run to completion, the platforms never reached are marked `failed`
 * (retryable per publication) and the post stays `publishing` until finalize
 * settles it. The message is the underlying failure's, unchanged.
 *
 * Callers must not report this as "nothing happened": a resubmit publishes
 * again to every account the first attempt already reached. It is its own
 * type so a caller can tell it apart from an error thrown before anything was
 * claimed or dispatched.
 */
export class PublishPartiallyDispatchedError extends Error {
  /** Platform jobs that went out before the failure. Always at least 1. */
  readonly dispatched: number;
  readonly total: number;

  constructor(cause: unknown, dispatched: number, total: number) {
    super(
      cause instanceof Error ? cause.message : "Could not queue this platform",
      { cause },
    );
    this.name = "PublishPartiallyDispatchedError";
    this.dispatched = dispatched;
    this.total = total;
  }
}

/**
 * The post was not in a status this publish could claim it from: something
 * else moved it first (a second click, another tab, an edit, the cron), or it
 * is already publishing. Nothing was claimed or dispatched, so a caller that
 * charged for the publish refunds, and the caller reports a conflict.
 */
export class PostClaimLostError extends Error {
  constructor(postId: string, expectedStatus: string) {
    super(`Post ${postId} is no longer ${expectedStatus}`);
    this.name = "PostClaimLostError";
  }
}

/**
 * Claims the post for publishing and reports the status it held before.
 *
 * Always a conditional update: two racing requests both get here, only one
 * moves the post, and the other throws `PostClaimLostError` instead of
 * publishing it a second time. With `onlyFrom` the post must hold that status;
 * without it, any status a publish can start from (never `publishing`).
 */
async function markPostPublishing(
  postId: string,
  userId: string,
  onlyFrom?: "draft",
): Promise<string | null> {
  if (onlyFrom) {
    const [claimed] = await db
      .update(posts)
      .set({ status: "publishing", failureReason: null, updatedAt: new Date() })
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.userId, userId),
          eq(posts.status, onlyFrom),
        ),
      )
      .returning({ id: posts.id });
    if (!claimed) throw new PostClaimLostError(postId, onlyFrom);
    return onlyFrom;
  }

  const [before] = await db
    .select({ status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  // A post already `publishing` has its deliveries queued or running: a /v1 or
  // /api/publish client retrying after a timeout, or Publish now landing just
  // after the cron claimed the post, must not fan the same rows out again.
  const previous = before?.status ?? null;
  if (!isPublishablePostStatus(previous)) {
    throw new PostClaimLostError(postId, "publishable");
  }

  // Compare-and-swap on the status just read, so of two requests racing past
  // the check above only one claims the post.
  const [claimed] = await db
    .update(posts)
    .set({ status: "publishing", failureReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.userId, userId),
        eq(posts.status, previous),
      ),
    )
    .returning({ id: posts.id });
  if (!claimed) throw new PostClaimLostError(postId, previous);

  return previous;
}

/** Post statuses a publish may start from (not `publishing` / `published`). */
const PUBLISHABLE_POST_STATUSES = ["draft", "scheduled", "failed", "partial"] as const;
type PublishablePostStatus = (typeof PUBLISHABLE_POST_STATUSES)[number];

function isPublishablePostStatus(
  status: string | null,
): status is PublishablePostStatus {
  return (
    status !== null &&
    (PUBLISHABLE_POST_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * Put the post back where the user can act on it when the fan-out failed.
 *
 * `markPostPublishing` runs before anything is dispatched, and `publishing` is
 * a terminal-looking state for the caller: the post can no longer be edited,
 * deleted, or re-published, and only the cron's hour-old sweeper eventually
 * marks it failed. So a publish worker that was briefly unreachable took the
 * post away from its owner for an hour.
 *
 * The same rule as the scheduled cron in `background-worker`: nothing
 * dispatched means restore the previous status so the user can retry; a
 * partial fan-out stays `publishing` — re-running would double-publish what
 * already went out — with the undispatched publications failed so the post
 * can finalize instead of hanging.
 *
 * Returns the status the post was handed back as when nothing was dispatched,
 * or `null` when it was not touched (something else already moved it out of
 * `publishing`, or part of the fan-out went out).
 */
async function recoverFromFanOutFailure(
  postId: string,
  userId: string,
  previousStatus: string | null,
  undispatched: Awaited<ReturnType<typeof loadPublicationTargets>>,
  dispatched: number,
  message: string,
): Promise<"draft" | "scheduled" | "failed" | null> {
  if (dispatched === 0) {
    const restored = (previousStatus as "draft" | "scheduled" | null) ?? "draft";
    const stillPublishing = and(
      eq(posts.id, postId),
      eq(posts.userId, userId),
      eq(posts.status, "publishing"),
    );

    // A `scheduled` post whose time has passed — every "Publish now" and "Post
    // again" is created that way — is what the scheduled cron claims on its
    // next tick. The caller rethrows and the user is told to try again, so
    // handing it back would publish it minutes later anyway and the retry would
    // post it twice. Fail it instead, as the stale-`publishing` sweeper did.
    if (restored === "scheduled") {
      const [failed] = await db
        .update(posts)
        .set({
          status: "failed",
          failureReason: "Couldn't reach the publishing service. Please try again.",
          updatedAt: new Date(),
        })
        .where(and(stillPublishing, lte(posts.scheduledAt, new Date())))
        .returning({ id: posts.id });
      if (failed) return "failed";
    }

    const [handedBack] = await db
      .update(posts)
      .set({ status: restored, updatedAt: new Date() })
      .where(stillPublishing)
      .returning({ id: posts.id });
    return handedBack ? restored : null;
  }

  if (undispatched.length > 0) {
    await db
      .update(postPublications)
      .set({ status: "failed", lastError: message, updatedAt: new Date() })
      .where(
        inArray(
          postPublications.id,
          undispatched.map((t) => t.publicationId),
        ),
      );
  }

  // Every job that did go out finalizes when it finishes, but a fast one (a
  // server-side X/TikTok job failing on an expired token) can finish while a
  // later dispatch is still timing out. Its finalize saw the rows above still
  // `pending` and stopped, and no job is left to finalize again — so the post
  // would sit in `publishing`, its queue slot in `processing`, with no failure
  // email or webhook until the hour-old sweeper. Finalize is claim-guarded and
  // waits for rows still in flight, so a second pass here is harmless.
  try {
    await maybeFinalizePostPublish(postId, userId);
  } catch (err) {
    // The original dispatch failure is what the caller rethrows; the sweeper
    // remains the backstop for a finalize that could not run.
    console.error("[publish] finalize after partial fan-out failed", postId, err);
  }
  return null;
}

/** Persist tracking row for SSE when publish_jobs table exists. */
export async function initPublishJobTracking(input: {
  trackingId: string;
  postId: string;
  userId: string;
  total: number;
}) {
  await safeDbPublishTracking(async () => {
    const now = new Date();
    await db
      .insert(publishJobs)
      .values({
        trackingId: input.trackingId,
        postId: input.postId,
        userId: input.userId,
        status: "queued",
        total: input.total,
        completed: 0,
        failed: 0,
      })
      .onConflictDoUpdate({
        target: publishJobs.trackingId,
        set: {
          status: "queued",
          total: input.total,
          updatedAt: now,
        },
      });

    await db.insert(publishJobEvents).values({
      trackingId: input.trackingId,
      postId: input.postId,
      userId: input.userId,
      phase: "queued",
      message: "Publish job queued",
      progress: { completed: 0, failed: 0, total: input.total },
    });
  });
}

async function initQueuedJobProgress(
  app: FastifyInstance | null,
  job: PublishPostJob,
  targets: Awaited<ReturnType<typeof loadPublicationTargets>>,
) {
  if (!job.trackingId) return;

  const progress = await resolveJobProgressStore(app);

  await progress.initJob({
    trackingId: job.trackingId,
    postId: job.postId,
    userId: job.userId,
    total: targets.length,
  });

  await progress.emit({
    trackingId: job.trackingId,
    postId: job.postId,
    userId: job.userId,
    phase: "fan_out",
    message: `Fanning out to ${targets.length} platforms`,
    setTotal: targets.length,
  });
}

async function emitPlatformQueuedEvent(
  app: FastifyInstance | null,
  job: PublishPostJob,
  target: Awaited<ReturnType<typeof loadPublicationTargets>>[number],
) {
  if (!job.trackingId) return;
  const progress = await resolveJobProgressStore(app);
  await progress.emit({
    trackingId: job.trackingId,
    postId: job.postId,
    userId: job.userId,
    phase: "platform_queued",
    platform: target.platform,
    connectedAccountId: target.connectedAccountId,
    message: `Queued ${target.platform}`,
  });
}

/**
 * Platform jobs dispatched at once. Each Cloudflare enqueue is an HTTP call
 * with a 15 s timeout, and a post can target up to nine accounts: in series a
 * slow worker held the request for minutes. A small cap keeps one publish from
 * opening a burst of connections.
 */
export const FAN_OUT_CONCURRENCY = 4;

type PublicationTarget = Awaited<ReturnType<typeof loadPublicationTargets>>[number];

/**
 * Hand every target to its runner, `FAN_OUT_CONCURRENCY` at a time. Every
 * target gets its attempt (one failure no longer skips the rest), and the
 * ones that did not go out are returned for the caller to settle. A target
 * that went out is never in that list, even if its "queued" progress event
 * fails: the job is running and will report for itself.
 */
async function dispatchTargets(
  app: FastifyInstance | null,
  job: PublishPostJob,
  targets: PublicationTarget[],
  trackingId: string | undefined,
  priority: PublishPriority,
): Promise<{ failed: PublicationTarget[]; firstError: unknown }> {
  const serverPlatforms = getServerSidePublishPlatforms();
  const failed: PublicationTarget[] = [];
  let firstError: unknown;
  let next = 0;

  async function runNext(): Promise<void> {
    while (next < targets.length) {
      const t = targets[next++]!;
      const platformJob: PublishPlatformJob = {
        postId: job.postId,
        userId: job.userId,
        trackingId,
        publicationId: t.publicationId,
        connectedAccountId: t.connectedAccountId,
        platform: t.platform,
      };
      try {
        // X, TikTok and Bluesky run on the API unless TWITTER_PUBLISH_ON_CF /
        // TIKTOK_PUBLISH_ON_CF / BLUESKY_PUBLISH_ON_CF=1, and every platform
        // does with PUBLISH_DISPATCH=server (see server-side-publish.ts).
        if (serverPlatforms.has(t.platform)) {
          // Tracked, so a shutdown waits for it instead of killing it mid-upload.
          startPlatformJobOnServer(app, platformJob, "[publish] server-side platform job failed");
        } else {
          await dispatchPlatformJob(platformJob, priority);
        }
      } catch (err) {
        failed.push(t);
        firstError ??= err;
        continue;
      }
      await emitPlatformQueuedEvent(app, job, t).catch((err: unknown) =>
        console.error("[publish] queued event failed", job.postId, t.platform, err),
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FAN_OUT_CONCURRENCY, targets.length) }, runNext),
  );
  return { failed, firstError };
}

/**
 * API-side fan-out: load targets, update DB, enqueue one job per platform.
 * Never runs executePublish inline.
 */
export async function prepareAndEnqueuePublish(
  app: FastifyInstance | null,
  data: PublishPostJob,
  opts: {
    priority: PublishPriority;
    trackingId?: string;
    /** Publish only if the post still holds this status; see `markPostPublishing`. */
    onlyFromStatus?: "draft";
  },
): Promise<{
  id: string;
  backend: PublishBackend;
  enqueued: number;
  trackingId?: string;
}> {
  const trackingId = opts.trackingId ?? data.trackingId;
  const job: PublishPostJob = { ...data, trackingId };

  // Everything up to `markPostPublishing` leaves the post exactly as it was: a
  // deployment that cannot dispatch, or a post with nothing to publish to.
  let targets: Awaited<ReturnType<typeof loadPublicationTargets>>;
  let backend: PublishBackend;
  try {
    assertPublishDispatchConfigured();

    targets = await loadPublicationTargets(job);
    if (targets.length === 0) {
      throw new Error(`No publication targets for post ${job.postId}`);
    }

    backend = useCloudflarePublishDispatch() ? "cloudflare" : "server";
  } catch (err) {
    throw new PublishNotDispatchedError(err, "unchanged");
  }

  const previousStatus = await markPostPublishing(
    job.postId,
    job.userId,
    opts.onlyFromStatus,
  );

  // From here on the post is `publishing`, so any failure — tracking setup
  // included — has to go through the recovery below, or the post is stuck
  // there until the hour-old sweeper.
  let dispatched = 0;
  // Until the fan-out reports otherwise, nothing has gone out.
  let undispatched = targets;
  try {
    // `initQueuedJobProgress` below runs `initJob`, whose persist hooks write
    // the same `publish_jobs` row and the same "queued" event — but only when
    // the store is `app.jobProgress`. Doing it here as well is what gave every
    // publish two identical queued events in its progress feed.
    if (trackingId && !app?.jobProgress) {
      await initPublishJobTracking({
        trackingId,
        postId: job.postId,
        userId: job.userId,
        total: targets.length,
      });
    }

    await initQueuedJobProgress(app, job, targets);

    const outcome = await dispatchTargets(app, job, targets, trackingId, opts.priority);
    dispatched = targets.length - outcome.failed.length;
    undispatched = outcome.failed;
    if (outcome.failed.length > 0) throw outcome.firstError;
  } catch (err) {
    const handedBackAs = await recoverFromFanOutFailure(
      job.postId,
      job.userId,
      previousStatus,
      undispatched,
      dispatched,
      err instanceof Error ? err.message : "Could not queue this platform",
    );
    if (dispatched === 0) {
      throw new PublishNotDispatchedError(err, handedBackAs);
    }
    throw new PublishPartiallyDispatchedError(err, dispatched, targets.length);
  }

  return {
    id: trackingId ?? `publish-${job.postId}`,
    backend,
    enqueued: targets.length,
    trackingId,
  };
}
