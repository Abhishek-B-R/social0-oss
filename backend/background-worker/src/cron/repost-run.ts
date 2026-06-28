import { NextResponse } from "../lib/next-shim.js";
import { db } from "../db/index.js";
import {
  resurfaceSchedules,
  resurfaceEvents,
  postPublications,
  connectedAccounts,
  posts,
  userSettings,
} from "../db/schema.js";
import { and, eq, lte, desc, inArray } from "drizzle-orm";
import { TwitterApi } from "twitter-api-v2";
import { decryptToken } from "../lib/encryption.js";
import { verifyCronAuth } from "../lib/cron-auth.js";
import { logCronSkipped } from "../lib/plan-analytics.js";
import { getPlanLimits, type SubscriptionTier } from "../lib/plans.js";
import { env } from "../lib/env.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

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
    // No explicit LIMIT - Vercel's maxDuration=60 is the natural execution cap.
    .orderBy(resurfaceEvents.nextExecuteAt);

  let processed = 0;
  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;

  if (pendingEvents.length === 0) {
    return NextResponse.json({ processed });
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
          })
          .from(userSettings)
          .where(inArray(userSettings.userId, uniqueUserIds))
      : [];

  const allowedUserIds = new Set<string>();
  for (const s of subRows) {
    const isExpired =
      s.subscriptionExpiresAt && new Date(s.subscriptionExpiresAt) < now;
    const tier = (
      isExpired ? "free" : (s.subscriptionTier ?? "free")
    ) as SubscriptionTier;
    if (getPlanLimits(tier).allowResurface) {
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
          .where(
            and(
              inArray(postPublications.postId, xPostIds),
              eq(connectedAccounts.platform, "twitter_x"),
              eq(postPublications.status, "published"),
            ),
          )
      : [];

  const xPubByPostId = new Map(xPubRows.map((x) => [x.postId, x]));

  // Batch-fetch most recent "done" event per schedule (for previous plug deletion)
  const prevDoneRows = await db
    .select({
      scheduleId: resurfaceEvents.scheduleId,
      plugCommentId: resurfaceEvents.plugCommentId,
    })
    .from(resurfaceEvents)
    .where(
      and(
        inArray(resurfaceEvents.scheduleId, scheduleIds),
        eq(resurfaceEvents.status, "done"),
      ),
    )
    .orderBy(desc(resurfaceEvents.executedAt));

  const prevDoneByScheduleId = new Map<string, string | null>();
  for (const row of prevDoneRows) {
    if (!prevDoneByScheduleId.has(row.scheduleId)) {
      prevDoneByScheduleId.set(
        row.scheduleId,
        row.plugCommentId?.trim() || null,
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
        await db
          .update(resurfaceEvents)
          .set({ status: "failed" })
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

      const xPub = xPubByPostId.get(schedule.postId);

      if (
        !xPub ||
        !xPub.platformPostId ||
        !xPub.encryptedAccessToken ||
        !xPub.connectedAccountId
      ) {
        await db
          .update(resurfaceEvents)
          .set({ status: "failed" })
          .where(eq(resurfaceEvents.id, ev.eventId));
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
        await db
          .update(resurfaceEvents)
          .set({ status: "failed" })
          .where(eq(resurfaceEvents.id, ev.eventId));
        continue;
      }

      if (!appKey || !appSecret || !accessSecret) {
        await db
          .update(resurfaceEvents)
          .set({ status: "failed" })
          .where(eq(resurfaceEvents.id, ev.eventId));
        continue;
      }

      const client = new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
      });

      const userId = platformUserId ?? "";
      if (!userId) {
        await db
          .update(resurfaceEvents)
          .set({ status: "failed" })
          .where(eq(resurfaceEvents.id, ev.eventId));
        continue;
      }

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

        let plugCommentId: string | null = null;
        const hasComment = schedule.plugComment?.trim();

        if (hasComment) {
          // Quote tweet: post with comment as the quote text
          const quoteRes = await client.v2.quote(hasComment, platformPostId);
          plugCommentId = quoteRes.data?.id ?? null;
        } else {
          // Plain retweet
          try {
            await client.v2.unretweet(userId, platformPostId);
          } catch (unrtErr) {
            // May already be unretweeted
          }
          await client.v2.retweet(userId, platformPostId);
        }

        await db
          .update(resurfaceEvents)
          .set({
            status: "done",
            executedAt: now,
            platformReshareId: null,
            plugCommentId,
          })
          .where(eq(resurfaceEvents.id, ev.eventId));

        const newDone = schedule.resurfacesDone + 1;
        await db
          .update(resurfaceSchedules)
          .set({
            resurfacesDone: newDone,
            isActive: newDone < schedule.maxResurfaces,
            updatedAt: now,
          })
          .where(eq(resurfaceSchedules.id, schedule.id));

        if (newDone < schedule.maxResurfaces) {
          const nextAt = new Date(
            now.getTime() + schedule.intervalHours * 60 * 60 * 1000,
          );
          await db.insert(resurfaceEvents).values({
            scheduleId: schedule.id,
            status: "pending",
            nextExecuteAt: nextAt,
          });
        }

        processed++;
      } catch (e) {
        console.error("[cron/resurface] Twitter API error:", e);
        await db
          .update(resurfaceEvents)
          .set({ status: "failed" })
          .where(eq(resurfaceEvents.id, ev.eventId));
      }
    } catch (e) {
      console.error("[cron/resurface] Event processing error:", e);
    }
  }

  return NextResponse.json({ processed });
}
