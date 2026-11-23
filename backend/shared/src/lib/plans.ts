/**
 * Subscription plan limits, feature flags and Dodo product mapping.
 *
 * Sold today: Creator ($29.90/mo, $299/yr, 15 accounts) and Agency ($59.90/mo,
 * $599/yr, 59 accounts, then a Dodo add-on at $1/mo or $10/yr per extra
 * account, no cap). Starter, Growth, Pro and Max are closed to new signups;
 * customers already on them keep their plan, limits and price.
 */

/** Old plans: kept for the customers on them, never offered again. */
export type LegacyPlanTier = "starter" | "growth" | "pro" | "max";
/** Plans a new customer can buy. */
export type SellablePlanTier = "creator" | "agency";
export type PaidPlanTier = SellablePlanTier | LegacyPlanTier;
export type SubscriptionTier = "free" | PaidPlanTier;
export type BillingInterval = "monthly" | "yearly";

export const PAID_PLAN_TIERS: readonly PaidPlanTier[] = [
  "creator",
  "agency",
  "starter",
  "growth",
  "pro",
  "max",
];
export const SELLABLE_PLAN_TIERS: readonly SellablePlanTier[] = [
  "creator",
  "agency",
];

/** Accounts included in Agency before each extra account is billed. */
export const AGENCY_INCLUDED_ACCOUNTS = 59;
/** Creator's account cap. */
export const CREATOR_ACCOUNTS = 15;
/**
 * Agency bills each account above the 59 included automatically, so it has no
 * plan cap. This is only a safety backstop on the Dodo add-on quantity.
 */
export const AGENCY_MAX_EXTRA_ACCOUNTS = 10_000;

/**
 * Agency extra accounts to bill for `activeAccounts` connected accounts:
 * everything above the 59 included, never below 0 or above the backstop.
 */
export function agencyExtraAccountsFor(activeAccounts: number): number {
  const n = Math.floor(Number(activeAccounts) || 0) - AGENCY_INCLUDED_ACCOUNTS;
  return Math.min(AGENCY_MAX_EXTRA_ACCOUNTS, Math.max(0, n));
}

const monthlyIds: Record<PaidPlanTier, string> = {
  creator: process.env.DODO_PAYMENTS_CREATOR_PRODUCT_ID ?? "",
  agency: process.env.DODO_PAYMENTS_AGENCY_PRODUCT_ID ?? "",
  starter: process.env.DODO_PAYMENTS_STARTER_PRODUCT_ID ?? "",
  growth: process.env.DODO_PAYMENTS_GROWTH_PRODUCT_ID ?? "",
  pro: process.env.DODO_PAYMENTS_PRO_PRODUCT_ID ?? "",
  max: process.env.DODO_PAYMENTS_MAX_PRODUCT_ID ?? "",
};

const yearlyIds: Record<PaidPlanTier, string> = {
  creator: process.env.DODO_PAYMENTS_CREATOR_YEARLY_PRODUCT_ID ?? "",
  agency: process.env.DODO_PAYMENTS_AGENCY_YEARLY_PRODUCT_ID ?? "",
  starter:
    process.env.DODO_PAYMENTS_STARTER_YEARLY_PRODUCT_ID ??
    process.env.DODO_PAYMENTS_LITE_YEARLY_PRODUCT_ID ??
    "",
  growth: process.env.DODO_PAYMENTS_GROWTH_YEARLY_PRODUCT_ID ?? "",
  pro: process.env.DODO_PAYMENTS_PRO_YEARLY_PRODUCT_ID ?? "",
  max: process.env.DODO_PAYMENTS_MAX_YEARLY_PRODUCT_ID ?? "",
};

/** Dodo add-on billed once per Agency account above the included 59. */
const extraAccountAddonIds: Record<BillingInterval, string> = {
  monthly: process.env.DODO_PAYMENTS_AGENCY_EXTRA_ACCOUNT_ADDON_ID ?? "",
  yearly: process.env.DODO_PAYMENTS_AGENCY_EXTRA_ACCOUNT_YEARLY_ADDON_ID ?? "",
};

/** Monthly product IDs (backward-compatible flat shape). */
export const PLAN_IDS = {
  ...monthlyIds,
  monthly: monthlyIds,
  yearly: yearlyIds,
} as const;

export function getProductId(
  tier: PaidPlanTier,
  interval: BillingInterval = "monthly",
): string {
  return interval === "yearly" ? yearlyIds[tier] : monthlyIds[tier];
}

export function getExtraAccountAddonId(interval: BillingInterval): string {
  return extraAccountAddonIds[interval];
}

/** Both extra-account add-on ids that are configured. */
export function allExtraAccountAddonIds(): string[] {
  return [extraAccountAddonIds.monthly, extraAccountAddonIds.yearly].filter(
    Boolean,
  );
}

/**
 * Extra Agency accounts in a Dodo subscription's add-on list (the quantity of
 * the extra-account add-on; 0 when absent).
 */
export function extraAccountsFromAddons(
  addons: ReadonlyArray<{ addon_id: string; quantity: number }> | null | undefined,
): number {
  if (!addons?.length) return 0;
  const ids = new Set(allExtraAccountAddonIds());
  let total = 0;
  for (const a of addons) {
    if (ids.has(a.addon_id) && Number.isFinite(a.quantity) && a.quantity > 0) {
      total += Math.floor(a.quantity);
    }
  }
  return total;
}

/** All configured Dodo product IDs (monthly + yearly). */
export function allPlanProductIds(): string[] {
  return PAID_PLAN_TIERS.flatMap((t) => [monthlyIds[t], yearlyIds[t]]).filter(
    Boolean,
  );
}

export function parseBillingInterval(raw: unknown): BillingInterval {
  return raw === "yearly" ? "yearly" : "monthly";
}

export function getIntervalFromProductId(
  productId: string,
): BillingInterval | null {
  if (!productId) return null;
  if (PAID_PLAN_TIERS.some((t) => yearlyIds[t] === productId)) return "yearly";
  if (PAID_PLAN_TIERS.some((t) => monthlyIds[t] === productId)) return "monthly";
  return null;
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

/**
 * Agency never blocks a connect: accounts above the 59 included are billed as
 * extras, so the cap is only the backstop.
 */
const AGENCY_LIMITS: PlanLimits = {
  maxConnectedAccounts: AGENCY_INCLUDED_ACCOUNTS + AGENCY_MAX_EXTRA_ACCOUNTS,
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

/** Limits for a tier. Agency's account cap is the backstop, not a plan limit. */
export function getPlanLimits(
  tier: SubscriptionTier | null | undefined,
): PlanLimits {
  if (!tier || tier === "free") return FREE_LIMITS;
  return LIMITS_BY_TIER[tier] ?? FREE_LIMITS;
}

export function getTierFromProductId(productId: string): SubscriptionTier {
  if (!productId) return "free";
  for (const tier of PAID_PLAN_TIERS) {
    if (productId === monthlyIds[tier] || productId === yearlyIds[tier]) {
      return tier;
    }
  }
  return "free";
}

export function isActiveTier(
  tier: SubscriptionTier | string | null | undefined,
): tier is PaidPlanTier {
  return (PAID_PLAN_TIERS as readonly string[]).includes(tier ?? "");
}

export function isSellableTier(tier: unknown): tier is SellablePlanTier {
  return tier === "creator" || tier === "agency";
}

export function isLegacyTier(tier: unknown): tier is LegacyPlanTier {
  return (
    tier === "starter" || tier === "growth" || tier === "pro" || tier === "max"
  );
}

export function parsePaidPlanTier(raw: unknown): PaidPlanTier | null {
  return isActiveTier(raw as string) ? (raw as PaidPlanTier) : null;
}

/**
 * Order used to tell an upgrade from a downgrade. Legacy plans sit by what
 * they include: Max (unlimited accounts) is above Agency.
 */
export function tierRank(tier: string | null | undefined): number {
  switch (tier) {
    case "starter":
      return 1;
    case "growth":
      return 2;
    case "creator":
      return 3;
    case "pro":
      return 4;
    case "agency":
      return 5;
    case "max":
      return 6;
    default:
      return 0;
  }
}

/**
 * Display names. Renaming a plan is a change to this map only (tier keys are
 * stored on subscriptions and never change).
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

export function planDisplayName(tier: SubscriptionTier | string): string {
  return PLAN_NAMES[tier as SubscriptionTier] ?? "Free";
}
