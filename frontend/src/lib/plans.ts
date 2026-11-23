/**
 * Subscription plan limits and feature flags.
 *
 * Sold today: Creator and Agency (prices in `plan-pricing.ts`). Starter,
 * Growth, Pro and Max are closed to new signups; customers already on them
 * keep their plan, limits and price.
 */

export type SubscriptionTier =
  | "free"
  | "creator"
  | "agency"
  | LegacyPlanTier;
export type BillingInterval = "monthly" | "yearly";
/** Plans a new customer can buy. */
export type SellablePlanTier = "creator" | "agency";
/** Old plans: kept for the customers on them, never offered again. */
export type LegacyPlanTier = "starter" | "growth" | "pro" | "max";
export type PaidPlanTier = SellablePlanTier | LegacyPlanTier;

export const SELLABLE_PLAN_TIERS: readonly SellablePlanTier[] = [
  "creator",
  "agency",
];

/**
 * Display names. Renaming a plan is a change to this map only (the tier keys
 * stay, so stored subscriptions are untouched).
 */
export const PLAN_NAMES: Record<SubscriptionTier, string> = {
  free: "Free",
  creator: "Creator",
  agency: "Agency",
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  max: "Max",
};

/** Accounts included in Agency before each extra account is billed. */
export const AGENCY_INCLUDED_ACCOUNTS = 59;
/** Creator's account cap. Outgrowing it means moving to Agency. */
export const CREATOR_ACCOUNTS = 15;

export function isSellableTier(tier: unknown): tier is SellablePlanTier {
  return tier === "creator" || tier === "agency";
}

export function isLegacyTier(tier: unknown): tier is LegacyPlanTier {
  return (
    tier === "starter" || tier === "growth" || tier === "pro" || tier === "max"
  );
}

export interface PlanLimits {
  maxConnectedAccounts: number;
  /** Lifetime free posts before subscription is required (free tier only). */
  maxFreePosts: number;
  allowBulkTools: boolean;
  allowAutoPlug: boolean;
  allowResurface: boolean;
  /** Invite teammates into a shared workspace (Agency, Pro, Max). */
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

const CREATOR_LIMITS: PlanLimits = {
  maxConnectedAccounts: CREATOR_ACCOUNTS,
  maxFreePosts: 0,
  allowBulkTools: true,
  allowAutoPlug: true,
  allowResurface: true,
  allowTeams: false,
  allowMultiWorkspace: true,
};

/** Base Agency limits; paid extra accounts are added on top. */
const AGENCY_LIMITS: PlanLimits = {
  maxConnectedAccounts: AGENCY_INCLUDED_ACCOUNTS,
  maxFreePosts: 0,
  allowBulkTools: true,
  allowAutoPlug: true,
  allowResurface: true,
  allowTeams: true,
  allowMultiWorkspace: true,
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
  creator: CREATOR_LIMITS,
  agency: AGENCY_LIMITS,
  starter: STARTER_LIMITS,
  growth: GROWTH_LIMITS,
  pro: PRO_LIMITS,
  max: MAX_LIMITS,
};

/**
 * Limits for a tier. `extraAccounts` (Agency only) is the number of paid
 * accounts above the 59 included.
 */
export function getPlanLimits(
  tier: SubscriptionTier | null | undefined,
  extraAccounts = 0,
): PlanLimits {
  if (!tier || tier === "free") return FREE_LIMITS;
  const base = LIMITS_BY_TIER[tier] ?? FREE_LIMITS;
  if (tier !== "agency" || extraAccounts <= 0) return base;
  return {
    ...base,
    maxConnectedAccounts: base.maxConnectedAccounts + Math.floor(extraAccounts),
  };
}
