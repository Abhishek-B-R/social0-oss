"use server";

import { db } from "@/db";
import { connectedAccounts, postPublications } from "@/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { getSubscriptionForUser } from "@/lib/subscription";
import { getPlanLimits } from "@/lib/plans";

export type AccountLimitResult = {
  allowed: boolean;
  reason?: string;
  currentTotal: number;
  limitTotal: number;
};

export async function checkAccountLimits(
  userId: string,
  _newPlatform: string,
): Promise<AccountLimitResult> {
  const sub = await getSubscriptionForUser(userId);
  const limits = getPlanLimits(sub.tier);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, userId),
        eq(connectedAccounts.isActive, true),
      ),
    );

  const currentTotal = totalRow?.count ?? 0;

  if (currentTotal >= limits.maxConnectedAccounts) {
    return {
      allowed: false,
      reason: `Plan limit: up to ${limits.maxConnectedAccounts} connected accounts. Upgrade to add more.`,
      currentTotal,
      limitTotal: limits.maxConnectedAccounts,
    };
  }

  return {
    allowed: true,
    currentTotal,
    limitTotal: limits.maxConnectedAccounts,
  };
}

export async function checkBulkToolsAllowed(userId: string): Promise<boolean> {
  const sub = await getSubscriptionForUser(userId);
  return getPlanLimits(sub.tier).allowBulkTools;
}

export async function checkAutoPlugAllowed(userId: string): Promise<boolean> {
  const sub = await getSubscriptionForUser(userId);
  return getPlanLimits(sub.tier).allowAutoPlug;
}

export async function checkResurfaceAllowed(userId: string): Promise<boolean> {
  const sub = await getSubscriptionForUser(userId);
  return getPlanLimits(sub.tier).allowResurface;
}

/** Twitter tweets published this month (UTC) for the user. */
export async function getTwitterTweetsThisMonth(
  userId: string,
): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        eq(connectedAccounts.userId, userId),
        eq(connectedAccounts.platform, "twitter_x"),
        eq(postPublications.status, "published"),
        gte(postPublications.publishedAt, startOfMonth),
      ),
    );

  return row?.count ?? 0;
}

export type TwitterTweetLimitResult = {
  allowed: boolean;
  used: number;
  limit: number;
  reason?: string;
};

export async function checkTwitterTweetLimit(
  userId: string,
): Promise<TwitterTweetLimitResult> {
  const sub = await getSubscriptionForUser(userId);
  const limits = getPlanLimits(sub.tier);
  const used = await getTwitterTweetsThisMonth(userId);

  if (used >= limits.tweetsPerMonth) {
    return {
      allowed: false,
      used,
      limit: limits.tweetsPerMonth,
      reason: `Twitter limit: ${limits.tweetsPerMonth} tweets per month. Resets next month or upgrade for more.`,
    };
  }

  return { allowed: true, used, limit: limits.tweetsPerMonth };
}
