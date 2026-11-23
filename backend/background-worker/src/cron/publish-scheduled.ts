import { and, asc, eq, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import { INTERRUPTED_PUBLISH_ERROR, type PublishPlatformJob } from "@social0/shared";
import { db } from "../db/index.js";
import { postPublications, posts, queuedPosts } from "../db/schema.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";
import { initScheduledPublishTracking } from "./init-scheduled-tracking.js";
import { sweepUnfinalizedPosts } from "./sweep-unfinalized-posts.js";
import {
  dispatchScheduledTarget,
  dispatchTargetFor,
  requestServerFinalize,
} from "./dispatch-scheduled-target.js";
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
 * the droplet's log. Once dispatch has kept failing for this long, the post is
 * marked failed with the dispatch error so the user can see it and retry.
 *
 * Measured from the post's first failed dispatch (`DISPATCH_FIRST_FAILED_KEY`),
 * not from its due time: after an outage, or for a slot post scheduled long
 * ago, the due time is already hours back, and a single blip on the first
 * attempt used to fail the post for good.
 */
const DISPATCH_GIVE_UP_MS = 60 * 60 * 1000;

/**
 * `posts.metadata` key holding when this post's dispatch first failed (ISO
 * string). Set when a failed dispatch hands the post back, cleared once any
 * platform leaves or the post is given up on. Server-owned: the API strips it
 * from client metadata (`post-metadata-sanitize.ts`).
 *
 * A mark older than the post's current `scheduled_at` belongs to an earlier
 * schedule (the user moved the stuck post, and neither `reschedulePost` nor
 * `updatePost` touches metadata) and is ignored: see `effectiveFirstFailedAt`.
 */
export const DISPATCH_FIRST_FAILED_KEY = "_dispatchFirstFailedAt";

/** Shown on a delivery the stale sweep failed before it ever started. */
export const NEVER_STARTED_PUBLISH_ERROR = "Publish did not complete for this platform";

/** Shown on a post the stale-`publishing` sweep had to fail. */
export const STALE_PUBLISH_REASON =
  "Publishing did not finish within an hour. Retry the platforms that failed.";

/**
 * Write the first-failure mark. The value is the one the claim settled on
 * (`effectiveFirstFailedAt`, or now for a first failure), not a coalesce with
 * what is stored: a stale mark from an earlier schedule must be replaced, or
 * it would keep being ignored and the post would never be given up on.
 *
 * Bind parameters inside `jsonb_build_object` need explicit `::text` casts:
 * the function is variadic `"any"` and Postgres rejects an untyped parameter
 * (42P18). See `server/src/lib/post-metadata-claim.ts`.
 */
function markDispatchFailedSql(firstFailedIso: string): SQL {
  return sql`coalesce(${posts.metadata}, '{}'::jsonb) || jsonb_build_object(${DISPATCH_FIRST_FAILED_KEY}::text, ${firstFailedIso}::text)`;
}

function clearDispatchFailedSql(): SQL {
  return sql`coalesce(${posts.metadata}, '{}'::jsonb) - ${DISPATCH_FIRST_FAILED_KEY}::text`;
}

async function clearDispatchFailureMark(postId: string): Promise<void> {
  await db
    .update(posts)
    .set({ metadata: clearDispatchFailedSql() })
    .where(eq(posts.id, postId));
}

/** Parse the stored first-failure time; anything unreadable counts as unset. */
function parseFirstFailedAt(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The first-failure time that counts for the post's current schedule.
 *
 * A post only fails to dispatch once it is due, so a mark from this schedule
 * is never earlier than `scheduled_at`. One that is was left by an earlier
 * schedule: the post failed to dispatch, the user moved it, and the mark
 * survived the move. Counting it would give up on the new schedule's first
 * blip, since the old failure is already far more than an hour back.
 */
export function effectiveFirstFailedAt(
  raw: string | null | undefined,
  scheduledAt: Date | null,
): Date | null {
  const mark = parseFirstFailedAt(raw);
  if (!mark) return null;
  if (scheduledAt && mark.getTime() < new Date(scheduledAt).getTime()) {
    return null;
  }
  return mark;
}

/**
 * Ask the API to finalize, best effort. Finalize (failure email, webhooks,
 * Auto-Repost / Auto-Plug setup) lives on the API; when it cannot be reached
 * the post keeps the status written here.
 */
async function finalizeOnServer(
  postId: string,
  userId: string,
  context: string,
): Promise<void> {
  try {
    await requestServerFinalize(postId, userId);
  } catch (err) {
    console.error(`[publish-scheduled] finalize ${context} failed`, postId, err);
  }
}

/**
 * How a dispatch path asks for a post to be finalized. An armed timer, which
 * handles one post on its own, asks straight away; the scan collects its
 * requests in a `FinalizeBatch` and sends them once every due post is out.
 */
type RequestFinalize = (
  postId: string,
  userId: string,
  context: string,
) => void | Promise<void>;

const finalizeNow: RequestFinalize = (postId, userId, context) =>
  finalizeOnServer(postId, userId, context);

/** How many finalize requests a scan has in flight at once. */
export const FINALIZE_CONCURRENCY = 8;

/**
 * Finalize requests a scan collects, sent after it has dispatched every due
 * post.
 *
 * Finalize is slow by design: it sends the failure email and delivers the
 * user's webhooks, about 35 seconds for a customer endpoint that never
 * answers (this side stops waiting after `SERVER_FINALIZE_TIMEOUT_MS`, and the
 * API finishes regardless). The scan used to ask for each one inline, one
 * after another, and the cron runs one scan at a time, so 60 posts swept after
 * a publish-worker outage held every other customer's due posts for half an
 * hour. Nothing a finalize does is time-critical next to a post due now.
 */
class FinalizeBatch {
  private readonly pending = new Map<string, { userId: string; context: string }>();

  readonly request: RequestFinalize = (postId, userId, context) => {
    // Finalize is idempotent; one request per post is enough.
    this.pending.set(postId, { userId, context });
  };

  /** Send everything collected, a few at a time. Never rejects. */
  async flush(): Promise<void> {
    const queue = [...this.pending];
    this.pending.clear();
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [postId, { userId, context }] = next;
        await finalizeOnServer(postId, userId, context);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(FINALIZE_CONCURRENCY, queue.length) }, worker),
    );
  }
}

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
  requestFinalize: RequestFinalize,
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
    .set({
      status: "failed",
      failureReason: message,
      metadata: clearDispatchFailedSql(),
      updatedAt: new Date(),
    })
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
  // A failed publish gets the failure email and the post.failed webhook, and
  // only finalize sends those. It also settles the aggregate if an earlier
  // attempt already published some platforms.
  await requestFinalize(postId, userId, "after giving up on dispatch");
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
 * - Nothing dispatched, and dispatch has not been failing for long: hand the
 *   post back as `scheduled` so the next tick retries it cleanly, and note
 *   when the failures started. `scheduled_at` is untouched and already past,
 *   so it is picked up immediately.
 * - Nothing dispatched, failing for over `DISPATCH_GIVE_UP_MS`: this is not a
 *   blip. Fail the post with the dispatch error rather than retrying in silence.
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
  claim: PostClaim,
  requestFinalize: RequestFinalize,
): Promise<void> {
  const { dispatchFirstFailedAt, hasDispatchMark } = claim;
  let dispatched = 0;
  let failing: string | null = null;
  // API-hosted platforms first: while the API restarts (a deploy drains for
  // up to 135 s) nothing has gone out yet, so the post goes back to
  // `scheduled` and the next tick retries it, instead of a partial fan-out
  // failing those platforms for good.
  targets = [...targets].sort(
    (a, b) =>
      Number(dispatchTargetFor(a.platform) !== "server") -
      Number(dispatchTargetFor(b.platform) !== "server"),
  );
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
      failing = t.platform;
      await dispatchScheduledTarget(job);
      dispatched += 1;
    }
  } catch (err) {
    // `posts.failure_reason` is shown to the user on the post, and a bare
    // "fetch failed" from undici tells them nothing. Name the platform that
    // could not be queued and keep the cause behind it.
    const cause =
      err instanceof Error ? err.message : "Could not queue this platform";
    const message = failing
      ? `Could not queue ${failing} for publishing: ${cause}`
      : cause;

    if (dispatched === 0) {
      const failingForMs = dispatchFirstFailedAt
        ? Date.now() - dispatchFirstFailedAt.getTime()
        : 0;
      if (failingForMs > DISPATCH_GIVE_UP_MS) {
        console.error(
          "[publish-scheduled] giving up on post after repeated dispatch failures",
          postId,
          message,
        );
        await failUndispatchedPost(
          postId,
          userId,
          targets,
          message,
          requestFinalize,
        );
      } else {
        await db
          .update(posts)
          .set({
            status: "scheduled",
            metadata: markDispatchFailedSql(
              (dispatchFirstFailedAt ?? new Date()).toISOString(),
            ),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(posts.id, postId),
              eq(posts.userId, userId),
              eq(posts.status, "publishing"),
            ),
          );
      }
    } else {
      await db
        .update(postPublications)
        .set({
          status: "failed",
          lastError: message,
          updatedAt: new Date(),
        })
        .where(
          inArray(
            postPublications.id,
            targets.slice(dispatched).map((t) => t.publicationId),
          ),
        );
      if (hasDispatchMark) {
        await clearDispatchFailureMark(postId).catch((clearErr) =>
          console.error("[publish-scheduled] could not clear dispatch mark", postId, clearErr),
        );
      }
      // A job that went out may already have finished — a server-side X/TikTok
      // job failing fast on an expired token while the next dispatch is still
      // timing out — and its finalize saw these rows `pending` and stopped. No
      // job is left to finalize again, so ask for it here; finalize waits for
      // rows still in flight, so a duplicate pass is harmless. If the API is
      // unreachable the stale-`publishing` sweep remains the backstop.
      await requestFinalize(postId, userId, "after partial fan-out");
    }
    throw err;
  }
  // Every platform is out; the post is no longer failing to dispatch.
  if (hasDispatchMark) await clearDispatchFailureMark(postId);
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
type PostClaim = {
  /** When dispatch first failed under the current schedule, if it has. */
  dispatchFirstFailedAt: Date | null;
  /** Whether metadata holds a mark at all (stale or not), to clear it. */
  hasDispatchMark: boolean;
};

async function claimDuePost(
  postId: string,
  userId: string,
): Promise<PostClaim | null> {
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
    .returning({
      id: posts.id,
      scheduledAt: posts.scheduledAt,
      dispatchFirstFailedAt: sql<
        string | null
      >`${posts.metadata} ->> ${DISPATCH_FIRST_FAILED_KEY}::text`,
    });
  if (!claimed) return null;
  return {
    dispatchFirstFailedAt: effectiveFirstFailedAt(
      claimed.dispatchFirstFailedAt,
      claimed.scheduledAt ?? null,
    ),
    hasDispatchMark: claimed.dispatchFirstFailedAt != null,
  };
}

/**
 * Move this post's slot row out of `pending` as part of the claim.
 *
 * This has to happen *before* anything dispatches. `finalize-post` settles
 * `processing` rows when the publish finishes, and a server-side platform job
 * can finish before the next statement here runs — so a row marked `processing`
 * after dispatch misses its own finalize and sits there forever. A live run
 * did exactly that.
 */
async function claimSlotRowsForPost(
  postId: string,
  userId: string,
): Promise<void> {
  await db
    .update(queuedPosts)
    .set({ status: "processing" })
    .where(
      and(
        eq(queuedPosts.postId, postId),
        eq(queuedPosts.userId, userId),
        eq(queuedPosts.status, "pending"),
      ),
    );
}

async function enqueueClaimedPost(
  postId: string,
  userId: string,
  claim: PostClaim,
  requestFinalize: RequestFinalize,
): Promise<boolean> {
  await claimSlotRowsForPost(postId, userId);
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

  await enqueueAllTargets(
    postId,
    userId,
    targets,
    trackingId,
    claim,
    requestFinalize,
  );
  return true;
}

async function claimAndEnqueuePost(
  postId: string,
  userId: string,
  requestFinalize: RequestFinalize = finalizeNow,
): Promise<boolean> {
  const claim = await claimDuePost(postId, userId);
  if (!claim) return false;
  return enqueueClaimedPost(postId, userId, claim, requestFinalize);
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
  requestFinalize: RequestFinalize = finalizeNow,
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
  const claim = await claimDuePost(postId, userId);
  if (!claim) {
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

  await enqueueAllTargets(
    postId,
    userId,
    targets,
    trackingId,
    claim,
    requestFinalize,
  );
  return true;
}

/**
 * A post's status from its publications' — the rule `maybeFinalizePostPublish`
 * applies, for rows that are all terminal.
 */
export function aggregatePublishStatus(
  statuses: readonly string[],
): "published" | "partial" | "failed" {
  const succeeded = statuses.filter((st) => st === "published").length;
  const failed = statuses.filter((st) => st === "failed").length;
  if (succeeded === 0) return "failed";
  return failed === 0 ? "published" : "partial";
}

/**
 * Fail posts stuck in `publishing` for over an hour, and finish them properly.
 *
 * A post lands here when nothing finalized it: a worker died mid-job, or a
 * fan-out failed part way and the finalize request did not get through. Some
 * of its platforms may well have published, so the post's status comes from
 * its publications (failed / partial / published) rather than a blanket
 * `failed`, and the API is asked to finalize so the failure email and webhook
 * go out as they do for every other failed publish. The finalize requests go
 * through `requestFinalize`, which the scan holds until its due posts are out.
 */
async function sweepStalePublishingPosts(
  requestFinalize: RequestFinalize,
): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const stale = and(eq(posts.status, "publishing"), lt(posts.updatedAt, oneHourAgo));
  // Bounded: after an outage the sweep would otherwise fail (and finalize)
  // every stuck post in one tick. The update re-checks `stale`, so a post a
  // live run touched since the subquery read it is left alone.
  const swept = await db
    .update(posts)
    .set({
      status: "failed",
      failureReason: STALE_PUBLISH_REASON,
      updatedAt: new Date(),
    })
    .where(
      and(
        stale,
        inArray(
          posts.id,
          db
            .select({ id: posts.id })
            .from(posts)
            .where(stale)
            .orderBy(asc(posts.updatedAt))
            .limit(STALE_SWEEP_LIMIT),
        ),
      ),
    )
    .returning({ id: posts.id, userId: posts.userId });
  if (swept.length === 0) return;
  const sweptIds = swept.map((p) => p.id);

  // Settle the publications too. A worker that died mid-job leaves its row
  // `publishing`, and a failed post with no failed rows can't be retried: the
  // dashboard has nothing to retry per network, and a whole-post publish skips
  // `publishing` rows as "already in progress" while flipping the post back to
  // `publishing` until this sweep fails it again an hour later.
  //
  // A row still `publishing` was mid-send when its run died: the platform may
  // have created the post, so it gets the interrupted marker, which nothing
  // retries on its own (only a person's per-delivery Retry). A `pending` row
  // never reached the platform and is safe to retry.
  await db
    .update(postPublications)
    .set({
      status: "failed",
      lastError: INTERRUPTED_PUBLISH_ERROR,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(postPublications.postId, sweptIds),
        eq(postPublications.status, "publishing"),
      ),
    );
  await db
    .update(postPublications)
    .set({
      status: "failed",
      lastError: NEVER_STARTED_PUBLISH_ERROR,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(postPublications.postId, sweptIds),
        eq(postPublications.status, "pending"),
      ),
    );

  const pubRows = await db
    .select({ postId: postPublications.postId, status: postPublications.status })
    .from(postPublications)
    .where(inArray(postPublications.postId, sweptIds));
  const statusesByPost = new Map<string, string[]>();
  for (const row of pubRows) {
    if (!row.postId || !row.status) continue;
    const list = statusesByPost.get(row.postId) ?? [];
    list.push(row.status);
    statusesByPost.set(row.postId, list);
  }

  const failedIds: string[] = [];
  const settledIds: string[] = [];
  for (const id of sweptIds) {
    const outcome = aggregatePublishStatus(statusesByPost.get(id) ?? []);
    if (outcome === "failed") {
      failedIds.push(id);
      continue;
    }
    settledIds.push(id);
    await db
      .update(posts)
      .set({
        status: outcome,
        failureReason: outcome === "published" ? null : STALE_PUBLISH_REASON,
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, id), eq(posts.status, "failed")));
  }

  // And release their queue slots: finalize is what moves a claimed slot row
  // out of `processing`, and a post that got here never finalized, so the
  // row would keep occupying its slot forever.
  for (const [ids, status] of [
    [failedIds, "failed"],
    [settledIds, "done"],
  ] as const) {
    if (ids.length === 0) continue;
    await db
      .update(queuedPosts)
      .set({ status })
      .where(
        and(
          inArray(queuedPosts.postId, ids),
          eq(queuedPosts.status, "processing"),
        ),
      );
  }

  for (const post of swept) {
    await requestFinalize(post.id, post.userId, "after stale sweep");
  }
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
  // Its finalize requests wait in `finalizes` until the due posts are out.
  const finalizes = new FinalizeBatch();
  try {
    await sweepStalePublishingPosts(finalizes.request);
    // Posts some writer moved to a terminal status but whose finalize never
    // finished: the stale sweep above cannot see them. Never blocks the scan.
    await sweepUnfinalizedPosts(finalizes.request).catch((err) =>
      console.error("[publish-scheduled] unfinalized-post sweep failed", err),
    );
    return await scanDuePosts(finalizes.request);
  } finally {
    await finalizes.flush();
  }
}

/**
 * Most rows one scan loads from each of `posts` and `queued_posts`, oldest due
 * first. The scan used to load every row in the window; after an outage that
 * could be thousands, all handled in one tick. What is left waits five minutes
 * for the next one, still oldest first.
 */
export const SCAN_BATCH_LIMIT = 500;

/** Due posts claimed and dispatched at once (each claim is its own CAS). */
export const SCAN_DISPATCH_CONCURRENCY = 8;

/** Most stale `publishing` posts one sweep fails; the rest go next tick. */
export const STALE_SWEEP_LIMIT = 200;

/** Run `task` over `items`, at most `limit` at a time, in order of start. */
async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next++]!;
      await task(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function scanDuePosts(requestFinalize: RequestFinalize): Promise<{
  processed: string[];
  queuedProcessed: string[];
  armed: number;
  recovered: number;
}> {
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
    )
    .orderBy(asc(posts.scheduledAt))
    .limit(SCAN_BATCH_LIMIT);

  const processed: string[] = [];
  let armed = 0;
  let recovered = 0;

  /** Posts this scan has taken responsibility for; the queued scan skips them. */
  const handledByPostScan = new Set<string>();

  // Arm the upcoming ones first (cheap and in-process), then claim the due
  // ones in parallel: claims are per-post CAS updates, so two never take the
  // same post, and one slow enqueue no longer holds up every post after it.
  const duePosts: { id: string; userId: string; scheduledAt: Date }[] = [];
  for (const post of inWindow) {
    const scheduledAt = post.scheduledAt;
    if (!scheduledAt) continue;
    if (scheduledAt.getTime() <= now.getTime()) {
      handledByPostScan.add(post.id);
      duePosts.push({ id: post.id, userId: post.userId, scheduledAt });
      continue;
    }
    const armedOk = armScheduledPost(post.id, scheduledAt, async () => {
      await claimAndEnqueuePost(post.id, post.userId);
    });
    if (armedOk) armed += 1;
  }

  await forEachLimited(duePosts, SCAN_DISPATCH_CONCURRENCY, async (post) => {
    // Isolate per post: a single enqueue failure used to abort the whole
    // scan, leaving every later due post unpublished until the next tick.
    try {
      const ok = await claimAndEnqueuePost(post.id, post.userId, requestFinalize);
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
  });

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
    )
    .orderBy(asc(queuedPosts.scheduledFor))
    .limit(SCAN_BATCH_LIMIT);

  const queuedProcessed: string[] = [];
  const dueSlots: { id: string; postId: string; userId: string; scheduledFor: Date }[] = [];
  for (const q of queuedInWindow) {
    const scheduledFor = q.scheduledFor;
    if (!scheduledFor) continue;
    if (scheduledFor.getTime() <= now.getTime()) {
      // The posts scan owns this post for this tick: it claimed the slot row
      // alongside the post, so there is nothing left to do here and a second
      // fan-out would race the first to publish the same text.
      if (handledByPostScan.has(q.postId)) continue;
      dueSlots.push({ id: q.id, postId: q.postId, userId: q.userId, scheduledFor });
      continue;
    }
    const armedOk = armQueuedSlot(q.id, scheduledFor, async () => {
      await claimAndEnqueueQueued(q.id, q.postId, q.userId);
    });
    if (armedOk) armed += 1;
  }

  await forEachLimited(dueSlots, SCAN_DISPATCH_CONCURRENCY, async (q) => {
    try {
      const ok = await claimAndEnqueueQueued(q.id, q.postId, q.userId, requestFinalize);
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
      console.error("[publish-scheduled] queued slot enqueue failed", q.id, err);
    }
  });

  return { processed, queuedProcessed, armed, recovered };
}
