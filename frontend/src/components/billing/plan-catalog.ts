/**
 * What each plan includes, in the words the billing page, the plans grid and
 * the LimitModal all use. Prices live in `@/lib/plan-pricing`, limits and
 * names in `@/lib/plans`; this file only adds copy and ordering on top.
 *
 * Only Creator and Agency are offered. Starter / Growth / Pro / Max stay here
 * so customers still on them see their own plan described correctly.
 */
import {
  AGENCY_INCLUDED_ACCOUNTS,
  CREATOR_ACCOUNTS,
  getPlanLimits,
  isLegacyTier,
  isSellableTier,
  PLAN_NAMES,
  SELLABLE_PLAN_TIERS,
  type BillingInterval,
  type PaidPlanTier,
  type SellablePlanTier,
  type SubscriptionTier,
} from "@/lib/plans";
import {
  AGENCY_EXTRA_ACCOUNT_PRICE,
  agencyExtraAccounts,
  formatMoney,
  getPlanPrice,
  planPriceForAccounts,
} from "@/lib/plan-pricing";
import { planName } from "@/lib/plan-name";

/** The plans anyone can buy, in display order. */
export const SELLABLE_PLANS: readonly SellablePlanTier[] = SELLABLE_PLAN_TIERS;

/**
 * Order used to decide whether a move is an upgrade (charge now or at
 * renewal) or a downgrade (always at renewal). Legacy plans slot in by what
 * they include: Growth ≈ Creator (15 accounts), Pro (50 + teams) sits below
 * Agency, Max (unlimited) above it.
 */
const RANK: Record<SubscriptionTier, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  creator: 3,
  pro: 4,
  agency: 5,
  max: 6,
};

/** Plan order for upgrade/downgrade decisions; unknown → 0 (free). */
export function tierRank(tier: string | null | undefined): number {
  return RANK[(tier ?? "free") as SubscriptionTier] ?? 0;
}

export function isPaidPlan(tier: unknown): tier is PaidPlanTier {
  return isSellableTier(tier) || isLegacyTier(tier);
}

export function toSubscriptionTier(tier: string | null | undefined): SubscriptionTier {
  return isPaidPlan(tier) ? tier : "free";
}

/** Max is marketed as unlimited (limit 9999 internally). */
export function isUnlimitedAccounts(limit: number): boolean {
  return limit >= 9999;
}

/** "15 accounts", "Unlimited accounts", "62 accounts" (Agency with extras). */
export function accountsLabel(tier: SubscriptionTier, extraAccounts = 0): string {
  const n = getPlanLimits(tier, extraAccounts).maxConnectedAccounts;
  if (isUnlimitedAccounts(n)) return "Unlimited accounts";
  return `${n} account${n === 1 ? "" : "s"}`;
}

/** "$1" today; always read from plan-pricing, never hardcoded. */
const EXTRA_MONTHLY = `$${formatMoney(AGENCY_EXTRA_ACCOUNT_PRICE.monthly)}`;

/** Shared by both sellable plans. */
const CORE_FEATURES = [
  "Unlimited posts and scheduling",
  "All 9 networks",
  "Calendar, drafts & posting queue",
  "Threads, carousels & per-platform captions",
  "REST API, hosted MCP & CLI",
  "Outbound webhooks",
] as const;

const CREATOR_EXTRAS = [
  "Bulk image & video scheduling",
  "Auto-repost",
  "Auto-plug",
  "Workspaces (multi-brand)",
] as const;

/** Full feature list per sellable plan. */
export const PLAN_FEATURES: Record<SellablePlanTier, readonly string[]> = {
  creator: [
    `Up to ${CREATOR_ACCOUNTS} connected accounts`,
    ...CORE_FEATURES,
    ...CREATOR_EXTRAS,
    "API, MCP & CLI: 1,000 requests / hour",
  ],
  agency: [
    `${AGENCY_INCLUDED_ACCOUNTS} accounts included, then +${EXTRA_MONTHLY}/month each`,
    "Teammates & shared workspaces",
    ...CORE_FEATURES,
    ...CREATOR_EXTRAS,
    "API, MCP & CLI: 5,000 requests / hour",
  ],
};

/** Short "what you get" lines for compact cards. */
export const PLAN_HIGHLIGHTS: Record<
  SellablePlanTier,
  { tagline: string; lead: string; items: readonly string[] }
> = {
  creator: {
    tagline: "For creators and small brands",
    lead: "Everything you need to post everywhere",
    items: [
      `Up to ${CREATOR_ACCOUNTS} connected accounts`,
      "Unlimited posts on all 9 networks",
      "Bulk tools, auto-repost & auto-plug",
      "REST API, MCP & CLI (1,000 requests / hour)",
    ],
  },
  agency: {
    tagline: "For agencies and teams",
    lead: `Everything in ${PLAN_NAMES.creator}, plus`,
    items: [
      `${AGENCY_INCLUDED_ACCOUNTS} accounts included, +${EXTRA_MONTHLY}/month per extra`,
      "No cap on accounts",
      "Teammates & shared workspaces",
      "5,000 API requests / hour",
    ],
  },
};

/** One line describing a legacy plan's limits for grandfathered customers. */
export function legacyPlanSummary(tier: PaidPlanTier): string {
  const l = getPlanLimits(tier);
  const parts = [accountsLabel(tier), "unlimited posts"];
  if (l.allowBulkTools) parts.push("bulk tools, auto-repost & auto-plug");
  if (l.allowTeams) parts.push("teammates");
  const s = parts.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What a user gives up moving from `from` down to `to` (downgrade/cancel copy). */
export function lostOnDowngrade(
  from: SubscriptionTier,
  to: SubscriptionTier,
  fromExtraAccounts = 0,
): string[] {
  const a = getPlanLimits(from, fromExtraAccounts);
  const b = getPlanLimits(to);
  const out: string[] = [];
  if (b.maxConnectedAccounts < a.maxConnectedAccounts) {
    const fromLabel = isUnlimitedAccounts(a.maxConnectedAccounts)
      ? "Unlimited accounts"
      : `Up to ${a.maxConnectedAccounts} accounts`;
    out.push(`${fromLabel} (drops to ${b.maxConnectedAccounts})`);
  }
  if (a.allowTeams && !b.allowTeams) out.push("Teammates & shared workspaces");
  if (a.allowAutoPlug && !b.allowAutoPlug) out.push("Auto-plug");
  if (a.allowResurface && !b.allowResurface) out.push("Auto-repost");
  if (a.allowBulkTools && !b.allowBulkTools) out.push("Bulk scheduling tools");
  if ((from === "pro" || from === "max") && (to === "creator" || to === "agency" || to === "free")) {
    out.push("Priority support");
  }
  if (isLegacyTier(from) && from !== to) {
    out.push(`Your ${planName(from)} plan and price (it isn't sold anymore, so you can't switch back)`);
  }
  return out;
}

/**
 * Price of `tier` per period. Agency includes paid extras; legacy plans keep
 * their grandfathered price.
 */
export function periodPrice(
  tier: PaidPlanTier,
  interval: BillingInterval,
  extraAccounts = 0,
): number {
  if (tier === "agency") {
    return planPriceForAccounts("agency", AGENCY_INCLUDED_ACCOUNTS + extraAccounts, interval);
  }
  return getPlanPrice(tier, interval).price;
}

/** "$<price>/mo" or "$<price>/yr"; Agency includes its paid extras. */
export function shortPrice(
  tier: PaidPlanTier,
  interval: BillingInterval,
  extraAccounts = 0,
): string {
  return `$${formatMoney(periodPrice(tier, interval, extraAccounts))}/${interval === "yearly" ? "yr" : "mo"}`;
}

/**
 * Agency account count to preselect: 59, or the user's current count when
 * they already have more connected.
 */
export function defaultAgencyAccounts(connected: number | null | undefined): number {
  const n = Math.ceil(connected ?? 0);
  return Math.max(AGENCY_INCLUDED_ACCOUNTS, Number.isFinite(n) ? n : 0);
}

/** Extras to send for an Agency checkout with `accounts` profiles. */
export { agencyExtraAccounts };

/**
 * The plan a user should move to for more accounts: Creator from Free or
 * small legacy plans, Agency from Creator / Growth / Pro. Null when already on
 * Agency (they add extras instead) or Max.
 */
export function nextPlanAbove(tier: SubscriptionTier): SellablePlanTier | null {
  const r = tierRank(tier);
  return SELLABLE_PLANS.find((p) => tierRank(p) > r && accountsGrow(tier, p)) ?? null;
}

function accountsGrow(from: SubscriptionTier, to: SellablePlanTier): boolean {
  return getPlanLimits(to).maxConnectedAccounts > getPlanLimits(from).maxConnectedAccounts;
}

export { planName };
