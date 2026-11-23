import { db } from "../db/index.js";
import { autoPlugs, connectedAccounts, userSettings } from "../db/schema.js";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { decryptToken } from "@social0/shared";
import { logCronSkipped } from "@social0/shared";
import { getPlanLimits } from "@social0/shared";
import { env } from "../lib/env.js";
import { effectiveTier } from "../lib/effective-tier.js";
import {
  autoPlugClaimKey,
  claimCronWork,
  releaseCronWork,
} from "../lib/claim-cron-work.js";
import { classifyXError, createXUserClient } from "../lib/x-client.js";

/**
 * Plugs checked per run. Every watching plug costs one X read per run, so an
 * unbounded scan grows with the number of plugs and holds the scheduler for
 * as long as it takes. Plugs are taken least-recently-checked first and
 * stamped when taken, so a backlog rotates through instead of starving.
 */
export const AUTOPLUG_BATCH_LIMIT = 200;

function logXError(stage: string, plugId: string, platformPostId: string, e: unknown) {
  const errMsg = e instanceof Error ? e.message : String(e);
  const errDetail =
    e && typeof e === "object" && "data" in e
      ? JSON.stringify((e as { data?: unknown }).data)
      : "";
  console.error(
    `[cron/autoplug] Twitter API error (${stage}) for plug`,
    plugId,
    "platformPostId:",
    platformPostId,
    "-",
    errMsg,
    errDetail ? errDetail : "",
  );
}

export async function runAutoplugCron() {
  const now = new Date();

  let checked = 0;
  let triggered = 0;

  // Expire in SQL, so the batch below is spent on plugs that can still fire.
  const expiredRows = await db
    .update(autoPlugs)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(autoPlugs.status, "watching"), lte(autoPlugs.expiresAt, now)))
    .returning({ id: autoPlugs.id });
  const expired = expiredRows.length;

  // `updated_at` is the last time a run took the plug (stamped just below), so
  // ordering on it cycles every plug through when there are more than fit.
  const nonExpiredPlugs = await db
    .select()
    .from(autoPlugs)
    .where(and(eq(autoPlugs.status, "watching"), gt(autoPlugs.expiresAt, now)))
    .orderBy(sql`${autoPlugs.updatedAt} asc nulls first`, autoPlugs.createdAt)
    .limit(AUTOPLUG_BATCH_LIMIT);

  if (nonExpiredPlugs.length === 0) {
    return { checked, triggered, expired };
  }

  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;

  // Operator misconfiguration, not the users' plugs: hold every plug where it
  // is until the app credentials are back. Failing them here failed every
  // watching plug within a few runs, and restoring the keys brought none back
  // (only `watching` plugs are scanned). Checked before the stamp below, so
  // the plugs also keep their place in the rotation.
  if (!appKey || !appSecret) {
    console.error(
      "[cron/autoplug] TWITTER_CONSUMER_KEY/SECRET not set; plugs are on hold",
    );
    return { checked, triggered, expired };
  }

  // Stamp the batch up front, whatever happens to each plug below: a plug this
  // run skips (plan, rate limit, X down) must not hold its place at the head.
  await db
    .update(autoPlugs)
    .set({ updatedAt: now })
    .where(
      and(
        inArray(
          autoPlugs.id,
          nonExpiredPlugs.map((p) => p.id),
        ),
        eq(autoPlugs.status, "watching"),
      ),
    );

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
            subscriptionCancelAtPeriodEnd:
              userSettings.subscriptionCancelAtPeriodEnd,
          })
          .from(userSettings)
          .where(inArray(userSettings.userId, uniqueUserIds))
      : [];

  // Same plan rule as the API (`getSubscriptionForUser`), so a plug the API
  // let the user set up is not skipped here between the billing date and the
  // renewal webhook.
  const allowedUserIds = new Set<string>();
  for (const s of subRows) {
    if (getPlanLimits(effectiveTier(s, now)).allowAutoPlug) {
      allowedUserIds.add(s.userId);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  /** Accounts X rate-limited this run; their remaining plugs wait. */
  const rateLimitedAccounts = new Set<string>();

  for (const plug of nonExpiredPlugs) {
    if (rateLimitedAccounts.has(plug.connectedAccountId)) continue;
    checked++;

    const account = accountMap.get(plug.connectedAccountId);

    if (!account?.userId || !allowedUserIds.has(account.userId)) {
      if (account?.userId) {
        logCronSkipped("autoplug", account.userId, plug.id);
      }
      continue;
    }

    if (!account?.encryptedAccessToken) {
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

    const client = createXUserClient({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });

    // Read the tweet. A failed read changed nothing on X, so anything X or the
    // network might recover from leaves the plug watching for the next run;
    // only an answer that will not change (bad token, tweet gone) fails it.
    let count: number;
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

      const metrics = tweet.data.public_metrics;
      const likeCount = metrics?.like_count ?? 0;
      const retweetCount = metrics?.retweet_count ?? 0;
      count = plug.metricType === "retweets" ? retweetCount : likeCount;
    } catch (e) {
      logXError("read", plug.id, plug.platformPostId, e);
      const kind = classifyXError(e);
      if (kind === "rate_limited") {
        // The limit is per user token: the account's other plugs would only
        // 429 too, so leave them for a later run.
        rateLimitedAccounts.add(plug.connectedAccountId);
        continue;
      }
      if (kind === "server_error" || kind === "no_response") continue;
      await db
        .update(autoPlugs)
        .set({ status: "failed", updatedAt: now })
        .where(eq(autoPlugs.id, plug.id));
      continue;
    }

    if (count < plug.metricThreshold) {
      continue;
    }

    // The threshold is met and the reply is about to go out — the one step in
    // this loop that cannot be repeated. Claim it so two overlapping runs
    // cannot both post the plug comment.
    const claimKey = autoPlugClaimKey(plug.id);
    if (!(await claimCronWork(claimKey))) {
      console.info(
        "[cron/autoplug] plug already claimed by another run",
        plug.id,
      );
      continue;
    }

    let plugTweetId: string | null;
    try {
      const replyRes = await client.v2.reply(
        plug.plugComment,
        plug.platformPostId,
      );
      plugTweetId = replyRes.data?.id ?? null;
    } catch (e) {
      logXError("reply", plug.id, plug.platformPostId, e);
      const kind = classifyXError(e);
      // X answered with a refusal (429 / 5xx): no reply was created, so retry
      // on a later run and hand the claim back for it. A request that got no
      // answer may have posted the reply, and retrying could post it twice:
      // fail it, as for any other refusal.
      if (kind === "rate_limited" || kind === "server_error") {
        if (kind === "rate_limited") {
          rateLimitedAccounts.add(plug.connectedAccountId);
        }
        await releaseCronWork(claimKey);
        continue;
      }
      await db
        .update(autoPlugs)
        .set({ status: "failed", updatedAt: now })
        .where(eq(autoPlugs.id, plug.id));
      continue;
    }

    triggered++;
    try {
      await db
        .update(autoPlugs)
        .set({
          status: "triggered",
          plugTweetId,
          updatedAt: now,
        })
        .where(eq(autoPlugs.id, plug.id));
    } catch (e) {
      // The reply is out; the claim keeps the next runs from repeating it
      // while the lease lasts. Keep going for the other plugs.
      console.error("[cron/autoplug] could not mark plug triggered", plug.id, e);
    }
  }

  return { checked, triggered, expired };
}
