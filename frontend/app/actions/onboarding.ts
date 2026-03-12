"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userSettings, connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSubscriptionForUser } from "@/lib/subscription";

export type OnboardingStatus = {
  onboardingCompleted: boolean;
  onboardingGoal: string | null;
  hasSubscription: boolean;
  connectedAccountsCount: number;
  /** True if user should be sent to onboarding (new user: no sub + no accounts) */
  shouldOnboard: boolean;
};

async function getCurrentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const [settingsRow, sub, accounts] = await Promise.all([
    db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
      columns: { onboardingCompleted: true, onboardingGoal: true },
    }),
    getSubscriptionForUser(userId),
    db
      .select({ id: connectedAccounts.id })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, userId),
          eq(connectedAccounts.isActive, true),
        ),
      ),
  ]);

  const onboardingCompleted = settingsRow?.onboardingCompleted ?? false;
  const hasSubscription =
    sub.tier === "starter" || sub.tier === "growth" || sub.tier === "pro";
  const connectedAccountsCount = accounts.length;
  const shouldOnboard =
    !onboardingCompleted && !hasSubscription && connectedAccountsCount === 0;

  return {
    onboardingCompleted,
    onboardingGoal: settingsRow?.onboardingGoal ?? null,
    hasSubscription,
    connectedAccountsCount,
    shouldOnboard,
  };
}

export async function setOnboardingGoal(goal: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/");

  await db
    .insert(userSettings)
    .values({ userId, onboardingGoal: goal })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { onboardingGoal: goal },
    });
}

export async function setOnboardingCompleted(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/");

  await db
    .insert(userSettings)
    .values({ userId, onboardingCompleted: true })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { onboardingCompleted: true },
    });
}
