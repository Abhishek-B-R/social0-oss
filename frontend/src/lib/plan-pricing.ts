/**
 * Shared plan prices for landing, onboarding, and billing.
 * Monthly (early adopter): Starter $9, Growth $19 (list $29), Pro $35 (list $49).
 * Yearly (early adopter): Starter $99, Growth $199 (list $299, ~33% off),
 *   Pro $349 (list $499, ~30% off).
 *
 * Yearly UI leads with effective monthly ($/mo), with list monthly struck when
 * applicable, plus "Billed as $X/year" secondary copy.
 * All paid prices are tax-exclusive; UI shows "+ GST" where relevant.
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

/** Round effective monthly for display: 16.58 → 16.5, 29.08 → 29. */
function roundEffectiveMonthlyDisplay(n: number): number {
  return Math.round(n * 2) / 2;
}

function toParts(amount: number): { dollars: number; cents: string | null } {
  if (Number.isInteger(amount)) {
    return { dollars: amount, cents: null };
  }
  const fixed =
    Math.abs(amount * 10 - Math.round(amount * 10)) < 1e-9
      ? amount.toFixed(1)
      : amount.toFixed(2);
  const [dollars, cents] = fixed.split(".");
  return { dollars: Number(dollars), cents };
}

/** Effective monthly rate for yearly plans (display-rounded). */
export function getEffectiveMonthly(tier: PaidPlanTier): number {
  const raw = YEARLY[tier].price / 12;
  // Starter: $8; Growth: $16.5; Pro: $29
  if (tier === "starter") return Math.round(raw);
  return roundEffectiveMonthlyDisplay(raw);
}

/** List monthly rate for yearly plans (list price ÷ 12), when applicable. */
export function getListMonthly(tier: PaidPlanTier): number | null {
  const list = YEARLY[tier].listPrice;
  if (list == null) return null;
  return roundCents(list / 12);
}

export function getEffectiveMonthlyParts(tier: PaidPlanTier): {
  dollars: number;
  cents: string | null;
} {
  return toParts(getEffectiveMonthly(tier));
}

export function getListMonthlyParts(tier: PaidPlanTier): {
  dollars: number;
  cents: string;
} | null {
  const list = getListMonthly(tier);
  if (list == null) return null;
  const [dollars, cents] = list.toFixed(2).split(".");
  return { dollars: Number(dollars), cents };
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

export function formatListMonthly(tier: PaidPlanTier): string | null {
  const list = getListMonthly(tier);
  return list == null ? null : formatMoney(list);
}

/** Prices are tax-exclusive; GST is charged on top at checkout. */
export const TAX_NOTE = "+ GST";

export function formatPlanPriceLabel(
  tier: PaidPlanTier,
  interval: BillingInterval,
): string {
  const { price } = getPlanPrice(tier, interval);
  return interval === "yearly"
    ? `$${price}/year ${TAX_NOTE}`
    : `$${price}/month ${TAX_NOTE}`;
}

/** Hero price unit — yearly toggle still leads with /month (effective rate). */
export function periodSuffix(_interval: BillingInterval): string {
  return "/month";
}

export function billedAsYearlyLabel(tier: PaidPlanTier): string {
  return `Billed as $${YEARLY[tier].price}/year ${TAX_NOTE}`;
}
