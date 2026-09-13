/**
 * Subscription plan limits and feature flags.
 * Monthly (early adopter): Starter $9, Growth $19 (list $29), Pro $35 (list $49),
 *   Max $59 (list $99).
 * Yearly (early adopter): Starter $99, Growth $199 (list $299), Pro $349 (list $499),
 *   Max $599 (list $999).
 */

export type SubscriptionTier = "free" | "starter" | "growth" | "pro" | "max";
export type BillingInterval = "monthly" | "yearly";
export type PaidPlanTier = "starter" | "growth" | "pro" | "max";

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
