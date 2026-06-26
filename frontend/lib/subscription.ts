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
    cancelAtPeriodEnd:
      cancelAtPeriodEnd &&
      (tier === "starter" || tier === "growth" || tier === "pro"),
  };
}

/** Defaults when creating a new user_settings row (avoids relying on DB defaults after migrations). */
const NEW_USER_SETTINGS_DEFAULTS = {
  timezone: "UTC" as const,
  automationEmails: true,
  emailOnPostFailed: true,
  use24HourTimeFormat: false,
  dateFormat: "dd/MM/yyyy" as const,
  subscriptionTier: "free" as const,
  hasUsedTrial: false,
  onboardingCompleted: false,
  subscriptionCancelAtPeriodEnd: false,
};

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

  // Single UPSERT - replaces a SELECT + conditional INSERT/UPDATE (was 2 queries)
  await db
    .insert(userSettings)
    .values({
      userId,
      ...NEW_USER_SETTINGS_DEFAULTS,
      subscriptionTier: data.tier,
      subscriptionExpiresAt: data.expiresAt,
      subscriptionId: data.subscriptionId,
      customerId: data.customerId,
      hasUsedTrial: isPaidTier,
      subscriptionCancelAtPeriodEnd: false,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        subscriptionTier: data.tier,
        subscriptionExpiresAt: data.expiresAt,
        subscriptionId: data.subscriptionId,
        customerId: data.customerId,
        // Preserve hasUsedTrial once set - never downgrade to false
        hasUsedTrial: sql`GREATEST(${userSettings.hasUsedTrial}::int, ${isPaidTier ? 1 : 0}::int)::boolean`,
        subscriptionCancelAtPeriodEnd: false,
      },
    });
}
