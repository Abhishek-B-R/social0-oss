/**
 * Subscription plan limits and feature flags.
 * Monthly (early adopter): Starter $9, Growth $19 (list $29), Pro $35 (list $49),
 *   Max $59 (list $99).
 * Yearly (early adopter): Starter $99, Growth $199 (list $299), Pro $349 (list $499),
 *   Max $599 (list $999).
 */

import { getDodoProductId } from "./env";

export type SubscriptionTier = "free" | "starter" | "growth" | "pro" | "max";
export type BillingInterval = "monthly" | "yearly";
export type PaidPlanTier = "starter" | "growth" | "pro" | "max";

const monthlyIds = {
  starter: getDodoProductId("starter", "monthly"),
  growth: getDodoProductId("growth", "monthly"),
  pro: getDodoProductId("pro", "monthly"),
  max: getDodoProductId("max", "monthly"),
} as const;

const yearlyIds = {
  starter: getDodoProductId("starter", "yearly"),
  growth: getDodoProductId("growth", "yearly"),
  pro: getDodoProductId("pro", "yearly"),
  max: getDodoProductId("max", "yearly"),
} as const;

/** Monthly product IDs (backward-compatible flat shape). */
export const PLAN_IDS = {
  starter: monthlyIds.starter,
  growth: monthlyIds.growth,
  pro: monthlyIds.pro,
  max: monthlyIds.max,
  monthly: monthlyIds,
  yearly: yearlyIds,
} as const;

export function getProductId(
  tier: PaidPlanTier,
  interval: BillingInterval = "monthly",
): string {
  return interval === "yearly" ? yearlyIds[tier] : monthlyIds[tier];
}

export function getIntervalFromProductId(
  productId: string,
): BillingInterval | null {
  if (!productId) return null;
  if (
    productId === yearlyIds.starter ||
    productId === yearlyIds.growth ||
    productId === yearlyIds.pro ||
    productId === yearlyIds.max
  ) {
    return "yearly";
  }
  if (
    productId === monthlyIds.starter ||
    productId === monthlyIds.growth ||
    productId === monthlyIds.pro ||
    productId === monthlyIds.max
  ) {
    return "monthly";
  }
  return null;
}

export interface PlanLimits {
  maxConnectedAccounts: number;
  /** Lifetime free posts before subscription is required (free tier only). */
  maxFreePosts: number;
  allowBulkTools: boolean;
  allowAutoPlug: boolean;
  allowResurface: boolean;
  /** Invite teammates into a shared workspace (Pro / Max). */
  allowTeams: boolean;
  /** Create multiple owned workspaces (any paid plan). */
  allowMultiWorkspace: boolean;
}

const FREE_LIMITS: PlanLimits = {
  maxConnectedAccounts: 3,
  maxFreePosts: 10,
  allowBulkTools: false,
  allowAutoPlug: false,
  allowResurface: false,
  allowTeams: false,
  allowMultiWorkspace: false,
};

const STARTER_LIMITS: PlanLimits = {
  maxConnectedAccounts: 5,
  maxFreePosts: 0,
  allowBulkTools: false,
  allowAutoPlug: false,
  allowResurface: false,
  allowTeams: false,
  allowMultiWorkspace: true,
};

const GROWTH_LIMITS: PlanLimits = {
  maxConnectedAccounts: 15,
  maxFreePosts: 0,
  allowBulkTools: true,
  allowAutoPlug: true,
  allowResurface: true,
  allowTeams: false,
  allowMultiWorkspace: true,
};

const PRO_LIMITS: PlanLimits = {
  maxConnectedAccounts: 50,
  maxFreePosts: 0,
  allowBulkTools: true,
  allowAutoPlug: true,
  allowResurface: true,
  allowTeams: true,
  allowMultiWorkspace: true,
};

/** Soft ceiling — marketed as unlimited; avoid Infinity for slice/UI math. */
const MAX_LIMITS: PlanLimits = {
  maxConnectedAccounts: 9999,
  maxFreePosts: 0,
  allowBulkTools: true,
  allowAutoPlug: true,
  allowResurface: true,
  allowTeams: true,
  allowMultiWorkspace: true,
};

const LIMITS_BY_TIER: Record<SubscriptionTier, PlanLimits> = {
  free: FREE_LIMITS,
  starter: STARTER_LIMITS,
  growth: GROWTH_LIMITS,
  pro: PRO_LIMITS,
  max: MAX_LIMITS,
};

export function getPlanLimits(
  tier: SubscriptionTier | null | undefined,
): PlanLimits {
  if (!tier || tier === "free") return FREE_LIMITS;
  return LIMITS_BY_TIER[tier] ?? FREE_LIMITS;
}

export function getTierFromProductId(productId: string): SubscriptionTier {
  if (
    productId === monthlyIds.starter ||
    productId === yearlyIds.starter
  ) {
    return "starter";
  }
  if (
    productId === monthlyIds.growth ||
    productId === yearlyIds.growth
  ) {
    return "growth";
  }
  if (productId === monthlyIds.pro || productId === yearlyIds.pro) {
    return "pro";
  }
  if (productId === monthlyIds.max || productId === yearlyIds.max) {
    return "max";
  }
  return "free";
}

export function isActiveTier(
  tier: SubscriptionTier | null | undefined,
): tier is PaidPlanTier {
  return (
    tier === "starter" ||
    tier === "growth" ||
    tier === "pro" ||
    tier === "max"
  );
}
