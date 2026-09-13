import { and, eq, lt, lte } from "drizzle-orm";
import {
  cfEnqueuePlatformJob,
  cfPublishClientFromEnv,
  type PublishPlatformJob,
} from "@social0/shared";
import { db } from "../db/index.js";
import { postPublications, posts, queuedPosts } from "../db/schema.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";
import { initScheduledPublishTracking } from "./init-scheduled-tracking.js";
import {
  LOOKAHEAD_MS,
  armQueuedSlot,
  armScheduledPost,
} from "./scheduled-lookahead.js";

/** Overdue by this much → treated as recovery (still scheduled, scan missed it). */
const RECOVERY_GRACE_MS = 2 * 60 * 1000;

type CfClient = NonNullable<ReturnType<typeof cfPublishClientFromEnv>>;

async function enqueueTarget(
  job: PublishPlatformJob,
  cfClient: CfClient,
): Promise<void> {
  await cfEnqueuePlatformJob(job, "scheduled", cfClient);
}

type EnqueueTarget = Awaited<ReturnType<typeof loadPublicationTargets>>[number];

/**
 * Dispatch every target, and leave the post in a state the system can still
 * act on if that fails part way.
 *
 * Claiming flips the post to `publishing`, and the scan only ever selects
 * `scheduled` — so a dispatch that threw (the publish worker down, a network
 * blip, a rejected signature) left the post there with nothing queued and
 * nothing to retry it. The stale-`publishing` sweeper at the top of the scan
 * eventually marked it failed, an hour later, for a blip that a retry one
 * minute later would have ridden out.
 *
 * Which recovery is right depends on how far the fan-out got:
 *
 * - Nothing dispatched: hand the post back as `scheduled` so the next tick
 *   retries it cleanly. `scheduled_at` is untouched and already past, so it is
 *   picked up immediately.
 * - Something dispatched: those platforms are in flight and re-running the
 *   post would double-publish them. Fail the publications that never left
 *   instead, so the post can finalize as failed/partial — with the failure
 *   email and webhook that implies — rather than sitting in `publishing`
 *   waiting on a job that does not exist.
 */
async function enqueueAllTargets(
  postId: string,
  userId: string,
  targets: EnqueueTarget[],
  trackingId: string | undefined,
  cfClient: CfClient,
): Promise<void> {
  let dispatched = 0;
  try {
    for (const t of targets) {
      await enqueueTarget(
        {
          postId,
          userId,
          publicationId: t.publicationId,
          connectedAccountId: t.connectedAccountId,
          platform: t.platform,
          ...(trackingId ? { trackingId } : {}),
        },
        cfClient,
      );
      dispatched += 1;
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not queue this platform";

    if (dispatched === 0) {
      await db
        .update(posts)
        .set({ status: "scheduled", updatedAt: new Date() })
        .where(
          and(
            eq(posts.id, postId),
            eq(posts.userId, userId),
            eq(posts.status, "publishing"),
          ),
        );
    } else {
      for (const t of targets.slice(dispatched)) {
        await db
          .update(postPublications)
          .set({
            status: "failed",
            lastError: message,
            updatedAt: new Date(),
          })
          .where(eq(postPublications.id, t.publicationId));
      }
    }
    throw err;
  }
}

async function claimAndEnqueuePost(
  postId: string,
  userId: string,
  cfClient: CfClient,
): Promise<boolean> {
  // scheduledAt <= now: if user pushed the time back after we armed a timer, skip.
  const [claimed] = await db
    .update(posts)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.userId, userId),
        eq(posts.status, "scheduled"),
        lte(posts.scheduledAt, new Date()),
      ),
    )
    .returning({ id: posts.id });
  if (!claimed) return false;

  const targets = await loadPublicationTargets({ postId, userId });
  if (targets.length === 0) {
    await db
      .update(posts)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(posts.id, postId), eq(posts.userId, userId)));
    return false;
  }

  const trackingId = await initScheduledPublishTracking({
    postId,
    userId,
    total: targets.length,
  });

  await enqueueAllTargets(postId, userId, targets, trackingId, cfClient);
  return true;
}

async function claimAndEnqueueQueued(
  queuedId: string,
  postId: string,
  userId: string,
  cfClient: CfClient,
): Promise<boolean> {
  const [claimed] = await db
    .update(queuedPosts)
    .set({ status: "processing" })
    .where(
      and(
        eq(queuedPosts.id, queuedId),
        eq(queuedPosts.status, "pending"),
        lte(queuedPosts.scheduledFor, new Date()),
      ),
    )
    .returning({ id: queuedPosts.id });
  if (!claimed) return false;

  await db
    .update(posts)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.userId, userId),
        eq(posts.status, "scheduled"),
      ),
    );

  const targets = await loadPublicationTargets({ postId, userId });
  if (targets.length === 0) {
    await db
      .update(queuedPosts)
      .set({ status: "failed" })
      .where(eq(queuedPosts.id, queuedId));
    return false;
  }

  const trackingId = await initScheduledPublishTracking({
    postId,
    userId,
    total: targets.length,
  });

  await enqueueAllTargets(postId, userId, targets, trackingId, cfClient);
  return true;
}

/**
 * Scan DB for due + upcoming (5 min) scheduled posts.
 * Due → claim + enqueue now. Upcoming → arm in-process timers (no DB claim yet).
 * Overdue still-scheduled posts are recovered in the same pass (due query).
 */
export async function runPublishScheduledCron(): Promise<{
  processed: string[];
  queuedProcessed: string[];
  armed: number;
  recovered: number;
}> {
  const cfClient = cfPublishClientFromEnv();
  if (!cfClient) {
    throw new Error(
      "CF publish is not configured (set CF_PUBLISH_WORKER_URL + CF_PUBLISH_HMAC_SECRET)",
    );
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await db
    .update(posts)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(posts.status, "publishing"), lt(posts.updatedAt, oneHourAgo)));

  const now = new Date();
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_MS);
  const recoveryCutoff = new Date(now.getTime() - RECOVERY_GRACE_MS);

  const inWindow = await db
    .select({
      id: posts.id,
      userId: posts.userId,
      scheduledAt: posts.scheduledAt,
    })
    .from(posts)
    .where(
      and(
        eq(posts.status, "scheduled"),
        lte(posts.scheduledAt, windowEnd),
      ),
    );

  const processed: string[] = [];
  let armed = 0;
  let recovered = 0;

  for (const post of inWindow) {
    if (!post.scheduledAt) continue;
    const due = post.scheduledAt.getTime() <= now.getTime();
    if (due) {
      // Isolate per post: a single CF enqueue failure used to abort the whole
      // scan, leaving every later due post unpublished until the next tick.
      try {
        const ok = await claimAndEnqueuePost(post.id, post.userId, cfClient);
        if (ok) {
          processed.push(post.id);
          if (post.scheduledAt.getTime() < recoveryCutoff.getTime()) {
            recovered += 1;
            console.info(
              "[publish-scheduled] recovered overdue post",
              post.id,
              post.scheduledAt.toISOString(),
            );
          }
        }
      } catch (err) {
        console.error("[publish-scheduled] post enqueue failed", post.id, err);
      }
      continue;
    }

    const armedOk = armScheduledPost(post.id, post.scheduledAt, async () => {
      await claimAndEnqueuePost(post.id, post.userId, cfClient);
    });
    if (armedOk) armed += 1;
  }

  const queuedInWindow = await db
    .select({
      id: queuedPosts.id,
      postId: queuedPosts.postId,
      userId: queuedPosts.userId,
      scheduledFor: queuedPosts.scheduledFor,
    })
    .from(queuedPosts)
    .where(
      and(
        eq(queuedPosts.status, "pending"),
        lte(queuedPosts.scheduledFor, windowEnd),
      ),
    );

  const queuedProcessed: string[] = [];
  for (const q of queuedInWindow) {
    if (!q.scheduledFor) continue;
    const due = q.scheduledFor.getTime() <= now.getTime();
    if (due) {
      try {
        const ok = await claimAndEnqueueQueued(
          q.id,
          q.postId,
          q.userId,
          cfClient,
        );
        if (ok) {
          queuedProcessed.push(q.postId);
          if (q.scheduledFor.getTime() < recoveryCutoff.getTime()) {
            recovered += 1;
            console.info(
              "[publish-scheduled] recovered overdue queued slot",
              q.id,
              q.scheduledFor.toISOString(),
            );
          }
        }
      } catch (err) {
        console.error(
          "[publish-scheduled] queued slot enqueue failed",
          q.id,
          err,
        );
      }
      continue;
    }

    const armedOk = armQueuedSlot(q.id, q.scheduledFor, async () => {
      await claimAndEnqueueQueued(q.id, q.postId, q.userId, cfClient);
    });
    if (armedOk) armed += 1;
  }

  return { processed, queuedProcessed, armed, recovered };
}
