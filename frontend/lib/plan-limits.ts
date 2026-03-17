"use server";

import { db } from "@/db";
import { connectedAccounts, postPublications } from "@/db/schema";
import { eq, and, sql, gte, asc, inArray } from "drizzle-orm";
import { getSubscriptionForUser } from "@/lib/subscription";
import { getPlanLimits } from "@/lib/plans";

/**
 * Sync connected_accounts.isActive to plan limit.
 * Keeps the first N accounts (by createdAt ASC — oldest first) active; extra
 * are marked isActive = false. This ordering is GLOBAL across all platforms so
 * limit behavior is deterministic and matches the composer account picker.
 */
export async function syncConnectedAccountsToLimit(userId: string): Promise<void> {
  const sub = await getSubscriptionForUser(userId);
  const limitTotal = getPlanLimits(sub.tier).maxConnectedAccounts;

  const accounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, userId))
    .orderBy(asc(connectedAccounts.createdAt));

  if (accounts.length === 0) return;

  const toActivate = limitTotal > 0 ? accounts.slice(0, limitTotal) : [];
  const toDeactivate = limitTotal > 0 ? accounts.slice(limitTotal) : accounts;

  const activateIds = toActivate.map((a) => a.id);
  const deactivateIds = toDeactivate.map((a) => a.id);

  if (activateIds.length > 0) {
    await db
      .update(connectedAccounts)
      .set({ isActive: true })
      .where(and(eq(connectedAccounts.userId, userId), inArray(connectedAccounts.id, activateIds)));
  }
  if (deactivateIds.length > 0) {
    await db
      .update(connectedAccounts)
      .set({ isActive: false })
      .where(and(eq(connectedAccounts.userId, userId), inArray(connectedAccounts.id, deactivateIds)));
  }
}

export type AccountLimitResult = {
  allowed: boolean;
  reason?: string;
  currentTotal: number;
  limitTotal: number;
  /** True once user has ever had a paid plan. Used for trial vs upgrade messaging when limit is 0. */
  hasUsedTrial: boolean;
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
    const reason =
      limits.maxConnectedAccounts === 0
        ? sub.hasUsedTrial
          ? "Upgrade to a plan to connect accounts and start posting."
          : "Start your 7-day free trial to connect accounts and start posting."
        : `Plan limit: up to ${limits.maxConnectedAccounts} connected accounts. Upgrade to add more.`;
    return {
      allowed: false,
      reason,
      currentTotal,
      limitTotal: limits.maxConnectedAccounts,
      hasUsedTrial: sub.hasUsedTrial,
    };
  }

  return {
    allowed: true,
    currentTotal,
    limitTotal: limits.maxConnectedAccounts,
    hasUsedTrial: sub.hasUsedTrial,
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
