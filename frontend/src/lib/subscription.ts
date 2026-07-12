import type { SubscriptionTier } from "@social0/shared/browser";

export type SubscriptionState = {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  subscriptionId: string | null;
  customerId: string | null;
  hasUsedTrial: boolean;
  pendingPlanTier: "starter" | "growth" | null;
  cancelAtPeriodEnd: boolean;
  paused?: boolean;
};
