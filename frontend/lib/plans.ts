/**
 * Subscription plan limits and feature flags.
 * Starter (Lite): $6/mo. Growth: $20/mo.
 */

export type SubscriptionTier = "free" | "starter" | "growth";

export const PLAN_IDS = {
  starter: process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID ?? "",
  growth: process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID ?? "",
} as const;

export interface PlanLimits {
  maxConnectedAccounts: number;
  tweetsPerMonth: number;
  allowBulkTools: boolean;
  allowAutoPlug: boolean;
  allowResurface: boolean;
}

const FREE_LIMITS: PlanLimits = {
  maxConnectedAccounts: 0,
  tweetsPerMonth: 0,
  allowBulkTools: false,
  allowAutoPlug: false,
  allowResurface: false,
};

const STARTER_LIMITS: PlanLimits = {
  maxConnectedAccounts: 5,
  tweetsPerMonth: 300,
  allowBulkTools: false,
  allowAutoPlug: false,
  allowResurface: false,
};

const GROWTH_LIMITS: PlanLimits = {
  maxConnectedAccounts: 15,
  tweetsPerMonth: 1500,
  allowBulkTools: true,
  allowAutoPlug: true,
  allowResurface: true,
};

const LIMITS_BY_TIER: Record<SubscriptionTier, PlanLimits> = {
  free: FREE_LIMITS,
  starter: STARTER_LIMITS,
  growth: GROWTH_LIMITS,
};

export function getPlanLimits(tier: SubscriptionTier | null | undefined): PlanLimits {
  if (!tier || tier === "free") return FREE_LIMITS;
  return LIMITS_BY_TIER[tier] ?? FREE_LIMITS;
}

export function getTierFromProductId(productId: string): SubscriptionTier {
  if (productId === PLAN_IDS.starter) return "starter";
  if (productId === PLAN_IDS.growth) return "growth";
  return "free";
}

export function isActiveTier(tier: SubscriptionTier | null | undefined): tier is "starter" | "growth" {
  return tier === "starter" || tier === "growth";
}
