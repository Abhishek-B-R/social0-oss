
import { db } from "../db/instance.js";
import { userSettings } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import {
  getPlanLimits,
  isActiveTier,
  type BillingInterval,
  type PaidPlanTier,
  type SubscriptionTier,
} from "./plans.js";

export type SubscriptionState = {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  subscriptionId: string | null;
  customerId: string | null;
  /** True once user has ever had a paid plan (trial or paid). Used for trial vs upgrade messaging when limit is 0. */
  hasUsedTrial: boolean;
  /** Scheduled plan change target. Shown as banner until period end or cancel. */
  pendingPlanTier: PaidPlanTier | null;
  /** True when user cancelled at period end; access until expiresAt. */
  cancelAtPeriodEnd: boolean;
  /** Billing interval of the active Dodo product, when known. */
  interval?: BillingInterval | null;
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
  const rawPending = isActiveTier(
    row?.pendingPlanTier as SubscriptionTier | null | undefined,
  )
    ? (row!.pendingPlanTier as PaidPlanTier)
    : null;
  const pendingPlanTier = rawPending && rawPending !== tier ? rawPending : null;
  const cancelAtPeriodEnd = Boolean(row?.subscriptionCancelAtPeriodEnd);

  const now = new Date();
  const isExpired = expiresAt && new Date(expiresAt) < now;
  const isPaidTier = isActiveTier(tier);

  if (isExpired && isPaidTier) {
    await setSubscription(userId, {
      tier: "free",
      expiresAt: null,
      subscriptionId: null,
      customerId: null,
    });
    // This branch is the safety net for a Dodo webhook we never received — the
    // webhook path syncs connections itself. Without this, a lapsed subscriber
    // keeps every connection above the free cap active indefinitely.
    // Fire-and-forget + dynamic import: this is a hot read path, and
    // plan-limits imports this module.
    void import("./plan-limits.js")
      .then((m) => m.syncConnectedAccountsToLimit(userId))
      .catch((err) =>
        console.error(
          "[subscription] connection sync after expiry failed",
          userId,
          err,
        ),
      );
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
    tier: isActiveTier(tier) ? tier : "free",
    expiresAt,
    subscriptionId: row?.subscriptionId ?? null,
    customerId: row?.customerId ?? null,
    hasUsedTrial,
    pendingPlanTier,
    cancelAtPeriodEnd: cancelAtPeriodEnd && isActiveTier(tier),
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
  options?: { clearCancelAtPeriodEnd?: boolean },
): Promise<void> {
  const isPaidTier = isActiveTier(data.tier);
  const clearCancelAtPeriodEnd =
    !isPaidTier || options?.clearCancelAtPeriodEnd === true;

  const conflictPatch: {
    subscriptionTier: SubscriptionTier;
    subscriptionExpiresAt: Date | null;
    subscriptionId: string | null;
    customerId: string | null;
    hasUsedTrial: ReturnType<typeof sql>;
    subscriptionCancelAtPeriodEnd?: boolean;
  } = {
    subscriptionTier: data.tier,
    subscriptionExpiresAt: data.expiresAt,
    subscriptionId: data.subscriptionId,
    customerId: data.customerId,
    hasUsedTrial: sql`GREATEST(${userSettings.hasUsedTrial}::int, ${isPaidTier ? 1 : 0}::int)::boolean`,
  };
  if (clearCancelAtPeriodEnd) {
    conflictPatch.subscriptionCancelAtPeriodEnd = false;
  }

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
      set: conflictPatch,
    });

  // Teams plans need an owner workspace for invitations. Workspace
  // provisioning lives in the API, so it registers itself here rather than
  // this module reaching into a package it does not belong to. The background
  // worker leaves it unset — it only ever writes the free tier, from zombie
  // cleanup — so nothing fires there.
  if (getPlanLimits(data.tier).allowTeams) {
    await paidPlanActivatedHook?.(userId);
  }
}

type PaidPlanActivatedHook = (userId: string) => Promise<void>;

let paidPlanActivatedHook: PaidPlanActivatedHook | null = null;

/** Called after a subscription lands on a tier whose plan allows Teams. */
export function onPaidPlanActivated(hook: PaidPlanActivatedHook): void {
  paidPlanActivatedHook = hook;
}
