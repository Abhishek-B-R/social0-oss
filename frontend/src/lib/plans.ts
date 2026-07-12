/**
 * Subscription plan limits and feature flags.
 * Starter (Lite): $9/mo. Growth: $29/mo (early adopter $19). Pro: $49/mo (early adopter $35).
 */

import { getDodoProductId } from "./env";

export type SubscriptionTier = "free" | "starter" | "growth" | "pro";

export const PLAN_IDS = {
  starter: getDodoProductId("starter"),
  growth: getDodoProductId("growth"),
  pro: getDodoProductId("pro"),
} as const;

export interface PlanLimits {
  maxConnectedAccounts: number;
  /** Lifetime free posts before subscription is required (free tier only). */
  maxFreePosts: number;
  allowBulkTools: boolean;
  allowAutoPlug: boolean;
  allowResurface: boolean;
}

const FREE_LIMITS: PlanLimits = {
  maxConnectedAccounts: 3,
  maxFreePosts: 5,
  allowBulkTools: false,
  allowAutoPlug: false,
  allowResurface: false,
};

const STARTER_LIMITS: PlanLimits = {
  maxConnectedAccounts: 5,
  maxFreePosts: 0,
  allowBulkTools: false,
  allowAutoPlug: false,
  allowResurface: false,
};

const GROWTH_LIMITS: PlanLimits = {
  maxConnectedAccounts: 15,
  maxFreePosts: 0,
  allowBulkTools: true,
  allowAutoPlug: true,
  allowResurface: true,
};

const PRO_LIMITS: PlanLimits = {
  maxConnectedAccounts: 999, // effectively unlimited
  maxFreePosts: 0,
  allowBulkTools: true,
  allowAutoPlug: true,
  allowResurface: true,
};

const LIMITS_BY_TIER: Record<SubscriptionTier, PlanLimits> = {
  free: FREE_LIMITS,
  starter: STARTER_LIMITS,
  growth: GROWTH_LIMITS,
  pro: PRO_LIMITS,
};

export function getPlanLimits(
  tier: SubscriptionTier | null | undefined,
): PlanLimits {
  if (!tier || tier === "free") return FREE_LIMITS;
  return LIMITS_BY_TIER[tier] ?? FREE_LIMITS;
}

export function getTierFromProductId(productId: string): SubscriptionTier {
  if (productId === PLAN_IDS.starter) return "starter";
  if (productId === PLAN_IDS.growth) return "growth";
  if (productId === PLAN_IDS.pro) return "pro";
  return "free";
}

export function isActiveTier(
  tier: SubscriptionTier | null | undefined,
): tier is "starter" | "growth" | "pro" {
  return tier === "starter" || tier === "growth" || tier === "pro";
}
