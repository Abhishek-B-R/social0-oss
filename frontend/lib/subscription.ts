"use server";

import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { SubscriptionTier } from "@/lib/plans";

export type SubscriptionState = {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  subscriptionId: string | null;
  customerId: string | null;
  /** True once user has ever had a paid plan (trial or paid). Used for trial vs upgrade messaging when limit is 0. */
  hasUsedTrial: boolean;
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
    },
  });

  const tier = (row?.subscriptionTier as SubscriptionTier) ?? "free";
  const expiresAt = row?.subscriptionExpiresAt ?? null;
  const hasUsedTrial = row?.hasUsedTrial ?? false;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return {
      tier: "free",
      expiresAt: null,
      subscriptionId: null,
      customerId: row?.customerId ?? null,
      hasUsedTrial,
    };
  }

  return {
    tier: tier === "starter" || tier === "growth" || tier === "pro" ? tier : "free",
    expiresAt,
    subscriptionId: row?.subscriptionId ?? null,
    customerId: row?.customerId ?? null,
    hasUsedTrial,
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
  await db
    .insert(userSettings)
    .values({
      userId,
      subscriptionTier: data.tier,
      subscriptionExpiresAt: data.expiresAt,
      subscriptionId: data.subscriptionId,
      customerId: data.customerId,
      ...(isPaidTier ? { hasUsedTrial: true } : {}),
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        subscriptionTier: data.tier,
        subscriptionExpiresAt: data.expiresAt,
        subscriptionId: data.subscriptionId,
        customerId: data.customerId,
        ...(isPaidTier ? { hasUsedTrial: true } : {}),
      },
    });
}
