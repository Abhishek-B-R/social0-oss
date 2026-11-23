import type { BillingInterval, PaidPlanTier, SubscriptionTier } from "@/lib/plans";

export type SubscriptionState = {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  subscriptionId: string | null;
  customerId: string | null;
  hasUsedTrial: boolean;
  pendingPlanTier: PaidPlanTier | null;
  cancelAtPeriodEnd: boolean;
  paused?: boolean;
  interval?: BillingInterval | null;
  /** Agency only: paid accounts above the 59 included (0 otherwise). */
  extraAccounts: number;
};
