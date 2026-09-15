import { and, eq, inArray, lt, lte } from "drizzle-orm";
import type { PublishPlatformJob } from "@social0/shared";
import { db } from "../db/index.js";
import { postPublications, posts, queuedPosts } from "../db/schema.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";
import { initScheduledPublishTracking } from "./init-scheduled-tracking.js";
import { dispatchScheduledTarget } from "./dispatch-scheduled-target.js";
import {
  LOOKAHEAD_MS,
  armQueuedSlot,
  armScheduledPost,
} from "./scheduled-lookahead.js";

/** Overdue by this much → treated as recovery (still scheduled, scan missed it). */
const RECOVERY_GRACE_MS = 2 * 60 * 1000;

/**
 * Stop retrying a post nothing will dispatch, and say so.
 *
 * A dispatch that fails before any platform left is handed back as `scheduled`
 * so the next tick retries it — right for a blip, wrong forever. A misspelled
 * `CF_PUBLISH_HMAC_SECRET`, a missing `CRON_SECRET`, a worker that 403s every
 * job: each of those retried every five minutes while the post sat in the
 * dashboard reading "Waiting for scheduled time", with the reason only ever in
 * the droplet's log. Past this much overdue, the post is marked failed with the
 * dispatch error so the user can see it and retry.
 */
const DISPATCH_GIVE_UP_MS = 60 * 60 * 1000;

type EnqueueTarget = Awaited<ReturnType<typeof loadPublicationTargets>>[number];

/**
 * Dispatch errors carry a response body (a worker 403, an HTML error page), and
 * this one is shown to the user on the post. Keep it bounded and single-line.
 */
function asFailureReason(message: string): string {
  const flat = message.replace(/\s+/g, " ").trim();
  if (!flat) return "Could not queue this post for publishing";
  return flat.length > 500 ? `${flat.slice(0, 497)}...` : flat;
}

/** Mark a post (and whatever never left) failed, with the reason attached. */
async function failUndispatchedPost(
  postId: string,
  userId: string,
  targets: EnqueueTarget[],
  rawMessage: string,
): Promise<void> {
  const message = asFailureReason(rawMessage);
  if (targets.length > 0) {
    await db
      .update(postPublications)
      .set({ status: "failed", lastError: message, updatedAt: new Date() })
      .where(
        inArray(
          postPublications.id,
          targets.map((t) => t.publicationId),
        ),
      );
  }
  await db
    .update(posts)
    .set({ status: "failed", failureReason: message, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));
  await db
    .update(queuedPosts)
    .set({ status: "failed" })
    .where(
      and(
        eq(queuedPosts.postId, postId),
        eq(queuedPosts.userId, userId),
        eq(queuedPosts.status, "processing"),
      ),
    );
}

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
 * - Nothing dispatched, not long overdue: hand the post back as `scheduled` so
 *   the next tick retries it cleanly. `scheduled_at` is untouched and already
 *   past, so it is picked up immediately.
 * - Nothing dispatched, overdue past `DISPATCH_GIVE_UP_MS`: this is not a blip.
 *   Fail the post with the dispatch error rather than retrying in silence.
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
  dueSince: Date,
): Promise<void> {
  let dispatched = 0;
  try {
    for (const t of targets) {
      const job: PublishPlatformJob = {
        postId,
        userId,
        publicationId: t.publicationId,
        connectedAccountId: t.connectedAccountId,
        platform: t.platform,
        ...(trackingId ? { trackingId } : {}),
      };
      await dispatchScheduledTarget(job);
      dispatched += 1;
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not queue this platform";

    if (dispatched === 0) {
      const overdueMs = Date.now() - dueSince.getTime();
      if (overdueMs > DISPATCH_GIVE_UP_MS) {
        console.error(
          "[publish-scheduled] giving up on post after repeated dispatch failures",
          postId,
          message,
        );
        await failUndispatchedPost(postId, userId, targets, message);
      } else {
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
      }
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

/**
 * Take ownership of a due post: `scheduled` → `publishing`, once.
 *
 * This is the only claim that matters. A queue-slot post carries both a
 * `posts.scheduled_at` and a `queued_posts` row, and both scans in this file
 * see it in the same tick — so the queued scan must go through the same claim
 * rather than force-setting `publishing`, or the post fans out twice and the
 * two jobs race to tweet the same text.
 */
async function claimDuePost(postId: string, userId: string): Promise<boolean> {
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
  return Boolean(claimed);
}

async function enqueueClaimedPost(
  postId: string,
  userId: string,
  dueSince: Date,
): Promise<boolean> {
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

  await enqueueAllTargets(postId, userId, targets, trackingId, dueSince);
  return true;
}

async function claimAndEnqueuePost(
  postId: string,
  userId: string,
  dueSince: Date,
): Promise<boolean> {
  if (!(await claimDuePost(postId, userId))) return false;
  return enqueueClaimedPost(postId, userId, dueSince);
}

/**
 * Settle a slot row whose post could not be claimed.
 *
 * `finalize-post` only closes rows in `processing`, and only when a publish it
 * is finalizing actually runs — so a row left there with nothing in flight
 * would never be touched again, and would keep occupying its queue slot.
 */
async function reconcileUnclaimedSlot(
  queuedId: string,
  postId: string,
  userId: string,
): Promise<void> {
  const [post] = await db
    .select({ status: posts.status, scheduledAt: posts.scheduledAt })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  // Publish already in flight (this tick's posts scan, or another worker) —
  // finalize will close the row.
  if (!post || post.status === "publishing") return;

  // Still scheduled: the post's own time is the truth, so resync and wait.
  if (post.status === "scheduled") {
    await db
      .update(queuedPosts)
      .set({
        status: "pending",
        ...(post.scheduledAt ? { scheduledFor: post.scheduledAt } : {}),
      })
      .where(eq(queuedPosts.id, queuedId));
    return;
  }

  // Draft, published, partial, failed: the slot is moot, stop scanning it.
  await db
    .update(queuedPosts)
    .set({ status: post.status === "failed" ? "failed" : "done" })
    .where(eq(queuedPosts.id, queuedId));
}

async function claimAndEnqueueQueued(
  queuedId: string,
  postId: string,
  userId: string,
  dueSince: Date,
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

  // The post claim decides. It fails when the posts scan already took this post
  // this tick, when another worker took it, or when the user moved the post's
  // own `scheduled_at` forward and left this slot row behind (`updatePost`
  // rewrites `queued_posts` only when a slot id comes with the edit). Dispatch
  // nothing in any of those cases, and leave the slot row somewhere it can be
  // settled rather than stuck in `processing`.
  if (!(await claimDuePost(postId, userId))) {
    await reconcileUnclaimedSlot(queuedId, postId, userId);
    return false;
  }

  const targets = await loadPublicationTargets({ postId, userId });
  if (targets.length === 0) {
    await db
      .update(queuedPosts)
      .set({ status: "failed" })
      .where(eq(queuedPosts.id, queuedId));
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

  await enqueueAllTargets(postId, userId, targets, trackingId, dueSince);
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
  // Runs first, and without touching publish config: a deployment that cannot
  // dispatch at all still needs its stuck-`publishing` posts swept, and the
  // scan used to abort above this line when `CF_PUBLISH_*` was unset — which
  // also meant X, which does not go to Cloudflare, never published either.
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

  /** Posts this scan has taken responsibility for; the queued scan skips them. */
  const handledByPostScan = new Set<string>();
  /** Of those, the ones that actually fanned out. */
  const dispatchedByPostScan = new Set<string>();

  for (const post of inWindow) {
    const scheduledAt = post.scheduledAt;
    if (!scheduledAt) continue;
    const due = scheduledAt.getTime() <= now.getTime();
    if (due) {
      // Isolate per post: a single enqueue failure used to abort the whole
      // scan, leaving every later due post unpublished until the next tick.
      handledByPostScan.add(post.id);
      try {
        const ok = await claimAndEnqueuePost(post.id, post.userId, scheduledAt);
        if (ok) {
          dispatchedByPostScan.add(post.id);
          processed.push(post.id);
          if (scheduledAt.getTime() < recoveryCutoff.getTime()) {
            recovered += 1;
            console.info(
              "[publish-scheduled] recovered overdue post",
              post.id,
              scheduledAt.toISOString(),
            );
          }
        }
      } catch (err) {
        console.error("[publish-scheduled] post enqueue failed", post.id, err);
      }
      continue;
    }

    const armedOk = armScheduledPost(post.id, scheduledAt, async () => {
      await claimAndEnqueuePost(post.id, post.userId, scheduledAt);
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
    const scheduledFor = q.scheduledFor;
    if (!scheduledFor) continue;
    const due = scheduledFor.getTime() <= now.getTime();
    if (due) {
      // The posts scan owns this post for this tick. If it fanned out, move the
      // slot row out of `pending` so it is not rescanned — `finalize-post`
      // settles it to done/failed when the publish finishes. If it failed to
      // dispatch, leave the row `pending`: the post went back to `scheduled`
      // and the next tick retries the pair together.
      if (handledByPostScan.has(q.postId)) {
        if (dispatchedByPostScan.has(q.postId)) {
          await db
            .update(queuedPosts)
            .set({ status: "processing" })
            .where(
              and(eq(queuedPosts.id, q.id), eq(queuedPosts.status, "pending")),
            );
        }
        continue;
      }
      try {
        const ok = await claimAndEnqueueQueued(
          q.id,
          q.postId,
          q.userId,
          scheduledFor,
        );
        if (ok) {
          queuedProcessed.push(q.postId);
          if (scheduledFor.getTime() < recoveryCutoff.getTime()) {
            recovered += 1;
            console.info(
              "[publish-scheduled] recovered overdue queued slot",
              q.id,
              scheduledFor.toISOString(),
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

    const armedOk = armQueuedSlot(q.id, scheduledFor, async () => {
      await claimAndEnqueueQueued(q.id, q.postId, q.userId, scheduledFor);
    });
    if (armedOk) armed += 1;
  }

  return { processed, queuedProcessed, armed, recovered };
}
