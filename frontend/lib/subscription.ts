"use server";

import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { SubscriptionTier } from "@/lib/plans";

export type SubscriptionState = {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  subscriptionId: string | null;
  customerId: string | null;
  /** True once user has ever had a paid plan (trial or paid). Used for trial vs upgrade messaging when limit is 0. */
  hasUsedTrial: boolean;
  /** Scheduled downgrade target (starter | growth). Shown as banner until period end or cancel. */
  pendingPlanTier: "starter" | "growth" | null;
  /** True when user cancelled at period end; access until expiresAt. */
  cancelAtPeriodEnd: boolean;
};

export async function getSubscriptionForUser(
  userId: string,
): Promise<SubscriptionState> {
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: {
      subscriptionTier: true,
      subscriptionExpiresAt: true,
      subscriptionId: true,
      customerId: true,
      hasUsedTrial: true,
      pendingPlanTier: true,
      subscriptionCancelAtPeriodEnd: true,
    },
  });

  const tier = (row?.subscriptionTier as SubscriptionTier) ?? "free";
  const expiresAt = row?.subscriptionExpiresAt ?? null;
  const hasUsedTrial = row?.hasUsedTrial ?? false;
  const rawPending =
    row?.pendingPlanTier === "starter" || row?.pendingPlanTier === "growth"
      ? row.pendingPlanTier
      : null;
  const pendingPlanTier = rawPending && rawPending !== tier ? rawPending : null;
  const cancelAtPeriodEnd = Boolean(row?.subscriptionCancelAtPeriodEnd);

  const now = new Date();
  const isExpired = expiresAt && new Date(expiresAt) < now;
  const isPaidTier = tier === "starter" || tier === "growth" || tier === "pro";

  if (isExpired && isPaidTier) {
    await setSubscription(userId, {
      tier: "free",
      expiresAt: null,
      subscriptionId: null,
      customerId: null,
    });
    return {
      tier: "free",
      expiresAt: null,
      subscriptionId: null,
      customerId: row?.customerId ?? null,
      hasUsedTrial,
      pendingPlanTier: null,
      cancelAtPeriodEnd: false,
    };
  }

  if (isExpired) {
    return {
      tier: "free",
      expiresAt: null,
      subscriptionId: null,
      customerId: row?.customerId ?? null,
      hasUsedTrial,
      pendingPlanTier: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    tier:
      tier === "starter" || tier === "growth" || tier === "pro" ? tier : "free",
    expiresAt,
    subscriptionId: row?.subscriptionId ?? null,
    customerId: row?.customerId ?? null,
    hasUsedTrial,
    pendingPlanTier,
    cancelAtPeriodEnd: cancelAtPeriodEnd && (tier === "starter" || tier === "growth" || tier === "pro"),
  };
}

export async function setSubscription(
  userId: string,
  data: {
    tier: SubscriptionTier;
    expiresAt: Date | null;
    subscriptionId: string | null;
    customerId: string | null;
  },
): Promise<void> {
  const isPaidTier =
    data.tier === "starter" || data.tier === "growth" || data.tier === "pro";

  await db.execute(sql`
      INSERT INTO user_settings (user_id, subscription_tier, subscription_expires_at, subscription_id, customer_id, has_used_trial, pending_plan_tier, subscription_cancel_at_period_end)
      VALUES (${userId}, ${data.tier}, ${data.expiresAt}, ${data.subscriptionId}, ${data.customerId}, ${isPaidTier}, null, false)
      ON CONFLICT (user_id) DO UPDATE SET
        subscription_tier = EXCLUDED.subscription_tier,
        subscription_expires_at = EXCLUDED.subscription_expires_at,
        subscription_id = EXCLUDED.subscription_id,
        customer_id = EXCLUDED.customer_id,
        pending_plan_tier = EXCLUDED.pending_plan_tier,
        has_used_trial = user_settings.has_used_trial OR EXCLUDED.has_used_trial,
        subscription_cancel_at_period_end = false
      WHERE
        user_settings.subscription_tier IS DISTINCT FROM EXCLUDED.subscription_tier
        OR user_settings.subscription_expires_at IS DISTINCT FROM EXCLUDED.subscription_expires_at
        OR user_settings.subscription_id IS DISTINCT FROM EXCLUDED.subscription_id
        OR user_settings.customer_id IS DISTINCT FROM EXCLUDED.customer_id
        OR user_settings.pending_plan_tier IS DISTINCT FROM EXCLUDED.pending_plan_tier
        OR user_settings.subscription_cancel_at_period_end IS DISTINCT FROM false
    `);
}
