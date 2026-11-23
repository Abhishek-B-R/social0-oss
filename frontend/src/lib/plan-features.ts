import {
  AGENCY_INCLUDED_ACCOUNTS,
  CREATOR_ACCOUNTS,
  getPlanLimits,
  PLAN_NAMES,
  type SellablePlanTier,
} from "@/lib/plans";
import { AGENCY_EXTRA_ACCOUNT_PRICE, formatMoney } from "@/lib/plan-pricing";

const EXTRA_MONTHLY = `$${formatMoney(AGENCY_EXTRA_ACCOUNT_PRICE.monthly)}`;

const freePosts = getPlanLimits("free").maxFreePosts;

/** Shared milk lines — repeated per card (not one bundled “API, MCP & CLI” row). */
export const CORE_PUBLISH = [
  "All 9 platforms",
  "Text, image & video posts",
  "Threads (multi-post)",
  "Collections & carousels",
  "Per-platform captions",
  "Drag-and-drop media",
  "Drafts",
  "Publish now",
  "Parallel multi-platform publish",
  "Live publish progress",
  "Schedule posts",
  "Content calendar",
  "Posting queue",
  "Timezone-aware scheduling",
  "Edit scheduled posts",
  "Post again / retry",
  "Official OAuth connections",
  "Token health & reconnect",
] as const;

export const CORE_DEV = [
  "REST API",
  "MCP server",
  "CLI",
  "API keys",
  "Outbound webhooks",
] as const;

export const CORE_EXTRAS = ["Email on post failure", "Dark / light mode"] as const;

export type PlanFeature = { text: string; highlight?: boolean };

export const freeFeatures: PlanFeature[] = [
  { text: "No credit card required", highlight: true },
  { text: "Up to 3 connected accounts", highlight: true },
  { text: `${freePosts} posts for trial`, highlight: true },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  ...CORE_EXTRAS.map((text) => ({ text })),
  { text: "Activated instantly — no trial that auto-charges" },
];

export const creatorFeatures: PlanFeature[] = [
  { text: `Up to ${CREATOR_ACCOUNTS} connected accounts`, highlight: true },
  { text: "Unlimited posts", highlight: true },
  { text: "Multiple accounts per platform" },
  { text: "Workspaces (multi-brand)" },
  { text: "Bulk image & video scheduling", highlight: true },
  { text: "Auto-plug (performance CTA replies)", highlight: true },
  { text: "Auto-repost / resurface", highlight: true },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  { text: "1,000 API requests / hour" },
  ...CORE_EXTRAS.map((text) => ({ text })),
];

export const agencyFeatures: PlanFeature[] = [
  { text: `${AGENCY_INCLUDED_ACCOUNTS} accounts included`, highlight: true },
  { text: `+${EXTRA_MONTHLY}/month per extra account, no cap`, highlight: true },
  { text: "Unlimited posts", highlight: true },
  { text: "Teammates & shared workspaces", highlight: true },
  { text: "Multiple accounts per platform" },
  { text: "Workspaces (multi-brand)" },
  { text: "Bulk image & video scheduling" },
  { text: "Auto-plug (performance CTA replies)" },
  { text: "Auto-repost / resurface" },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  { text: "5,000 API requests / hour", highlight: true },
  ...CORE_EXTRAS.map((text) => ({ text })),
];

/** Short bullets shown by default on onboarding plan cards. */
export const ONBOARDING_PLAN_HIGHLIGHTS = {
  creator: [
    `Up to ${CREATOR_ACCOUNTS} connected accounts`,
    "Unlimited posts and scheduling",
    "All 9 networks",
    "Bulk tools, auto-repost & auto-plug",
    "REST API, MCP & CLI (1,000 requests / hour)",
  ],
  agency: [
    `Everything in ${PLAN_NAMES.creator}`,
    `${AGENCY_INCLUDED_ACCOUNTS} accounts included, +${EXTRA_MONTHLY}/month per extra`,
    "No cap on accounts",
    "Teammates & shared workspaces",
    "5,000 API requests / hour",
  ],
} as const satisfies Record<SellablePlanTier, readonly string[]>;

export function fullPlanFeatureTexts(plan: SellablePlanTier): string[] {
  return (plan === "creator" ? creatorFeatures : agencyFeatures).map((f) => f.text);
}
