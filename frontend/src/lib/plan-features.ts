import { getPlanLimits } from "@/lib/plans";

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
  { text: `${freePosts} posts to try before you upgrade`, highlight: true },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  ...CORE_EXTRAS.map((text) => ({ text })),
  { text: "Activated instantly — no trial that auto-charges" },
];

export const starterFeatures: string[] = [
  "Up to 5 connected accounts",
  "Unlimited posts",
  "Multiple accounts per platform",
  "Workspaces (multi-brand)",
  ...CORE_PUBLISH,
  ...CORE_DEV,
  ...CORE_EXTRAS,
];

export const growthFeatures: PlanFeature[] = [
  { text: "Up to 15 connected accounts", highlight: true },
  { text: "Unlimited posts", highlight: true },
  { text: "Multiple accounts per platform" },
  { text: "Workspaces (multi-brand)" },
  { text: "Bulk image & video scheduling", highlight: true },
  { text: "Auto-plug (performance CTA replies)", highlight: true },
  { text: "Auto-repost / resurface", highlight: true },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  ...CORE_EXTRAS.map((text) => ({ text })),
  { text: "Human support" },
];

export const proFeatures: PlanFeature[] = [
  { text: "Up to 50 connected accounts", highlight: true },
  { text: "Unlimited posts", highlight: true },
  { text: "Team collaboration / invite teammates", highlight: true },
  { text: "Multiple accounts per platform" },
  { text: "Workspaces (multi-brand)" },
  { text: "Bulk image & video scheduling" },
  { text: "Auto-plug (performance CTA replies)" },
  { text: "Auto-repost / resurface" },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  ...CORE_EXTRAS.map((text) => ({ text })),
  { text: "Priority support", highlight: true },
  { text: "Early access to new features" },
];

export const maxFeatures: PlanFeature[] = [
  { text: "Unlimited connected accounts", highlight: true },
  { text: "Unlimited posts", highlight: true },
  { text: "Team collaboration / invite teammates", highlight: true },
  { text: "Multiple accounts per platform" },
  { text: "Workspaces (multi-brand)" },
  { text: "Bulk image & video scheduling" },
  { text: "Auto-plug (performance CTA replies)" },
  { text: "Auto-repost / resurface" },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  ...CORE_EXTRAS.map((text) => ({ text })),
  { text: "Priority support", highlight: true },
  { text: "Early access to new features" },
  { text: "10,000 API requests / hour" },
];

/** Short bullets shown by default on onboarding plan cards. */
export const ONBOARDING_PLAN_HIGHLIGHTS = {
  starter: [
    "Up to 5 connected accounts",
    "Unlimited posts",
    "Schedule across platforms",
    "Threads & Collections",
    "Workspaces (multi-brand)",
  ],
  growth: [
    "Everything in Starter",
    "Up to 15 connected accounts",
    "Auto-plug & auto-repost",
    "Bulk scheduling tools",
    "Human support",
  ],
  pro: [
    "Everything in Growth",
    "Up to 50 connected accounts",
    "Invite teammates & collaborate",
    "Priority support",
    "Early access to new features",
  ],
} as const;

export function fullPlanFeatureTexts(
  plan: keyof typeof ONBOARDING_PLAN_HIGHLIGHTS,
): string[] {
  if (plan === "starter") return starterFeatures;
  if (plan === "growth") return growthFeatures.map((f) => f.text);
  return proFeatures.map((f) => f.text);
}
