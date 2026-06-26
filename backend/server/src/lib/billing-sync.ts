import { db } from "../db/index.js";
import { user } from "../db/schema.js";
import { eq } from "drizzle-orm";
import DodoPayments from "dodopayments";
import { getTierFromProductId, PLAN_IDS } from "./plans.js";
import { setSubscription } from "./subscription.js";
import {
  backfillBillingIds,
  listOpenDodoSubscriptions,
} from "./billing-guards.js";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";

export type SyncSubscriptionResult = {
  ok: boolean;
  tier?: "starter" | "growth" | "pro";
};

/**
 * Sync subscription from Dodo Payments for a user (by userId).
 * Used after payment redirect and when connect is blocked with limit 0 so we pick up a new subscription.
 */
export async function syncSubscriptionForUserId(
  userId: string,
): Promise<SyncSubscriptionResult> {
  const productIds = [PLAN_IDS.starter, PLAN_IDS.growth, PLAN_IDS.pro].filter(
    Boolean,
  );
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

        // Before trusting this upgrade, make sure there isn't a recent payment for this
        // subscription still in progress. We only sync the upgrade once Dodo shows a
        // succeeded payment (webhook remains the primary source of truth).
        const subscriptionId = sub.subscription_id ?? null;
        if (subscriptionId) {
          try {
            const payments = await client.payments.list({
              subscription_id: subscriptionId,
              limit: 1,
            } as any);
            const item = Array.isArray((payments as any)?.items)
              ? (payments as any).items[0]
              : null;
            const paymentStatus =
              item && typeof (item as any).status === "string"
                ? (item as any).status
                : null;

            if (paymentStatus && paymentStatus !== "succeeded") {
              // Payment is still processing or not successful yet - don't upgrade tier.
              sawUnpaidActiveSubscription = true;
              continue;
            }
          } catch {
            // If we can't read payments, be conservative and avoid changing tier here.
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
        return { ok: false };
      }

      // No open subscription at all - downgrade to free.
      await setSubscription(userId, {
        tier: "free",
        expiresAt: null,
        subscriptionId: null,
        customerId: null,
      });
    }
    return { ok: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    console.error("[billing-sync] Dodo sync error:", msg);
    return { ok: false };
  }
}
