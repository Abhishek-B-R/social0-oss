import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import DodoPayments from "dodopayments";
import { db } from "@/db";
import { user, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { setSubscription } from "@/lib/subscription";
import { syncConnectedAccountsToLimit } from "@/lib/plan-limits";
import { getTierFromProductId, PLAN_IDS } from "@/lib/plans";

const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET ?? "";
const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";

type DodoSubscriptionData = {
  subscription_id?: string;
  product_id?: string;
  next_billing_date?: string | null;
  status?: string;
  customer?: { customer_id?: string; email?: string };
  metadata?: Record<string, string>;
};

async function handleSubscriptionActiveOrUpdated(payload: {
  data: DodoSubscriptionData;
}) {
  const data = payload.data;
  const status = data.status ?? "";

  // CRITICAL: Only update tier when payment has actually succeeded.
  // Dodo fires subscription.updated / subscription.plan_changed when changePlan
  // is called, BEFORE payment succeeds. If payment fails, status becomes
  // "on_hold" / "past_due" — we must NOT write the new tier in that case.
  if (status === "cancelled" || status === "expired") {
    await handleSubscriptionCancelledOrExpired(payload);
    return;
  }
  if (status !== "active") {
    console.log(
      "[dodo webhook] Skipping tier update: subscription status is not active",
      { status: status || "(empty)" },
    );
    return;
  }

  // Diagnostic: log full payload to find how Dodo signals payment cleared vs in progress
  console.log("[dodo webhook] Full payload:", JSON.stringify(data, null, 2));

  const tier = getTierFromProductId(data.product_id ?? "");

  if (tier === "free") {
    console.warn(
      "[dodo webhook] Subscription product ID did not match env:",
      {
        receivedProductId: data.product_id,
        expectedStarterId: PLAN_IDS.starter ? "(set)" : "(not set)",
        expectedGrowthId: PLAN_IDS.growth ? "(set)" : "(not set)",
        customerEmail: data.customer?.email ? "(redacted)" : undefined,
      },
    );
    return;
  }

  let userId: string | null = null;
  const metadataUserId =
    data.metadata && typeof data.metadata.userId === "string"
      ? data.metadata.userId
      : null;
  if (metadataUserId) {
    const byId = await db.query.user.findFirst({
      where: eq(user.id, metadataUserId),
      columns: { id: true },
    });
    if (byId) userId = byId.id;
  }
  if (!userId && data.customer?.email) {
    const byEmail = await db.query.user.findFirst({
      where: eq(user.email, data.customer.email),
      columns: { id: true },
    });
    if (byEmail) userId = byEmail.id;
  }
  if (!userId) {
    console.warn("[dodo webhook] No user found for subscription (email/metadata redacted)");
    return;
  }

  await setSubscription(userId, {
    tier,
    expiresAt: data.next_billing_date ? new Date(data.next_billing_date) : null,
    subscriptionId: data.subscription_id ?? null,
    customerId: data.customer?.customer_id ?? null,
  });
  await syncConnectedAccountsToLimit(userId).catch((e) =>
    console.error("[dodo webhook] syncConnectedAccountsToLimit failed:", e),
  );
  console.log("[dodo webhook] Subscription updated", { tier });
}

async function handleSubscriptionCancelledOrExpired(payload: {
  data: DodoSubscriptionData;
}) {
  const data = payload.data;
  let userId: string | null = null;

  if (data.subscription_id) {
    const bySubId = await db.query.userSettings.findFirst({
      where: eq(userSettings.subscriptionId, data.subscription_id),
      columns: { userId: true },
    });
    if (bySubId) userId = bySubId.userId;
  }
  if (!userId && data.customer?.email) {
    const byEmail = await db.query.user.findFirst({
      where: eq(user.email, data.customer.email),
      columns: { id: true },
    });
    if (byEmail) userId = byEmail.id;
  }
  if (!userId) return;

  await setSubscription(userId, {
    tier: "free",
    expiresAt: null,
    subscriptionId: null,
    customerId: null,
  });
  await syncConnectedAccountsToLimit(userId).catch((e) =>
    console.error("[dodo webhook] syncConnectedAccountsToLimit failed:", e),
  );
}

/**
 * On subscription.renewed: if user had a pending downgrade scheduled, apply it
 * now by calling Dodo changePlan, then clear pendingPlanTier. A subsequent
 * plan_changed/updated webhook will update our DB with the new tier.
 */
async function handleSubscriptionRenewed(payload: {
  data: DodoSubscriptionData;
}) {
  const data = payload.data;
  const subscriptionId = data.subscription_id ?? null;
  if (!subscriptionId || !apiKey) return;

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.subscriptionId, subscriptionId),
    columns: { userId: true, pendingPlanTier: true },
  });
  if (!row?.pendingPlanTier || (row.pendingPlanTier !== "starter" && row.pendingPlanTier !== "growth"))
    return;

  const productId =
    row.pendingPlanTier === "starter"
      ? PLAN_IDS.starter
      : PLAN_IDS.growth;
  if (!productId) return;

  const client = new DodoPayments({ bearerToken: apiKey, environment });
  try {
    await client.subscriptions.changePlan(subscriptionId, {
      product_id: productId,
      quantity: 1,
      proration_billing_mode: "prorated_immediately",
    });
    await db
      .update(userSettings)
      .set({ pendingPlanTier: null, downgradeReason: null })
      .where(eq(userSettings.userId, row.userId));
    console.log("[dodo webhook] Pending downgrade applied on renewal", { pendingPlanTier: row.pendingPlanTier });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Apply downgrade failed";
    console.error("[dodo webhook] Failed to apply pending downgrade on renewal:", msg);
  }
}

export async function POST(request: Request) {
  if (!webhookSecret) {
    console.error("[dodo webhook] DODO_PAYMENTS_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const webhookId = request.headers.get("webhook-id");
  const webhookTimestamp = request.headers.get("webhook-timestamp");
  const webhookSignature = request.headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json(
      { error: "Missing webhook headers" },
      { status: 400 },
    );
  }

  let payload: { type?: string; data?: DodoSubscriptionData };
  try {
    const wh = new Webhook(webhookSecret);
    payload = wh.verify(rawBody, {
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp,
      "webhook-signature": webhookSignature,
    }) as { type?: string; data?: DodoSubscriptionData };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    console.error("[dodo webhook] Verification failed:", msg);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const eventType = payload.type ?? "";
  const data = payload.data;

  try {
    if (eventType === "subscription.renewed" && data) {
      await handleSubscriptionRenewed({ data });
      await handleSubscriptionActiveOrUpdated({ data });
    } else if (eventType === "subscription.on_hold" && data) {
      // Payment failed or not yet complete — do NOT change tier; user keeps previous tier.
      console.log(
        "[dodo webhook] Skipping tier update: subscription.on_hold (payment not complete)",
      );
    } else if (
      eventType === "subscription.active" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.plan_changed"
    ) {
      if (data) await handleSubscriptionActiveOrUpdated({ data });
    } else if (
      eventType === "subscription.cancelled" ||
      eventType === "subscription.expired"
    ) {
      if (data) await handleSubscriptionCancelledOrExpired({ data });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[dodo webhook] Handler error:", msg);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
