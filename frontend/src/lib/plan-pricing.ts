/**
 * Shared plan prices for landing, onboarding, and billing.
 * Monthly (early adopter): Starter $9, Growth $19 (list $29), Pro $35 (list $49),
 *   Max $59 (list $99).
 * Yearly (early adopter): Starter $99, Growth $199 (list $299, ~33% off),
 *   Pro $349 (list $499, ~30% off), Max $599 (list $999, ≈$50/mo).
 *
 * Discount UI (PlanDiscountPrice): list amount first with same-color slash,
 * then sale amount, then /month or /year. Yearly cards also show ≈ $/month.
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
  // Placeholder until final Max Dodo prices land.
  max: { price: 59, listPrice: 99, savePercent: 40 },
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
  max: {
    price: 599,
    listPrice: 999,
    saveVsMonthly: 109,
    savePercent: 40,
  },
};

export function getPlanPrice(
  tier: PaidPlanTier,
  interval: BillingInterval,
): PlanPrice {
  return interval === "yearly" ? YEARLY[tier] : MONTHLY[tier];
}

/** Round effective monthly for display: 16.58 → 16.5, 29.08 → 29. */
function roundEffectiveMonthlyDisplay(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Effective monthly rate for yearly plans (display-rounded). */
export function getEffectiveMonthly(tier: PaidPlanTier): number {
  const raw = YEARLY[tier].price / 12;
  // Starter: $8; Growth: $16.5; Pro: $29; Max: ~$50
  if (tier === "starter") return Math.round(raw);
  return roundEffectiveMonthlyDisplay(raw);
}

/** Monthly sticker to slash next to yearly effective $/mo (Starter $9, Growth $29, Pro $49, Max $99). */
export function getYearlySlashMonthly(tier: PaidPlanTier): number {
  const m = MONTHLY[tier];
  return m.listPrice ?? m.price;
}

export function formatMoney(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  if (Math.abs(amount * 10 - Math.round(amount * 10)) < 1e-9) {
    return amount.toFixed(1);
  }
  return amount.toFixed(2);
}

export function formatEffectiveMonthly(tier: PaidPlanTier): string {
  return formatMoney(getEffectiveMonthly(tier));
}

export function formatPlanPriceLabel(
  tier: PaidPlanTier,
  interval: BillingInterval,
): string {
  const { price } = getPlanPrice(tier, interval);
  return interval === "yearly" ? `$${price}/year` : `$${price}/month`;
}

export function billedAsYearlyLabel(tier: PaidPlanTier): string {
  return `Billed as $${YEARLY[tier].price}/year`;
}
