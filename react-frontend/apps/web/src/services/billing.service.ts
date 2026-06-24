import { apiGet, apiPost } from "@/lib/api-client";
import type { SubscriptionTier } from "@/lib/plans";

export interface CheckoutInput {
  tier: "starter" | "growth" | "pro";
  returnUrl?: string;
}

export interface ChangePlanInput {
  tier: SubscriptionTier;
}

export const billingService = {
  checkout(input: CheckoutInput): Promise<{ checkoutUrl: string }> {
    return apiPost("/api/billing/checkout", input);
  },

  portal(): Promise<{ portalUrl: string }> {
    return apiPost("/api/billing/portal");
  },

  sync(): Promise<{ ok: boolean; tier?: SubscriptionTier }> {
    return apiPost("/api/billing/sync");
  },

  changePlan(input: ChangePlanInput): Promise<{ ok: boolean }> {
    return apiPost("/api/billing/change-plan", input);
  },

  previewPlanChange(tier: SubscriptionTier): Promise<Record<string, unknown>> {
    return apiPost("/api/billing/preview-plan-change", { tier });
  },

  cancel(reason?: string): Promise<{ ok: boolean }> {
    return apiPost("/api/billing/cancel", { reason });
  },

  cancelDowngrade(): Promise<{ ok: boolean }> {
    return apiPost("/api/billing/cancel-downgrade");
  },

  undoCancel(): Promise<{ ok: boolean }> {
    return apiPost("/api/billing/undo-cancel");
  },

  pause(): Promise<{ ok: boolean }> {
    return apiPost("/api/billing/pause");
  },

  subscriptionCheck(): Promise<{ active: boolean; tier?: SubscriptionTier }> {
    return apiGet("/api/auth/subscription-check");
  },
};
