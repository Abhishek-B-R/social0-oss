import type { SubscriptionTier, BillingInterval } from "@/lib/plans";

export type SubscriptionState = {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  subscriptionId: string | null;
  customerId: string | null;
  hasUsedTrial: boolean;
  pendingPlanTier: "starter" | "growth" | "pro" | null;
  cancelAtPeriodEnd: boolean;
  paused?: boolean;
  interval?: BillingInterval | null;
};
