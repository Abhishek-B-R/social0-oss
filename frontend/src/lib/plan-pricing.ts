/**
 * Single source of plan prices for the pricing page, onboarding and billing.
 *
 * Creator: $29.90/month or $299/year, 15 accounts, no paid extras.
 * Agency: $59.90/month or $599/year with 59 accounts, then $1/month
 *   ($10/year) per extra account, no cap. Price = base + extra × (accounts
 *   above 59). Yearly is 10× monthly ("2 months free").
 *
 * Starter / Growth / Pro / Max are closed to new signups. Their prices stay
 * here only so grandfathered customers see what they actually pay.
 */

import {
  AGENCY_INCLUDED_ACCOUNTS,
  CREATOR_ACCOUNTS,
  type BillingInterval,
  type PaidPlanTier,
  type SellablePlanTier,
} from "@/lib/plans";

export type { BillingInterval, PaidPlanTier, SellablePlanTier };

export type PlanPrice = {
  /** Amount charged per billing period (USD). */
  price: number;
};

const MONTHLY: Record<PaidPlanTier, number> = {
  creator: 29.9,
  agency: 59.9,
  // Grandfathered (what existing customers were sold at).
  starter: 9,
  growth: 19,
  pro: 35,
  max: 59,
};

const YEARLY: Record<PaidPlanTier, number> = {
  creator: 299,
  agency: 599,
  starter: 99,
  growth: 199,
  pro: 349,
  max: 599,
};

/** Price of one Agency account above the included 59. */
export const AGENCY_EXTRA_ACCOUNT_PRICE: Record<BillingInterval, number> = {
  monthly: 1,
  yearly: 10,
};

/**
 * The one sentence that tells Agency users how accounts above the included
 * ones are billed. Information, never a block: connecting always works.
 */
export const AGENCY_EXTRA_ACCOUNT_NOTE = `Each account over ${AGENCY_INCLUDED_ACCOUNTS} adds $${AGENCY_EXTRA_ACCOUNT_PRICE.monthly}/mo ($${AGENCY_EXTRA_ACCOUNT_PRICE.yearly}/yr on yearly), added to your bill automatically.`;

/** Accounts on the pricing slider. */
export const ACCOUNT_SLIDER = {
  min: 1,
  max: 200,
  default: 12,
  ticks: [1, 15, 59, 100, 200],
} as const;

/** Agency extra accounts needed for `accounts` connected profiles. */
export function agencyExtraAccounts(accounts: number): number {
  return Math.max(0, Math.ceil(accounts) - AGENCY_INCLUDED_ACCOUNTS);
}

/** The plan that fits `accounts`: Creator up to 15, Agency above. */
export function recommendedPlan(accounts: number): SellablePlanTier {
  return accounts <= CREATOR_ACCOUNTS ? "creator" : "agency";
}

/**
 * Price per billing period of `tier` with `accounts` connected.
 * Creator is flat (it holds up to 15). Agency adds each account above 59.
 */
export function planPriceForAccounts(
  tier: SellablePlanTier,
  accounts: number,
  interval: BillingInterval,
): number {
  const base = interval === "yearly" ? YEARLY[tier] : MONTHLY[tier];
  if (tier === "creator") return base;
  return roundCents(
    base + agencyExtraAccounts(accounts) * AGENCY_EXTRA_ACCOUNT_PRICE[interval],
  );
}

/** Cheapest plan for `accounts`, priced per billing period. */
export function priceForAccounts(
  accounts: number,
  interval: BillingInterval,
): { plan: SellablePlanTier; price: number } {
  const plan = recommendedPlan(accounts);
  return { plan, price: planPriceForAccounts(plan, accounts, interval) };
}

export function getPlanPrice(
  tier: PaidPlanTier,
  interval: BillingInterval,
): PlanPrice {
  return { price: interval === "yearly" ? YEARLY[tier] : MONTHLY[tier] };
}

/** Dollars saved by paying yearly instead of 12 monthly payments. */
export function yearlySavings(tier: PaidPlanTier): number {
  return roundCents(MONTHLY[tier] * 12 - YEARLY[tier]);
}

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Effective monthly rate for yearly plans, rounded up to the cent so the
 * advertised per-month price is never below the real charge.
 * Creator $24.92, Agency $49.92.
 */
export function getEffectiveMonthly(tier: PaidPlanTier): number {
  return Math.ceil((YEARLY[tier] * 100) / 12) / 100;
}

export function formatMoney(amount: number): string {
  if (Number.isInteger(amount)) return amount.toLocaleString("en-US");
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatEffectiveMonthly(tier: PaidPlanTier): string {
  return formatMoney(getEffectiveMonthly(tier));
}

export function formatPlanPriceLabel(
  tier: PaidPlanTier,
  interval: BillingInterval,
): string {
  const { price } = getPlanPrice(tier, interval);
  return interval === "yearly"
    ? `$${formatMoney(price)}/year`
    : `$${formatMoney(price)}/month`;
}

export function billedAsYearlyLabel(tier: PaidPlanTier): string {
  return `Billed as $${formatMoney(YEARLY[tier])}/year`;
}
