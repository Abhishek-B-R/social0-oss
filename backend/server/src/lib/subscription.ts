import { eq, isNull, or, sql } from "drizzle-orm";
import {
  onPaidPlanActivated,
  type SubscriptionState,
} from "@social0/shared/lib/subscription";
import { getPlanLimits, type PaidPlanTier } from "@social0/shared";
import { db } from "../db/index.js";
import { userSettings } from "../db/schema.js";

async function provisionOwnerWorkspace(userId: string): Promise<void> {
  const { ensureOwnerWorkspace } = await import("./workspace/context.js");
  await ensureOwnerWorkspace(userId);
}

/**
 * Workspace provisioning lives here, not in shared: the background worker has
 * no Teams surface. Registering on import is enough because every caller
 * reaches `setSubscription` through this module.
 */
onPaidPlanActivated(provisionOwnerWorkspace);

export {
  effectiveExtraAccounts,
  getSubscriptionForUser,
  setSubscription,
} from "@social0/shared/lib/subscription";
export type { SubscriptionState };

/**
 * `setSubscription` for a paid plan, as a compare-and-set on the user's
 * canonical subscription id: the plan is written only while the stored id is
 * still `expectedSubId` (what the caller read) or already
 * `data.subscriptionId`. Id and tier land in the same statement, so a
 * concurrent reader never sees one without the other.
 *
 * Returns false, writing nothing, when another subscription took the slot in
 * between. An unconditional `setSubscription` here would let a webhook that
 * lost that race overwrite the winner it was about to be cancelled for.
 */
export async function setSubscriptionIfCanonical(
  userId: string,
  expectedSubId: string | null,
  data: {
    tier: PaidPlanTier;
    expiresAt: Date | null;
    subscriptionId: string;
    customerId: string | null;
    /** Agency extra accounts from the Dodo add-ons; undefined keeps the stored count (Agency only). */
    extraAccounts?: number;
  },
): Promise<boolean> {
  const plan = {
    subscriptionTier: data.tier,
    subscriptionExpiresAt: data.expiresAt,
    subscriptionId: data.subscriptionId,
    customerId: data.customerId,
    // A paid plan always marks the trial as used (setSubscription's GREATEST).
    hasUsedTrial: true,
    // Extra accounts only exist on Agency; every other plan clears them.
    ...(data.tier !== "agency"
      ? { extraAccounts: 0 }
      : data.extraAccounts !== undefined
        ? { extraAccounts: Math.max(0, Math.floor(data.extraAccounts)) }
        : {}),
  };
  const stillExpected =
    expectedSubId === null
      ? isNull(userSettings.subscriptionId)
      : eq(userSettings.subscriptionId, expectedSubId);
  // A scheduled plan change belongs to the subscription it was scheduled on.
  // Binding a different subscription starts with none: carried over, the new
  // subscription's renewal webhook would apply the old one's change to it.
  const sameSubscription = sql`${userSettings.subscriptionId} IS NOT DISTINCT FROM ${data.subscriptionId}`;
  const rows = await db
    .insert(userSettings)
    .values({ userId, ...plan })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        ...plan,
        pendingPlanTier: sql`CASE WHEN ${sameSubscription} THEN ${userSettings.pendingPlanTier} ELSE NULL END`,
        downgradeReason: sql`CASE WHEN ${sameSubscription} THEN ${userSettings.downgradeReason} ELSE NULL END`,
      },
      setWhere: or(
        stillExpected,
        eq(userSettings.subscriptionId, data.subscriptionId),
      ),
    })
    .returning({ userId: userSettings.userId });
  if (rows.length === 0) return false;

  if (getPlanLimits(data.tier).allowTeams) {
    await provisionOwnerWorkspace(userId);
  }
  return true;
}
