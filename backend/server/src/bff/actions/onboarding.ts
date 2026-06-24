

import { db } from "@/db";
import { userSettings, connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSubscriptionForUser } from "@/lib/subscription";
import { requireSessionUserId } from "@/lib/require-session-user";

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
  freePostsUsed: 0,
};

async function upsertUserSettings(
  userId: string,
  patch: Partial<typeof NEW_USER_SETTINGS_DEFAULTS> & {
    onboardingGoal?: string | null;
    onboardingCompleted?: boolean;
  },
): Promise<void> {
  const { onboardingGoal, onboardingCompleted, ...defaultsPatch } = patch;

  await db
    .insert(userSettings)
    .values({
      userId,
      ...NEW_USER_SETTINGS_DEFAULTS,
      ...defaultsPatch,
      ...(onboardingGoal !== undefined ? { onboardingGoal } : {}),
      ...(onboardingCompleted !== undefined ? { onboardingCompleted } : {}),
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        ...(onboardingGoal !== undefined ? { onboardingGoal } : {}),
        ...(onboardingCompleted !== undefined ? { onboardingCompleted } : {}),
      },
    });
}

export type OnboardingStatus = {
  onboardingCompleted: boolean;
  onboardingGoal: string | null;
  hasSubscription: boolean;
  connectedAccountsCount: number;
  /** True if user should be sent to onboarding (new user: no sub + no accounts) */
  shouldOnboard: boolean;
};

export async function getOnboardingStatus(): Promise<OnboardingStatus | null> {
  const userId = await requireSessionUserId();

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
  const userId = await requireSessionUserId();

  await upsertUserSettings(userId, { onboardingGoal: goal });
}

export async function setOnboardingCompleted(): Promise<void> {
  const userId = await requireSessionUserId();

  await upsertUserSettings(userId, { onboardingCompleted: true });
}
