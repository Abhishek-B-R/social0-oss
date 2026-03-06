import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import DodoPayments from "dodopayments";
import { getTierFromProductId, PLAN_IDS } from "@/lib/plans";
import { setSubscription } from "@/lib/subscription";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment = (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode";

export type SyncSubscriptionResult = { ok: boolean; tier?: "starter" | "growth" };

/**
 * Sync subscription from Dodo Payments for a user (by userId).
 * Used after payment redirect and when connect is blocked with limit 0 so we pick up a new subscription.
 */
export async function syncSubscriptionForUserId(
  userId: string,
): Promise<SyncSubscriptionResult> {
  const productIds = [PLAN_IDS.starter, PLAN_IDS.growth].filter(Boolean);
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

        await setSubscription(userId, {
          tier,
          expiresAt: sub.next_billing_date ? new Date(sub.next_billing_date) : null,
          subscriptionId: sub.subscription_id ?? null,
          customerId: sub.customer?.customer_id ?? null,
        });
        return { ok: true, tier };
      }
    }
    // No active subscription found — downgrade to free
    await setSubscription(userId, {
      tier: "free",
      expiresAt: null,
      subscriptionId: null,
      customerId: null,
    });
    return { ok: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    console.error("[billing-sync] Dodo sync error:", msg);
    return { ok: false };
  }
}
