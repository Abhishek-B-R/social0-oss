"use server";

import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { SubscriptionTier } from "@/lib/plans";

export type SubscriptionState = {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  polarSubscriptionId: string | null;
  polarCustomerId: string | null;
};

export async function getSubscriptionForUser(
  userId: string,
): Promise<SubscriptionState> {
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: {
      subscriptionTier: true,
      subscriptionExpiresAt: true,
      polarSubscriptionId: true,
      polarCustomerId: true,
    },
  });

  const tier = (row?.subscriptionTier as SubscriptionTier) ?? "free";
  const expiresAt = row?.subscriptionExpiresAt ?? null;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return {
      tier: "free",
      expiresAt: null,
      polarSubscriptionId: null,
      polarCustomerId: row?.polarCustomerId ?? null,
    };
  }

  return {
    tier: tier === "starter" || tier === "growth" ? tier : "free",
    expiresAt,
    polarSubscriptionId: row?.polarSubscriptionId ?? null,
    polarCustomerId: row?.polarCustomerId ?? null,
  };
}

export async function setSubscriptionFromPolar(
  userId: string,
  data: {
    tier: SubscriptionTier;
    expiresAt: Date | null;
    polarSubscriptionId: string | null;
    polarCustomerId: string | null;
  },
): Promise<void> {
  await db
    .insert(userSettings)
    .values({
      userId,
      subscriptionTier: data.tier,
      subscriptionExpiresAt: data.expiresAt,
      polarSubscriptionId: data.polarSubscriptionId,
      polarCustomerId: data.polarCustomerId,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        subscriptionTier: data.tier,
        subscriptionExpiresAt: data.expiresAt,
        polarSubscriptionId: data.polarSubscriptionId,
        polarCustomerId: data.polarCustomerId,
      },
    });
}
