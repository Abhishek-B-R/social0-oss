
import { db } from "../db/instance.js";
import { connectedAccounts, userSettings } from "../db/schema.js";
import { eq, and, sql, asc, inArray } from "drizzle-orm";
import { getSubscriptionForUser } from "./subscription.js";
import { getPlanLimits, isActiveTier } from "./plans.js";
import { twitterPublishLimiter, enforceRateLimit } from "./ratelimit.js";

/**
 * Sync connected_accounts.isActive to plan limit.
 * Keeps the first N accounts (by createdAt ASC - oldest first) active; extra
 * are marked isActive = false. This ordering is GLOBAL across all platforms so
 * limit behavior is deterministic and matches the composer account picker.
 */
export async function syncConnectedAccountsToLimit(
  userId: string,
): Promise<void> {
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
      .where(
        and(
          eq(connectedAccounts.userId, userId),
          inArray(connectedAccounts.id, activateIds),
        ),
      );
  }
  if (deactivateIds.length > 0) {
    await db
      .update(connectedAccounts)
      .set({ isActive: false })
      .where(
        and(
          eq(connectedAccounts.userId, userId),
          inArray(connectedAccounts.id, deactivateIds),
        ),
      );
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
    const reason = `Plan limit: up to ${limits.maxConnectedAccounts} connected accounts. Upgrade to add more.`;
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

export type TwitterPublishRateLimitResult = {
  allowed: boolean;
  reason?: string;
};

/** Short-window X posting cap to catch automation; normal users should not hit this. */
export async function checkTwitterPublishRateLimit(
  userId: string,
  pendingTweetCount: number,
): Promise<TwitterPublishRateLimitResult> {
  if (pendingTweetCount <= 0) {
    return { allowed: true };
  }

  const rate = await enforceRateLimit(twitterPublishLimiter, userId, {
    rate: pendingTweetCount,
    failClosedWhenUnavailable: false,
  });
  if (!rate.allowed) {
    // X publish throttling is an anti-automation guard, not a core availability
    // dependency. If Redis/rate limiting is unavailable, let the platform publish
    // attempt proceed and let X return the authoritative result.
    if (rate.status === 503) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        "You're posting to X too quickly. Please wait a few minutes and try again.",
    };
  }

  return { allowed: true };
}

export async function getFreePostsUsed(userId: string): Promise<number> {
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { freePostsUsed: true },
  });
  return row?.freePostsUsed ?? 0;
}

export type FreePostLimitResult = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
};

export async function checkFreePostLimit(
  userId: string,
): Promise<FreePostLimitResult> {
  const sub = await getSubscriptionForUser(userId);
  if (isActiveTier(sub.tier)) {
    return {
      allowed: true,
      used: 0,
      limit: 0,
      remaining: Number.POSITIVE_INFINITY,
    };
  }

  const limit = getPlanLimits("free").maxFreePosts;
  const used = await getFreePostsUsed(userId);
  const remaining = Math.max(0, limit - used);

  if (used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      remaining: 0,
      reason: `You've used your ${limit} free posts. Subscribe to continue posting.`,
    };
  }

  return { allowed: true, used, limit, remaining };
}

/**
 * @deprecated Use `reserveFreePost`. Checking the limit and then incrementing
 * leaves a window where concurrent submissions each pass the check.
 */
export async function incrementFreePostsUsed(userId: string): Promise<void> {
  const sub = await getSubscriptionForUser(userId);
  if (isActiveTier(sub.tier)) return;

  // Atomic increment - concurrent publishes must not read-modify-write.
  await db
    .update(userSettings)
    .set({ freePostsUsed: sql`${userSettings.freePostsUsed} + 1` })
    .where(eq(userSettings.userId, userId));
}

export type FreePostReservation =
  | { allowed: true; consumed: boolean }
  | { allowed: false; reason: string; used: number; limit: number };

/**
 * Take one free post, atomically.
 *
 * `checkFreePostLimit` + `incrementFreePostsUsed` was a read-modify-write: two
 * "Publish now" clicks that raced both saw `used < limit` and both went
 * through. The conditional UPDATE makes the limit the thing that decides, so a
 * loser simply gets zero rows back.
 *
 * Paid tiers are unlimited and reserve nothing (`consumed: false`).
 * Release with `releaseFreePost` when the work the reservation paid for did not
 * happen.
 */
export async function reserveFreePost(
  userId: string,
): Promise<FreePostReservation> {
  const sub = await getSubscriptionForUser(userId);
  if (isActiveTier(sub.tier)) return { allowed: true, consumed: false };

  const limit = getPlanLimits("free").maxFreePosts;

  // The counter lives on user_settings, which is created lazily. Make sure the
  // row exists so the conditional UPDATE below is the only thing that can fail.
  await db
    .insert(userSettings)
    .values({ userId, freePostsUsed: 0 })
    .onConflictDoNothing({ target: userSettings.userId });

  const claimed = await db
    .update(userSettings)
    .set({ freePostsUsed: sql`coalesce(${userSettings.freePostsUsed}, 0) + 1` })
    .where(
      and(
        eq(userSettings.userId, userId),
        sql`coalesce(${userSettings.freePostsUsed}, 0) < ${limit}`,
      ),
    )
    .returning({ used: userSettings.freePostsUsed });

  if (claimed.length > 0) return { allowed: true, consumed: true };

  return {
    allowed: false,
    reason: `You've used your ${limit} free posts. Subscribe to continue posting.`,
    used: await getFreePostsUsed(userId),
    limit,
  };
}

/** Hand a reserved free post back when the operation it paid for failed. */
export async function releaseFreePost(
  reservation: FreePostReservation,
  userId: string,
): Promise<void> {
  if (!reservation.allowed || !reservation.consumed) return;
  await db
    .update(userSettings)
    .set({
      freePostsUsed: sql`greatest(coalesce(${userSettings.freePostsUsed}, 0) - 1, 0)`,
    })
    .where(eq(userSettings.userId, userId));
}
