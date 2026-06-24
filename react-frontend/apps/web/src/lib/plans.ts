export type SubscriptionTier = "free" | "starter" | "growth" | "pro";

export interface PlanLimits {
  maxConnectedAccounts: number;
  maxFreePosts: number;
  allowBulkTools: boolean;
  allowAutoPlug: boolean;
  allowResurface: boolean;
}

export const PLAN_DISPLAY: Record<
  SubscriptionTier,
  { name: string; price: string }
> = {
  free: { name: "Free", price: "$0" },
  starter: { name: "Starter", price: "$9/mo" },
  growth: { name: "Growth", price: "$29/mo" },
  pro: { name: "Pro", price: "$49/mo" },
};
