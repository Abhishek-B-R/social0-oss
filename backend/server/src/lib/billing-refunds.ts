import DodoPayments from "dodopayments";
import { env } from "./env.js";
import { getLatestSubscriptionPayment } from "./billing-guards.js";

export type SubscriptionChargeRefund =
  | { refunded: true; paymentId: string; refundId: string }
  | {
      refunded: false;
      reason:
        | "not_configured"
        | "no_payment"
        | "not_paid"
        | "already_refunded"
        | "failed";
      paymentId?: string;
      message?: string;
    };

function dodoClient(): DodoPayments | null {
  const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
  if (!apiKey) return null;
  return new DodoPayments({
    bearerToken: apiKey,
    environment: env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode",
  });
}

/**
 * Refund the newest charge of a subscription we cancelled as a duplicate.
 *
 * Two checkout sessions can both be paid (pick Starter, go back, pick Growth,
 * pay both). Only one subscription can back the user's plan, so the other is
 * cancelled; cancelling stops renewals but keeps the charge it already took.
 * This hands that charge back.
 *
 * Only a succeeded, non-zero payment with no refund on it yet is refunded, so
 * calling this again for the same subscription is a no-op. Never throws.
 */
export async function refundLatestSubscriptionCharge(
  subscriptionId: string,
  reason: string,
): Promise<SubscriptionChargeRefund> {
  const client = dodoClient();
  if (!client) return { refunded: false, reason: "not_configured" };

  const latest = await getLatestSubscriptionPayment(subscriptionId);
  const paymentId = latest?.payment_id;
  if (!latest || !paymentId) return { refunded: false, reason: "no_payment" };
  const amount =
    typeof latest.total_amount === "number" ? latest.total_amount : 0;
  if (latest.status !== "succeeded" || amount <= 0) {
    return { refunded: false, reason: "not_paid", paymentId };
  }

  try {
    const payment = await client.payments.retrieve(paymentId);
    const hasRefund =
      Boolean(payment.refund_status) ||
      (payment.refunds ?? []).some((r) => r.status !== "failed");
    if (hasRefund) {
      return { refunded: false, reason: "already_refunded", paymentId };
    }

    const refund = await client.refunds.create(
      {
        payment_id: paymentId,
        reason,
        metadata: { duplicate_subscription_id: subscriptionId },
      },
      // Two webhooks can cancel the same duplicate at once; one refund only.
      { idempotencyKey: `duplicate-subscription-refund:${paymentId}` },
    );
    return { refunded: true, paymentId, refundId: refund.refund_id };
  } catch (e) {
    return {
      refunded: false,
      reason: "failed",
      paymentId,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
