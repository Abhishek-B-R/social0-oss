import { RouteResponse } from "../../lib/http/http.js";
import { Webhook } from "standardwebhooks";
import DodoPayments from "dodopayments";
import { db } from "../../db/index.js";
import { user, userSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { setSubscription } from "../../lib/subscription.js";
import { syncConnectedAccountsToLimit } from "../../lib/plan-limits.js";
import {
  getTierFromProductId,
  PLAN_IDS,
  isActiveTier,
} from "../../lib/plans.js";
import { env } from "../../lib/env.js";
import { claimWebhookDelivery } from "../../lib/webhook-idempotency.js";
import {
  findRecentPaidUpgradePayment,
  hasTrialBeenClaimed,
  recordTrialClaim,
} from "../../lib/billing-guards.js";
import { clearPendingCheckout } from "../../lib/pending-checkout.js";
import {
  forceCancelDodoSubscription,
  isStaleZombieSubscription,
} from "../../lib/billing-zombie-utils.js";

const webhookSecret = env.DODO_PAYMENTS_WEBHOOK_SECRET ?? "";
const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
const environment = env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";
// Only enable debug logging in non-production environments to avoid leaking billing data
const billingDebug =
  process.env.BILLING_DEBUG === "1" && process.env.NODE_ENV !== "production";

function tierRank(tier: string | null | undefined): number {
  switch (tier) {
    case "free":
      return 0;
    case "starter":
      return 1;
    case "growth":
      return 2;
    case "pro":
      return 3;
    default:
      return -1;
  }
}

type DodoSubscriptionData = {
  subscription_id?: string;
  product_id?: string;
  next_billing_date?: string | null;
  previous_billing_date?: string | null;
  created_at?: string;
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
  // "on_hold" / "past_due" - we must NOT write the new tier in that case.
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

  // Diagnostic: log full payload (only when debugging)
  if (billingDebug) {
    console.log("[dodo webhook] Full payload:", JSON.stringify(data, null, 2));
  }

  const tier = getTierFromProductId(data.product_id ?? "");

  if (tier === "free") {
    console.warn("[dodo webhook] Subscription product ID did not match env:", {
      receivedProductId: data.product_id,
      expectedStarterId: PLAN_IDS.starter ? "(set)" : "(not set)",
      expectedGrowthId: PLAN_IDS.growth ? "(set)" : "(not set)",
      customerEmail: data.customer?.email ? "(redacted)" : undefined,
    });
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
    console.warn(
      "[dodo webhook] No user found for subscription (email/metadata redacted)",
    );
    return;
  }

  const incomingSubId = data.subscription_id ?? null;
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: {
      subscriptionTier: true,
      subscriptionId: true,
    },
  });
  const currentTier = (settings?.subscriptionTier as string | null) ?? "free";
  const canonicalSubId = settings?.subscriptionId ?? null;

  // Ignore duplicate subscription objects - only one canonical sub per user.
  if (
    incomingSubId &&
    canonicalSubId &&
    incomingSubId !== canonicalSubId &&
    isActiveTier(currentTier as "starter" | "growth" | "pro")
  ) {
    console.warn("[dodo webhook] Ignoring duplicate subscription activation", {
      incomingSubId,
      canonicalSubId,
    });
    return;
  }

  const isUpgrade = tierRank(tier) > tierRank(currentTier);

  // CRITICAL MONEY GUARD:
  // Dodo can mark subscription "active" immediately on changePlan even while payment is still processing.
  if (isUpgrade) {
    if (!apiKey) {
      console.error(
        "[dodo webhook] Skipping upgrade: DODO_PAYMENTS_API_KEY missing",
      );
      return;
    }
    if (!incomingSubId) {
      console.error("[dodo webhook] Skipping upgrade: missing subscription_id");
      return;
    }

    const upgradePayment = await findRecentPaidUpgradePayment(incomingSubId);
    if (!upgradePayment) {
      console.log("[dodo webhook] Skipping upgrade: no recent paid payment", {
        currentTier,
        newTier: tier,
        subscriptionId: incomingSubId,
      });
      return;
    }

    console.log("[dodo webhook] Upgrade verified by recent paid payment", {
      paymentId: upgradePayment.payment_id ?? "(missing)",
      currentTier,
      newTier: tier,
    });
  } else if (currentTier === "free") {
    // First subscription: allow ₹0 trial only if trial not already claimed for this email.
    const email = data.customer?.email ?? "";
    if (email) {
      const trialClaimed = await hasTrialBeenClaimed(email, userId);
      if (trialClaimed && apiKey && incomingSubId) {
        const client = new DodoPayments({ bearerToken: apiKey, environment });
        let latestPayment: { status?: string; total_amount?: number } | null =
          null;
        try {
          const list = await (
            client.payments as { list: (q: object) => Promise<unknown> }
          ).list({
            subscription_id: incomingSubId,
            limit: 1,
          });
          latestPayment = Array.isArray((list as { items?: unknown[] })?.items)
            ? ((list as { items: unknown[] }).items[0] as {
                status?: string;
                total_amount?: number;
              })
            : null;
        } catch {
          console.error(
            "[dodo webhook] Payment verification failed for first subscription",
          );
          return;
        }

        const paymentStatus = latestPayment?.status ?? null;
        const amount =
          typeof latestPayment?.total_amount === "number"
            ? latestPayment.total_amount
            : 0;
        if (paymentStatus !== "succeeded" || amount <= 0) {
          console.log(
            "[dodo webhook] Skipping first subscription: trial already claimed, no paid payment",
          );
          return;
        }
      }
    }
  }

  await setSubscription(userId, {
    tier,
    expiresAt: data.next_billing_date ? new Date(data.next_billing_date) : null,
    subscriptionId: data.subscription_id ?? null,
    customerId: data.customer?.customer_id ?? null,
  });
  await clearPendingCheckout(userId).catch((e) =>
    console.error("[dodo webhook] clearPendingCheckout failed:", e),
  );
  await syncConnectedAccountsToLimit(userId).catch((e) =>
    console.error("[dodo webhook] syncConnectedAccountsToLimit failed:", e),
  );
  if (data.customer?.email) {
    await recordTrialClaim({
      email: data.customer.email,
      userId,
      customerId: data.customer?.customer_id ?? null,
    }).catch((e) =>
      console.error("[dodo webhook] recordTrialClaim failed:", e),
    );
  }
  console.log("[dodo webhook] Subscription updated", { tier });
}

async function handleSubscriptionOnHold(payload: {
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
    subscriptionId: data.subscription_id ?? null,
    customerId: data.customer?.customer_id ?? null,
  });
  await syncConnectedAccountsToLimit(userId).catch((e) =>
    console.error("[dodo webhook] syncConnectedAccountsToLimit failed:", e),
  );
  console.log("[dodo webhook] Subscription on_hold - reverted user to free");

  const subId = data.subscription_id;
  if (
    subId &&
    data.created_at &&
    isStaleZombieSubscription({
      status: "on_hold",
      created_at: data.created_at,
      previous_billing_date: data.previous_billing_date,
      next_billing_date: data.next_billing_date,
    })
  ) {
    await forceCancelDodoSubscription(subId);
    console.log("[dodo webhook] Cancelled stale on_hold subscription in Dodo", {
      subscriptionId: subId,
    });
  }
}

async function handleSubscriptionFailedOrExpired(payload: {
  data: DodoSubscriptionData;
}) {
  const data = payload.data;
  const subId = data.subscription_id;
  if (subId) {
    await forceCancelDodoSubscription(subId);
    console.log("[dodo webhook] Force-cancelled zombie subscription in Dodo", {
      subscriptionId: subId,
      status: data.status ?? "(unknown)",
    });
  }
  await handleSubscriptionCancelledOrExpired(payload);
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
  if (
    !row?.pendingPlanTier ||
    (row.pendingPlanTier !== "starter" && row.pendingPlanTier !== "growth")
  )
    return;

  const productId =
    row.pendingPlanTier === "starter" ? PLAN_IDS.starter : PLAN_IDS.growth;
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
    console.log("[dodo webhook] Pending downgrade applied on renewal", {
      pendingPlanTier: row.pendingPlanTier,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Apply downgrade failed";
    console.error(
      "[dodo webhook] Failed to apply pending downgrade on renewal:",
      msg,
    );
  }
}

export async function handleDodoWebhook(request: Request) {
  if (!webhookSecret) {
    console.error("[dodo webhook] DODO_PAYMENTS_WEBHOOK_SECRET is not set");
    return RouteResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const webhookId = request.headers.get("webhook-id");
  const webhookTimestamp = request.headers.get("webhook-timestamp");
  const webhookSignature = request.headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return RouteResponse.json(
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
    return RouteResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const isNewDelivery = await claimWebhookDelivery(webhookId);
  if (!isNewDelivery) {
    return RouteResponse.json({ received: true, duplicate: true });
  }

  const eventType = payload.type ?? "";
  const data = payload.data;

  try {
    if (eventType === "subscription.renewed" && data) {
      await handleSubscriptionRenewed({ data });
      await handleSubscriptionActiveOrUpdated({ data });
    } else if (eventType === "subscription.on_hold" && data) {
      await handleSubscriptionOnHold({ data });
    } else if (
      eventType === "subscription.active" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.plan_changed"
    ) {
      if (data) await handleSubscriptionActiveOrUpdated({ data });
    } else if (
      eventType === "subscription.cancelled" ||
      eventType === "subscription.expired" ||
      eventType === "subscription.failed"
    ) {
      if (data) await handleSubscriptionFailedOrExpired({ data });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[dodo webhook] Handler error:", msg);
    return RouteResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return RouteResponse.json({ received: true });
}
