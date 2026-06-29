import { RouteResponse } from "../lib/route-response.js";
import { db } from "../db/index.js";
import { autoPlugs, connectedAccounts, userSettings } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
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

  // Order oldest-first so all plugs cycle through across runs as they resolve.
  // No explicit LIMIT - Vercel's maxDuration=60 is the natural execution cap.
  // Each Twitter API call + DELAY_MS ≈ 300-700ms, so ≈80-180 items/run in practice.
  const watching = await db
    .select()
    .from(autoPlugs)
    .where(eq(autoPlugs.status, "watching"))
    .orderBy(autoPlugs.createdAt);

  let checked = 0;
  let triggered = 0;
  let expired = 0;

  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;

  // ── Batch pre-fetch: 1 query instead of N ──────────────────────────────────
  const nonExpiredPlugs = watching.filter((p) => p.expiresAt > now);
  const expiredPlugs = watching.filter((p) => p.expiresAt <= now);

  // Expire all at once
  if (expiredPlugs.length > 0) {
    await db
      .update(autoPlugs)
      .set({ status: "expired", updatedAt: now })
      .where(
        inArray(
          autoPlugs.id,
          expiredPlugs.map((p) => p.id),
        ),
      );
    expired += expiredPlugs.length;
  }

  if (nonExpiredPlugs.length === 0) {
    return RouteResponse.json({ checked, triggered, expired });
  }

  const plugAccountIds = nonExpiredPlugs.map((p) => p.connectedAccountId);

  const accountRows = await db
    .select({
      id: connectedAccounts.id,
      userId: connectedAccounts.userId,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
      platformUserId: connectedAccounts.platformUserId,
    })
    .from(connectedAccounts)
    .where(inArray(connectedAccounts.id, plugAccountIds));

  const accountMap = new Map(accountRows.map((a) => [a.id, a]));

  // Batch-check plan limits - 1 query for all unique user IDs
  const uniqueUserIds = [...new Set(accountRows.map((a) => a.userId))];
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
    if (getPlanLimits(tier).allowAutoPlug) {
      allowedUserIds.add(s.userId);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  for (const plug of nonExpiredPlugs) {
    checked++;

    const account = accountMap.get(plug.connectedAccountId);

    if (!account?.userId || !allowedUserIds.has(account.userId)) {
      if (account?.userId) {
        logCronSkipped("autoplug", account.userId, plug.id);
      }
      continue;
    }

    if (!account?.encryptedAccessToken || !appKey || !appSecret) {
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
      const count = plug.metricType === "retweets" ? retweetCount : likeCount;

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
        "-",
        errMsg,
        errDetail ? errDetail : "",
      );
      await db
        .update(autoPlugs)
        .set({ status: "failed", updatedAt: now })
        .where(eq(autoPlugs.id, plug.id));
    }
  }

  return RouteResponse.json({ checked, triggered, expired });
}
