import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { db } from "@/db";
import { user, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { setSubscription } from "@/lib/subscription";
import { getTierFromProductId, PLAN_IDS } from "@/lib/plans";

const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET ?? "";

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
  // Log without PII (no userId, no subscription_id in production logs)
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
    if (
      eventType === "subscription.active" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.renewed" ||
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
