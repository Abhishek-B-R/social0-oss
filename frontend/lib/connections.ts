import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getSubscriptionForUser } from "@/lib/subscription";
import { getPlanLimits } from "@/lib/plans";

/**
 * Returns how many more accounts the user can connect (0 = at or over limit).
 * Uses subscription tier: free = 0, starter = 5, growth = 15.
 * Counts only active connected accounts.
 */
export async function getRemainingSlots(userId: string): Promise<number> {
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
  return Math.max(0, limits.maxConnectedAccounts - currentTotal);
}
