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
    },
  });

  const tier = (row?.subscriptionTier as SubscriptionTier) ?? "free";
  const expiresAt = row?.subscriptionExpiresAt ?? null;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return {
      tier: "free",
      expiresAt: null,
      subscriptionId: null,
      customerId: row?.customerId ?? null,
    };
  }

  return {
    tier: tier === "starter" || tier === "growth" || tier === "pro" ? tier : "free",
    expiresAt,
    subscriptionId: row?.subscriptionId ?? null,
    customerId: row?.customerId ?? null,
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
  await db
    .insert(userSettings)
    .values({
      userId,
      subscriptionTier: data.tier,
      subscriptionExpiresAt: data.expiresAt,
      subscriptionId: data.subscriptionId,
      customerId: data.customerId,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        subscriptionTier: data.tier,
        subscriptionExpiresAt: data.expiresAt,
        subscriptionId: data.subscriptionId,
        customerId: data.customerId,
      },
    });
}
