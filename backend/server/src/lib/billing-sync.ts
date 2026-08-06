import { db } from "../db/index.js";
import { user } from "../db/schema.js";
import { eq } from "drizzle-orm";
import DodoPayments from "dodopayments";
import { getTierFromProductId, allPlanProductIds } from "@social0/shared";
import { setSubscription } from "./subscription.js";
import {
  backfillBillingIds,
  getLatestSubscriptionPayment,
  listOpenDodoSubscriptions,
} from "./billing-guards.js";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";

export type SyncSubscriptionResult = {
  ok: boolean;
  tier?: "starter" | "growth" | "pro" | "max";
};

/**
 * Sync subscription from Dodo Payments for a user (by userId).
 * Used after payment redirect and when connect is blocked with limit 0 so we pick up a new subscription.
 */
export async function syncSubscriptionForUserId(
  userId: string,
): Promise<SyncSubscriptionResult> {
  const productIds = allPlanProductIds();
  if (!apiKey || productIds.length === 0) {
    return { ok: false };
  }

  const userRow = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { email: true },
  });
  const userEmail = (userRow?.email ?? "").trim().toLowerCase();
  if (!userEmail) return { ok: false };

  const client = new DodoPayments({ bearerToken: apiKey, environment });

  try {
    let sawUnpaidActiveSubscription = false;

    for (const productId of productIds) {
      for await (const sub of client.subscriptions.list({
        product_id: productId,
        status: "active",
        page_size: 100,
      })) {
        const customerEmail = (sub.customer?.email ?? "").trim().toLowerCase();
        if (customerEmail !== userEmail) continue;

        const tier = getTierFromProductId(sub.product_id ?? "");
        if (tier === "free") continue;

        // Only sync upgrade when the newest payment has succeeded.
        const subscriptionId = sub.subscription_id ?? null;
        if (subscriptionId) {
          try {
            const latest = await getLatestSubscriptionPayment(subscriptionId);
            const paymentStatus = latest?.status ?? null;
            if (paymentStatus !== "succeeded") {
              sawUnpaidActiveSubscription = true;
              continue;
            }
            const amount =
              typeof latest?.total_amount === "number"
                ? latest.total_amount
                : 0;
            if (amount <= 0) {
              sawUnpaidActiveSubscription = true;
              continue;
            }
          } catch {
            sawUnpaidActiveSubscription = true;
            continue;
          }
        }

        await setSubscription(userId, {
          tier,
          expiresAt: sub.next_billing_date
            ? new Date(sub.next_billing_date)
            : null,
          subscriptionId: sub.subscription_id ?? null,
          customerId: sub.customer?.customer_id ?? null,
        });
        return { ok: true, tier };
      }
    }
    // If we saw an active subscription but its latest payment isn't succeeded yet,
    // don't touch the tier - webhook will update it once payment clears.
    if (!sawUnpaidActiveSubscription) {
      const openSubs = await listOpenDodoSubscriptions(userEmail);
      if (openSubs.length > 0) {
        const primary =
          openSubs.find((s) => s.status === "on_hold") ??
          openSubs.find((s) => s.status === "pending") ??
          openSubs[0];
        await backfillBillingIds(userId, {
          customerId: primary.customerId,
          subscriptionId: primary.subscriptionId,
        });
      }
      // Client-initiated sync may upgrade tier; never downgrade to free here.
    }
    return { ok: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    console.error("[billing-sync] Dodo sync error:", msg);
    return { ok: false };
  }
}
