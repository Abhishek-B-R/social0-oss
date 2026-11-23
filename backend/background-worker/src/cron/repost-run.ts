import { db } from "../db/index.js";
import {
  resurfaceSchedules,
  resurfaceEvents,
  postPublications,
  connectedAccounts,
  posts,
  userSettings,
} from "../db/schema.js";
import { and, eq, lte, desc, inArray, sql } from "drizzle-orm";
import { decryptToken } from "@social0/shared";
import { logCronSkipped } from "@social0/shared";
import { getPlanLimits } from "@social0/shared";
import { env } from "../lib/env.js";
import { effectiveTier } from "../lib/effective-tier.js";
import { classifyXError, createXUserClient } from "../lib/x-client.js";
import {
  claimCronWork,
  resurfaceEventClaimKey,
} from "../lib/claim-cron-work.js";

/** How soon a transient X failure is retried (capped at the rule's interval). */
export const REPOST_RETRY_DELAY_MS = 15 * 60 * 1000;
/**
 * Consecutive failures that still get the short retry. Past this the rule
 * falls back to its own interval, so an X outage that outlasts the retries
 * neither hammers the API nor ends the rule.
 */
export const REPOST_MAX_FAST_RETRIES = 3;

/**
 * - `transient`: X refused or failed in a way a retry may fix; retried soon.
 * - `permanent`: fails the same way until the user acts; the rule is paused.
 * - `unknown_outcome`: a quote that got no (complete) answer from X. X may
 *   have posted it, and its id never came back, so a quick retry would post a
 *   second quote (or 403 on duplicate content and pause the rule). The run is
 *   recorded as failed and the next one waits for the rule's own interval.
 */
export type RepostFailureKind = "transient" | "permanent" | "unknown_outcome";

/**
 * Whether a failed repost is worth retrying.
 *
 * Rate limits, timeouts, X 5xx and network errors pass on their own. Any other
 * X 4xx (revoked token, deleted tweet, missing write access) fails the same way
 * every time until the user acts. Unrecognised errors count as transient: a
 * retry on the rule's cadence is cheaper than a rule that stops for good.
 */
export function classifyRepostError(err: unknown): RepostFailureKind {
  if (err && typeof err === "object") {
    const { type, code } = err as { type?: unknown; code?: unknown };
    if (type === "response" && typeof code === "number") {
      if (code === 408 || code === 425 || code === 429 || code >= 500) {
        return "transient";
      }
      if (code >= 400) return "permanent";
    }
  }
  return "transient";
}

/**
 * How a failed quote tweet (a run with a plug comment) is classified.
 *
 * Unlike a retweet (unretweet + retweet is idempotent), a quote is a new
 * tweet each time: a timeout or dropped connection leaves it unknown whether
 * X created it, so it must not get the fast retry.
 */
export function classifyQuoteError(err: unknown): RepostFailureKind {
  if (classifyXError(err) === "no_response") return "unknown_outcome";
  return classifyRepostError(err);
}

/** When the replacement pending event for a transiently failed run is due. */
export function repostRetryAt(
  now: Date,
  intervalHours: number,
  failuresBefore: number,
): Date {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const delayMs =
    failuresBefore < REPOST_MAX_FAST_RETRIES
      ? Math.min(REPOST_RETRY_DELAY_MS, intervalMs)
      : intervalMs;
  return new Date(now.getTime() + delayMs);
}

/**
 * Close a pending event as a failed run without ending the rule by accident.
 *
 * `executedAt` is stamped so the failure is the rule's latest run on the
 * Automations page (a null one sorted behind every earlier success). A
 * transient failure queues the next attempt (a quote of unknown outcome only
 * at the rule's own interval); a permanent one pauses the rule so
 * the page stops presenting it as live. Both happen in one transaction, and
 * only if this run still owned the pending row, so a crash between the writes
 * cannot leave an active rule with nothing pending again.
 */
async function recordFailedRun(input: {
  eventId: string;
  scheduleId: string;
  intervalHours: number;
  failuresBefore: number;
  kind: RepostFailureKind;
  now: Date;
}): Promise<void> {
  const { eventId, scheduleId, kind, now } = input;
  await db.transaction(async (tx) => {
    const closed = await tx
      .update(resurfaceEvents)
      .set({ status: "failed", executedAt: now })
      .where(
        and(
          eq(resurfaceEvents.id, eventId),
          eq(resurfaceEvents.status, "pending"),
        ),
      )
      .returning({ id: resurfaceEvents.id });
    if (closed.length === 0) return;

    if (kind === "permanent") {
      await tx
        .update(resurfaceSchedules)
        .set({ isActive: false, updatedAt: now })
        .where(eq(resurfaceSchedules.id, scheduleId));
      return;
    }

    await tx.insert(resurfaceEvents).values({
      scheduleId,
      status: "pending",
      nextExecuteAt:
        kind === "unknown_outcome"
          ? new Date(now.getTime() + input.intervalHours * 60 * 60 * 1000)
          : repostRetryAt(now, input.intervalHours, input.failuresBefore),
    });
  });
}

/**
 * Book a repost X accepted: close the event, count it, queue the next one.
 *
 * The schedule is read once at the start of the run, and a run that works
 * through a backlog (up to three X calls per event) can last minutes. The
 * count and the active flag are therefore computed from the row as it is now,
 * not from that snapshot: writing the snapshot back used to undo a pause the
 * user made mid-run (and the next event was queued anyway), and judged the run
 * against a `maxResurfaces` the user had since changed. The next event's
 * interval comes from the same fresh row.
 *
 * All three writes are one transaction, so a restart between them cannot
 * leave the event `done` with no pending successor while the rule still reads
 * active; nothing else would ever queue one. Returns false when the event was
 * no longer pending, in which case nothing is written.
 */
async function recordSuccessfulRun(input: {
  eventId: string;
  scheduleId: string;
  plugCommentId: string | null;
  now: Date;
}): Promise<boolean> {
  const { eventId, scheduleId, plugCommentId, now } = input;
  return db.transaction(async (tx) => {
    const closed = await tx
      .update(resurfaceEvents)
      .set({
        status: "done",
        executedAt: now,
        platformReshareId: null,
        plugCommentId,
      })
      .where(
        and(
          eq(resurfaceEvents.id, eventId),
          eq(resurfaceEvents.status, "pending"),
        ),
      )
      .returning({ id: resurfaceEvents.id });
    if (closed.length === 0) return false;

    // Postgres evaluates every right-hand side against the row before this
    // update, so `resurfaces_done + 1` is the new count in both expressions.
    const [updated] = await tx
      .update(resurfaceSchedules)
      .set({
        resurfacesDone: sql`${resurfaceSchedules.resurfacesDone} + 1`,
        isActive: sql`${resurfaceSchedules.isActive} and ${resurfaceSchedules.resurfacesDone} + 1 < ${resurfaceSchedules.maxResurfaces}`,
        updatedAt: now,
      })
      .where(eq(resurfaceSchedules.id, scheduleId))
      .returning({
        isActive: resurfaceSchedules.isActive,
        intervalHours: resurfaceSchedules.intervalHours,
      });

    // Paused, finished or deleted: nothing more to queue.
    if (!updated?.isActive) return true;

    await tx.insert(resurfaceEvents).values({
      scheduleId,
      status: "pending",
      nextExecuteAt: new Date(
        now.getTime() + updated.intervalHours * 60 * 60 * 1000,
      ),
    });
    return true;
  });
}

export async function runRepostCron() {
  const now = new Date();

  const pendingEvents = await db
    .select({
      eventId: resurfaceEvents.id,
      scheduleId: resurfaceEvents.scheduleId,
      platformReshareId: resurfaceEvents.platformReshareId,
      plugCommentId: resurfaceEvents.plugCommentId,
    })
    .from(resurfaceEvents)
    .where(
      and(
        eq(resurfaceEvents.status, "pending"),
        lte(resurfaceEvents.nextExecuteAt, now),
      ),
    )
    // Most overdue first - guarantees no event starves waiting behind newer ones.
    // No explicit LIMIT - job runtime is bounded by the worker process.
    .orderBy(resurfaceEvents.nextExecuteAt);

  let processed = 0;
  let loggedMissingAppKeys = false;
  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;

  if (pendingEvents.length === 0) {
    return { processed };
  }

  // ── Batch pre-fetch: 3 queries instead of 3N ──────────────────────────────
  const scheduleIds = [...new Set(pendingEvents.map((e) => e.scheduleId))];

  const scheduleRows = await db
    .select({
      id: resurfaceSchedules.id,
      postId: resurfaceSchedules.postId,
      platform: resurfaceSchedules.platform,
      intervalHours: resurfaceSchedules.intervalHours,
      maxResurfaces: resurfaceSchedules.maxResurfaces,
      plugComment: resurfaceSchedules.plugComment,
      isActive: resurfaceSchedules.isActive,
      resurfacesDone: resurfaceSchedules.resurfacesDone,
      userId: posts.userId,
    })
    .from(resurfaceSchedules)
    .innerJoin(posts, eq(resurfaceSchedules.postId, posts.id))
    .where(inArray(resurfaceSchedules.id, scheduleIds));

  const scheduleMap = new Map(scheduleRows.map((s) => [s.id, s]));

  // Batch plan-limit check for all unique user IDs
  const uniqueUserIds = [
    ...new Set(scheduleRows.map((s) => s.userId).filter(Boolean)),
  ];
  const subRows =
    uniqueUserIds.length > 0
      ? await db
          .select({
            userId: userSettings.userId,
            subscriptionTier: userSettings.subscriptionTier,
            subscriptionExpiresAt: userSettings.subscriptionExpiresAt,
            subscriptionCancelAtPeriodEnd:
              userSettings.subscriptionCancelAtPeriodEnd,
          })
          .from(userSettings)
          .where(inArray(userSettings.userId, uniqueUserIds))
      : [];

  // Same plan rule as the API (`getSubscriptionForUser`), so a rule the API
  // let the user set up is not skipped here between the billing date and the
  // renewal webhook.
  const allowedUserIds = new Set<string>();
  for (const s of subRows) {
    if (getPlanLimits(effectiveTier(s, now)).allowResurface) {
      allowedUserIds.add(s.userId);
    }
  }

  // Batch-fetch X publications for all relevant post IDs
  const xPostIds = scheduleRows
    .filter(
      (s) =>
        s.platform === "x" && s.isActive && s.resurfacesDone < s.maxResurfaces,
    )
    .map((s) => s.postId);

  const xPubRows =
    xPostIds.length > 0
      ? await db
          .select({
            postId: postPublications.postId,
            platformPostId: postPublications.platformPostId,
            connectedAccountId: postPublications.connectedAccountId,
            encryptedAccessToken: connectedAccounts.encryptedAccessToken,
            encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
            platformUserId: connectedAccounts.platformUserId,
          })
          .from(postPublications)
          .innerJoin(
            connectedAccounts,
            eq(postPublications.connectedAccountId, connectedAccounts.id),
          )
          // Join back to posts on the owner too: a connection can change hands
          // (Teams workspace move), and a repost must never run on an account
          // the post's owner no longer holds.
          .innerJoin(
            posts,
            and(
              eq(postPublications.postId, posts.id),
              eq(connectedAccounts.userId, posts.userId),
            ),
          )
          .where(
            and(
              inArray(postPublications.postId, xPostIds),
              eq(connectedAccounts.platform, "twitter_x"),
              eq(postPublications.status, "published"),
            ),
          )
      : [];

  const xPubByPostId = new Map(xPubRows.map((x) => [x.postId, x]));

  // Batch-fetch run history per schedule, newest first: the latest "done" run
  // carries the plug to delete, and the failures above it are the current
  // streak that decides how soon a transient failure is retried. Legacy failed
  // rows have no executedAt, so fall back to when they were due.
  const historyRows = await db
    .select({
      scheduleId: resurfaceEvents.scheduleId,
      status: resurfaceEvents.status,
      plugCommentId: resurfaceEvents.plugCommentId,
    })
    .from(resurfaceEvents)
    .where(
      and(
        inArray(resurfaceEvents.scheduleId, scheduleIds),
        inArray(resurfaceEvents.status, ["done", "failed"]),
      ),
    )
    .orderBy(
      desc(
        sql`coalesce(${resurfaceEvents.executedAt}, ${resurfaceEvents.nextExecuteAt}, ${resurfaceEvents.createdAt})`,
      ),
    );

  const prevDoneByScheduleId = new Map<string, string | null>();
  const failuresSinceDone = new Map<string, number>();
  for (const row of historyRows) {
    if (prevDoneByScheduleId.has(row.scheduleId)) continue;
    if (row.status === "done") {
      prevDoneByScheduleId.set(
        row.scheduleId,
        row.plugCommentId?.trim() || null,
      );
    } else {
      failuresSinceDone.set(
        row.scheduleId,
        (failuresSinceDone.get(row.scheduleId) ?? 0) + 1,
      );
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  for (const ev of pendingEvents) {
    try {
      const scheduleRow = scheduleMap.get(ev.scheduleId);

      const schedule = scheduleRow
        ? {
            id: scheduleRow.id,
            postId: scheduleRow.postId,
            platform: scheduleRow.platform,
            intervalHours: scheduleRow.intervalHours,
            maxResurfaces: scheduleRow.maxResurfaces,
            plugComment: scheduleRow.plugComment,
            isActive: scheduleRow.isActive,
            resurfacesDone: scheduleRow.resurfacesDone,
          }
        : null;

      if (
        !schedule ||
        !schedule.isActive ||
        schedule.resurfacesDone >= schedule.maxResurfaces
      ) {
        // Paused, finished or deleted rule: nothing ran, so this is not a
        // failed run (the Automations page counts "failed" events as failures).
        // Resuming a rule inserts a fresh pending event.
        await db
          .update(resurfaceEvents)
          .set({ status: "cancelled" })
          .where(eq(resurfaceEvents.id, ev.eventId));
        continue;
      }

      if (schedule.platform !== "x") continue;

      const scheduleUserId = scheduleRow?.userId;
      if (!scheduleUserId || !allowedUserIds.has(scheduleUserId)) {
        if (scheduleUserId) {
          logCronSkipped("resurface", scheduleUserId, ev.scheduleId);
        }
        continue;
      }

      const failRun = (kind: RepostFailureKind) =>
        recordFailedRun({
          eventId: ev.eventId,
          scheduleId: schedule.id,
          intervalHours: schedule.intervalHours,
          failuresBefore: failuresSinceDone.get(schedule.id) ?? 0,
          kind,
          now,
        });

      // Operator misconfiguration, not the user's rule: leave the event
      // pending so it runs once the app credentials are back.
      if (!appKey || !appSecret) {
        if (!loggedMissingAppKeys) {
          console.error(
            "[cron/resurface] TWITTER_CONSUMER_KEY/SECRET not set; reposts are on hold",
          );
          loggedMissingAppKeys = true;
        }
        continue;
      }

      const xPub = xPubByPostId.get(schedule.postId);

      // The X publication or its account is gone, or the account cannot sign
      // OAuth 1.0a requests: every retry would fail the same way until the
      // user reconnects, so pause the rule instead of leaving it "active".
      if (
        !xPub ||
        !xPub.platformPostId ||
        !xPub.encryptedAccessToken ||
        !xPub.connectedAccountId
      ) {
        await failRun("permanent");
        continue;
      }

      const {
        platformPostId,
        connectedAccountId,
        encryptedRefreshToken,
        platformUserId,
      } = xPub;
      let accessToken: string;
      let accessSecret: string | null = null;
      try {
        accessToken = decryptToken(
          xPub.encryptedAccessToken,
          connectedAccountId,
        );
        if (encryptedRefreshToken) {
          accessSecret = decryptToken(
            encryptedRefreshToken,
            connectedAccountId,
          );
        }
      } catch (e) {
        console.error("[cron/resurface] Decrypt token failed:", e);
        await failRun("permanent");
        continue;
      }

      const userId = platformUserId ?? "";
      if (!accessSecret || !userId) {
        await failRun("permanent");
        continue;
      }

      // Timed out per request: a stalled X call must not hold the scheduler.
      const client = createXUserClient({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      });

      // Last gate before anything reaches X. Everything above is a read or an
      // idempotent terminal mark, so claiming here keeps the exclusive window
      // as small as the work that actually cannot be repeated.
      if (!(await claimCronWork(resurfaceEventClaimKey(ev.eventId)))) {
        console.info(
          "[cron/resurface] event already claimed by another run",
          ev.eventId,
        );
        continue;
      }

      // Only the X calls are classified as a failed run. A database error
      // after X accepted the repost must not schedule a retry that would post
      // it a second time; it falls through to the outer catch instead.
      let plugCommentId: string | null = null;
      const hasComment = schedule.plugComment?.trim();
      try {
        const previousPlugId = prevDoneByScheduleId.get(schedule.id) ?? null;
        if (previousPlugId) {
          try {
            await client.v2.deleteTweet(previousPlugId);
          } catch (delErr) {
            console.error(
              "[cron/resurface] Delete previous plug tweet:",
              delErr,
            );
          }
        }

        if (hasComment) {
          // Quote tweet: post with comment as the quote text
          const quoteRes = await client.v2.quote(hasComment, platformPostId);
          plugCommentId = quoteRes.data?.id ?? null;
        } else {
          // Plain retweet
          try {
            await client.v2.unretweet(userId, platformPostId);
          } catch (_unrtErr) {
            // May already be unretweeted
          }
          await client.v2.retweet(userId, platformPostId);
        }
      } catch (e) {
        console.error("[cron/resurface] Twitter API error:", e);
        const kind = hasComment
          ? classifyQuoteError(e)
          : classifyRepostError(e);
        if (kind === "unknown_outcome") {
          console.error(
            "[cron/resurface] quote got no answer from X and may have posted; not retrying before the next interval",
            ev.eventId,
          );
        }
        await failRun(kind);
        continue;
      }

      if (
        await recordSuccessfulRun({
          eventId: ev.eventId,
          scheduleId: schedule.id,
          plugCommentId,
          now,
        })
      ) {
        processed++;
      }
    } catch (e) {
      console.error("[cron/resurface] Event processing error:", e);
    }
  }

  return { processed };
}
