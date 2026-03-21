import { NextResponse } from "next/server";
import { db } from "@/db";
import { autoPlugs, connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TwitterApi } from "twitter-api-v2";
import { decryptToken } from "@/lib/encryption";
import { verifyCronAuth } from "@/lib/cron-auth";
import { checkAutoPlugAllowed } from "@/lib/plan-limits";
import { logCronSkipped } from "@/lib/plan-analytics";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const now = new Date();

  const watching = await db
    .select()
    .from(autoPlugs)
    .where(eq(autoPlugs.status, "watching"));

  let checked = 0;
  let triggered = 0;
  let expired = 0;

  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;

  for (const plug of watching) {
    if (plug.expiresAt <= now) {
      await db
        .update(autoPlugs)
        .set({ status: "expired", updatedAt: now })
        .where(eq(autoPlugs.id, plug.id));
      expired++;
      continue;
    }

    checked++;

    const [account] = await db
      .select({
        userId: connectedAccounts.userId,
        encryptedAccessToken: connectedAccounts.encryptedAccessToken,
        encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
        platformUserId: connectedAccounts.platformUserId,
      })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, plug.connectedAccountId))
      .limit(1);

    if (!account?.userId || !(await checkAutoPlugAllowed(account.userId))) {
      if (account?.userId) {
        logCronSkipped("autoplug", account.userId, plug.id);
      }
      continue;
    }

    if (
      !account?.encryptedAccessToken ||
      !appKey ||
      !appSecret
    ) {
      await db
        .update(autoPlugs)
        .set({ status: "failed", updatedAt: now })
        .where(eq(autoPlugs.id, plug.id));
      continue;
    }

    let accessToken: string;
    let accessSecret: string | null = null;
    try {
      accessToken = decryptToken(
        account.encryptedAccessToken,
        plug.connectedAccountId,
      );
      if (account.encryptedRefreshToken) {
        accessSecret = decryptToken(
          account.encryptedRefreshToken,
          plug.connectedAccountId,
        );
      }
    } catch (e) {
      console.error("[cron/autoplug] Decrypt token failed:", e);
      await db
        .update(autoPlugs)
        .set({ status: "failed", updatedAt: now })
        .where(eq(autoPlugs.id, plug.id));
      continue;
    }

    if (!accessSecret) {
      await db
        .update(autoPlugs)
        .set({ status: "failed", updatedAt: now })
        .where(eq(autoPlugs.id, plug.id));
      continue;
    }

    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });

    try {
      const tweet = await client.v2.singleTweet(plug.platformPostId, {
        "tweet.fields": ["public_metrics"],
      });

      if (!tweet.data) {
        console.error(
          "[cron/autoplug] No tweet data for plug",
          plug.id,
          "platformPostId:",
          plug.platformPostId,
        );
        await db
          .update(autoPlugs)
          .set({ status: "failed", updatedAt: now })
          .where(eq(autoPlugs.id, plug.id));
        continue;
      }

      const metrics = tweet.data?.public_metrics;
      const likeCount = metrics?.like_count ?? 0;
      const retweetCount = metrics?.retweet_count ?? 0;
      const count =
        plug.metricType === "retweets" ? retweetCount : likeCount;

      if (count < plug.metricThreshold) {
        continue;
      }

      const replyRes = await client.v2.reply(
        plug.plugComment,
        plug.platformPostId,
      );
      const plugTweetId = replyRes.data?.id ?? null;

      await db
        .update(autoPlugs)
        .set({
          status: "triggered",
          plugTweetId,
          updatedAt: now,
        })
        .where(eq(autoPlugs.id, plug.id));

      triggered++;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const errDetail =
        e && typeof e === "object" && "data" in e
          ? JSON.stringify((e as { data?: unknown }).data)
          : "";
      console.error(
        "[cron/autoplug] Twitter API error for plug",
        plug.id,
        "platformPostId:",
        plug.platformPostId,
        "—",
        errMsg,
        errDetail ? errDetail : "",
      );
      await db
        .update(autoPlugs)
        .set({ status: "failed", updatedAt: now })
        .where(eq(autoPlugs.id, plug.id));
    }
  }

  return NextResponse.json({ checked, triggered, expired });
}
