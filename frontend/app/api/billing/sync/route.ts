import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { getTierFromProductId, PLAN_IDS } from "@/lib/plans";
import { setSubscription } from "@/lib/subscription";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment = (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

/**
 * Sync current user's subscription from Dodo Payments by listing subscriptions
 * for our products and matching customer email. Updates DB so the app shows
 * the correct plan (e.g. after payment when webhook didn't run).
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const productIds = [PLAN_IDS.starter, PLAN_IDS.growth].filter(Boolean);
  if (!apiKey || productIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Billing sync not configured" },
      { status: 503 },
    );
  }

  const userEmail = (session.user.email ?? "").trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json(
      { ok: false, error: "No email on account" },
      { status: 400 },
    );
  }

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

        await setSubscription(session.user.id, {
          tier,
          expiresAt: sub.next_billing_date ? new Date(sub.next_billing_date) : null,
          subscriptionId: sub.subscription_id ?? null,
          customerId: sub.customer?.customer_id ?? null,
        });

        return NextResponse.json({ ok: true, tier });
      }
    }

    return NextResponse.json({ ok: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    console.error("[billing/sync] Dodo sync error:", msg);
    return NextResponse.json(
      { ok: false, error: "Sync failed" },
      { status: 500 },
    );
  }
}
