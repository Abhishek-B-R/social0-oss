import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  resurfaceSchedules,
  resurfaceEvents,
  postPublications,
  connectedAccounts,
} from "@/db/schema";
import { and, eq, lte, desc } from "drizzle-orm";
import { TwitterApi } from "twitter-api-v2";
import { decryptToken } from "@/lib/encryption";
import { constantTimeEquals } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === "development";

  if (!isDevelopment) {
    if (!expected) {
      return NextResponse.json(
        { error: "Cron not configured" },
        { status: 503 },
      );
    }
    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ") ||
      !constantTimeEquals(authHeader.slice(7), expected)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
    );

  let processed = 0;
  const appKey = process.env.TWITTER_CONSUMER_KEY;
  const appSecret = process.env.TWITTER_CONSUMER_SECRET;

  for (const ev of pendingEvents) {
    try {
      const [schedule] = await db
        .select({
          id: resurfaceSchedules.id,
          postId: resurfaceSchedules.postId,
          platform: resurfaceSchedules.platform,
          intervalHours: resurfaceSchedules.intervalHours,
          maxResurfaces: resurfaceSchedules.maxResurfaces,
          plugComment: resurfaceSchedules.plugComment,
          isActive: resurfaceSchedules.isActive,
          resurfacesDone: resurfaceSchedules.resurfacesDone,
        })
        .from(resurfaceSchedules)
        .where(eq(resurfaceSchedules.id, ev.scheduleId));

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

      const xPub = await db
        .select({
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
            eq(postPublications.postId, schedule.postId),
            eq(connectedAccounts.platform, "twitter_x"),
            eq(postPublications.status, "published"),
          ),
        )
        .limit(1);

      if (
        xPub.length === 0 ||
        !xPub[0].platformPostId ||
        !xPub[0].encryptedAccessToken
      ) {
        await db
          .update(resurfaceEvents)
          .set({ status: "failed" })
          .where(eq(resurfaceEvents.id, ev.eventId));
        continue;
      }

      const { platformPostId, connectedAccountId, encryptedRefreshToken, platformUserId } =
        xPub[0];
      let accessToken: string;
      let accessSecret: string | null = null;
      try {
        accessToken = decryptToken(
          xPub[0].encryptedAccessToken,
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
        const [previousDone] = await db
          .select({ plugCommentId: resurfaceEvents.plugCommentId })
          .from(resurfaceEvents)
          .where(
            and(
              eq(resurfaceEvents.scheduleId, schedule.id),
              eq(resurfaceEvents.status, "done"),
            ),
          )
          .orderBy(desc(resurfaceEvents.executedAt))
          .limit(1);

        const previousPlugId =
          previousDone?.plugCommentId?.trim() || null;
        if (previousPlugId) {
          try {
            await client.v2.deleteTweet(previousPlugId);
          } catch (delErr) {
            console.error("[cron/resurface] Delete previous plug reply:", delErr);
          }
        }

        try {
          await client.v2.unretweet(userId, platformPostId);
        } catch (unrtErr) {
          // May already be unretweeted
        }

        await client.v2.retweet(userId, platformPostId);

        let plugCommentId: string | null = null;
        if (schedule.plugComment?.trim()) {
          const replyRes = await client.v2.reply(
            schedule.plugComment.trim(),
            platformPostId,
          );
          plugCommentId = replyRes.data?.id ?? null;
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
