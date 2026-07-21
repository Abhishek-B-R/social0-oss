/**
 * Shared plan prices for landing, onboarding, and billing.
 * Monthly (early adopter): Starter $9, Growth $19 (list $29), Pro $35 (list $49).
 * Yearly (early adopter): Starter $99, Growth $199 (list $299, ~33% off),
 *   Pro $349 (list $499, ~30% off).
 *
 * Yearly UI leads with effective monthly ($/mo), with list monthly struck when
 * applicable, plus "Billed as $X/year" secondary copy.
 */

import type { BillingInterval, PaidPlanTier } from "@/lib/plans";

export type { BillingInterval, PaidPlanTier };

export type PlanPrice = {
  /** Amount charged per billing period (USD). */
  price: number;
  /** Struck list price when early-adopter discount applies. */
  listPrice?: number;
  /** Dollars saved vs paying monthly early-adopter rates for 12 months. */
  saveVsMonthly?: number;
  /** Percent off list price (Growth yearly 33%, Pro yearly 30%). */
  savePercent?: number;
};

const MONTHLY: Record<PaidPlanTier, PlanPrice> = {
  starter: { price: 9 },
  growth: { price: 19, listPrice: 29, savePercent: 34 },
  pro: { price: 35, listPrice: 49, savePercent: 30 },
};

const YEARLY: Record<PaidPlanTier, PlanPrice> = {
  // ~2 months free vs paying monthly for a year (marketing framing).
  starter: { price: 99 },
  growth: {
    price: 199,
    listPrice: 299,
    saveVsMonthly: 29,
    savePercent: 33,
  },
  pro: {
    price: 349,
    listPrice: 499,
    saveVsMonthly: 71,
    savePercent: 30,
  },
};

export function getPlanPrice(
  tier: PaidPlanTier,
  interval: BillingInterval,
): PlanPrice {
  return interval === "yearly" ? YEARLY[tier] : MONTHLY[tier];
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function toParts(amount: number): { dollars: number; cents: string } {
  const [dollars, cents] = amount.toFixed(2).split(".");
  return { dollars: Number(dollars), cents };
}

/** Effective monthly rate for yearly plans (charged price ÷ 12). */
export function getEffectiveMonthly(tier: PaidPlanTier): number {
  return roundCents(YEARLY[tier].price / 12);
}

/** List monthly rate for yearly plans (list price ÷ 12), when applicable. */
export function getListMonthly(tier: PaidPlanTier): number | null {
  const list = YEARLY[tier].listPrice;
  if (list == null) return null;
  return roundCents(list / 12);
}

export function getEffectiveMonthlyParts(tier: PaidPlanTier): {
  dollars: number;
  cents: string;
} {
  return toParts(getEffectiveMonthly(tier));
}

export function getListMonthlyParts(tier: PaidPlanTier): {
  dollars: number;
  cents: string;
} | null {
  const list = getListMonthly(tier);
  if (list == null) return null;
  return toParts(list);
}

export function formatMoney(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function formatEffectiveMonthly(tier: PaidPlanTier): string {
  return formatMoney(getEffectiveMonthly(tier));
}

export function formatListMonthly(tier: PaidPlanTier): string | null {
  const list = getListMonthly(tier);
  return list == null ? null : formatMoney(list);
}

export function formatPlanPriceLabel(
  tier: PaidPlanTier,
  interval: BillingInterval,
): string {
  const { price } = getPlanPrice(tier, interval);
  return interval === "yearly" ? `$${price}/year` : `$${price}/month`;
}

/** Hero price unit — yearly toggle still leads with /month (effective rate). */
export function periodSuffix(_interval: BillingInterval): string {
  return "/month";
}

export function billedAsYearlyLabel(tier: PaidPlanTier): string {
  return `Billed as $${YEARLY[tier].price}/year`;
}
