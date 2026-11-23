
import { db } from "../db/instance.js";
import { userSettings } from "../db/schema.js";
import { and, eq, sql } from "drizzle-orm";
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
  /**
   * Agency accounts billed above the 59 included (Dodo add-on quantity, synced
   * from the connected-account count). Always 0 on other tiers.
   */
  extraAccounts: number;
};

/** Extra accounts only count on Agency; any other tier reads 0. */
export function effectiveExtraAccounts(
  tier: SubscriptionTier | string | null | undefined,
  stored: number | null | undefined,
): number {
  if (tier !== "agency") return 0;
  const n = Math.floor(Number(stored ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * How long past next_billing_date a paid plan stands without word from Dodo.
 * Covers the renewal charge, its webhook, and Dodo's own retries of a failed
 * delivery; a renewal that fails sends on_hold well inside this window.
 */
export const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Whether a paid plan whose billing date has passed should now read as free.
 * True when the user asked to leave (cancel at period end: there is no
 * renewal coming) or the renewal webhook is overdue past RENEWAL_GRACE_MS.
 */
export function hasSubscriptionLapsed(
  expiresAt: Date,
  cancelAtPeriodEnd: boolean,
  now: Date = new Date(),
): boolean {
  const expiresMs = new Date(expiresAt).getTime();
  if (expiresMs >= now.getTime()) return false;
  if (cancelAtPeriodEnd) return true;
  return now.getTime() - expiresMs >= RENEWAL_GRACE_MS;
}

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
      extraAccounts: true,
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
  const isPaidTier = isActiveTier(tier);
  // `expiresAt` is Dodo's next_billing_date: the moment it *attempts* the
  // renewal charge, not the moment access ends. A renewing subscriber passes
  // it every period and the outcome (renewed / on_hold) arrives by webhook,
  // so a paid plan stands past it until hasSubscriptionLapsed says otherwise.
  const isExpired = isPaidTier
    ? expiresAt !== null && hasSubscriptionLapsed(expiresAt, cancelAtPeriodEnd, now)
    : expiresAt !== null && new Date(expiresAt) < now;
  const expiredState: SubscriptionState = {
    tier: "free",
    expiresAt: null,
    subscriptionId: null,
    customerId: row?.customerId ?? null,
    hasUsedTrial,
    pendingPlanTier: null,
    cancelAtPeriodEnd: false,
    extraAccounts: 0,
  };

  if (isExpired && isPaidTier) {
    // Only the tier changes. The subscription and customer ids stay: the
    // cancelled / expired / on_hold / renewed webhooks find the user by
    // subscriptionId, and nulling it here made a late on_hold look like a
    // stranger's subscription, which that handler then cancelled in Dodo.
    // Clearing them is left to those webhooks and the zombie sweep.
    // Conditional on the tier so concurrent reads do the write (and the
    // connection sync below) once.
    const lapsed = await db
      .update(userSettings)
      .set({
        subscriptionTier: "free",
        subscriptionCancelAtPeriodEnd: false,
        // A scheduled plan change belongs to the plan that just lapsed. Kept,
        // the renewal webhook of a later subscription would apply it.
        pendingPlanTier: null,
        downgradeReason: null,
        extraAccounts: 0,
      })
      .where(
        and(
          eq(userSettings.userId, userId),
          eq(userSettings.subscriptionTier, tier),
        ),
      )
      .returning({ userId: userSettings.userId });
    // This branch is the safety net for a Dodo webhook we never received — the
    // webhook path syncs connections itself. Without this, a lapsed subscriber
    // keeps every connection above the free cap active indefinitely.
    // Fire-and-forget + dynamic import: this is a hot read path, and
    // plan-limits imports this module.
    if (lapsed.length > 0) {
      void import("./plan-limits.js")
        .then((m) => m.syncConnectedAccountsToLimit(userId))
        .catch((err) =>
          console.error(
            "[subscription] connection sync after expiry failed",
            userId,
            err,
          ),
        );
    }
    return expiredState;
  }

  if (isExpired) return expiredState;

  return {
    tier: isActiveTier(tier) ? tier : "free",
    expiresAt,
    subscriptionId: row?.subscriptionId ?? null,
    customerId: row?.customerId ?? null,
    hasUsedTrial,
    pendingPlanTier,
    cancelAtPeriodEnd: cancelAtPeriodEnd && isActiveTier(tier),
    extraAccounts: effectiveExtraAccounts(tier, row?.extraAccounts),
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
    /**
     * Agency extra accounts read from the Dodo subscription's add-ons. Any
     * other tier always writes 0; Agency with this left undefined keeps the
     * stored count.
     */
    extraAccounts?: number;
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
    pendingPlanTier?: null;
    downgradeReason?: null;
    extraAccounts?: number;
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
  const extraAccounts =
    data.tier !== "agency"
      ? 0
      : data.extraAccounts === undefined
        ? undefined
        : effectiveExtraAccounts(data.tier, data.extraAccounts);
  if (extraAccounts !== undefined) {
    conflictPatch.extraAccounts = extraAccounts;
  }
  if (!isPaidTier) {
    // The plan ended (on_hold, cancelled/expired, zombie revert): a change
    // scheduled on it ends with it. Left behind, it outlives the subscription
    // and the next subscription's renewal webhook applies it.
    conflictPatch.pendingPlanTier = null;
    conflictPatch.downgradeReason = null;
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
      extraAccounts: extraAccounts ?? 0,
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
