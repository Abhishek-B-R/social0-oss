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
  getProductId,
  getIntervalFromProductId,
  PLAN_IDS,
  isActiveTier,
  type PaidPlanTier,
  type SubscriptionTier,
} from "@social0/shared";
import { env } from "../../lib/env.js";
import {
  claimWebhookDelivery,
  releaseWebhookDelivery,
} from "../../lib/webhook-idempotency.js";
import {
  findRecentPaidUpgradePayment,
  hasTrialBeenClaimed,
  listOpenDodoSubscriptions,
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
    case "max":
      return 4;
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
  // Dodo may fire subscription.updated / plan_changed before payment clears.
  // If payment fails, status becomes on_hold — we must NOT write the new tier.
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
      pendingPlanTier: true,
    },
  });
  const currentTier = (settings?.subscriptionTier as string | null) ?? "free";
  const canonicalSubId = settings?.subscriptionId ?? null;

  // Ignore duplicate subscription objects - only one canonical sub per user.
  // Cancel the rival in Dodo so the customer is never double-charged.
  if (
    incomingSubId &&
    canonicalSubId &&
    incomingSubId !== canonicalSubId &&
    isActiveTier(currentTier as SubscriptionTier)
  ) {
    console.warn("[dodo webhook] Ignoring duplicate subscription activation", {
      incomingSubId,
      canonicalSubId,
    });
    forceCancelDodoSubscription(incomingSubId).catch((e) =>
      console.error(
        "[dodo webhook] Failed to cancel duplicate subscription:",
        e,
      ),
    );
    return;
  }

  const isUpgrade = tierRank(tier) > tierRank(currentTier);

  // CRITICAL MONEY GUARD: never unlock a higher tier without a recent succeeded payment.
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
        let latestPayment: { status?: string; total_amount?: number } | null;
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

  // Cancel any other open Dodo subscriptions so the user is never double-charged.
  // This covers the race where two checkout sessions (e.g. a stuck one and a fresh
  // retry) both complete — the first webhook to write wins, and the loser sub is
  // cancelled in Dodo so no further renewals occur.
  const acceptedSubId = data.subscription_id ?? null;
  const customerEmail = data.customer?.email ?? "";
  if (acceptedSubId && customerEmail && apiKey) {
    cancelRivalSubscriptions(
      customerEmail,
      data.customer?.customer_id ?? null,
      acceptedSubId,
    ).catch((e) =>
      console.error("[dodo webhook] cancelRivalSubscriptions failed:", e),
    );
  }

  if (settings?.pendingPlanTier === tier) {
    await db
      .update(userSettings)
      .set({ pendingPlanTier: null, downgradeReason: null })
      .where(eq(userSettings.userId, userId));
  }
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

/**
 * After accepting a subscription, cancel any *other* open Dodo subscriptions
 * for the same customer/email. Prevents double-charging when two checkout
 * sessions (e.g. a stuck one and a fresh retry) both complete.
 */
async function cancelRivalSubscriptions(
  email: string,
  customerId: string | null,
  acceptedSubId: string,
): Promise<void> {
  const openSubs = await listOpenDodoSubscriptions(email, customerId);
  for (const rival of openSubs) {
    if (rival.subscriptionId === acceptedSubId) continue;
    console.log("[dodo webhook] Cancelling rival subscription", {
      rivalSubId: rival.subscriptionId,
      rivalStatus: rival.status,
      acceptedSubId,
    });
    await forceCancelDodoSubscription(rival.subscriptionId).catch((e) =>
      console.error("[dodo webhook] Failed to cancel rival subscription:", e),
    );
  }
}

async function handleSubscriptionOnHold(payload: {
  data: DodoSubscriptionData;
}) {
  const data = payload.data;
  const incomingSubId = data.subscription_id ?? null;
  let userId: string | null = null;
  let isCanonical = false;

  if (incomingSubId) {
    const bySubId = await db.query.userSettings.findFirst({
      where: eq(userSettings.subscriptionId, incomingSubId),
      columns: { userId: true },
    });
    if (bySubId) {
      userId = bySubId.userId;
      isCanonical = true;
    }
  }
  if (!userId && data.customer?.email) {
    const byEmail = await db.query.user.findFirst({
      where: eq(user.email, data.customer.email),
      columns: { id: true },
    });
    if (byEmail) {
      const settings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, byEmail.id),
        columns: { subscriptionId: true },
      });
      if (
        incomingSubId &&
        settings?.subscriptionId &&
        settings.subscriptionId !== incomingSubId
      ) {
        console.log(
          "[dodo webhook] Ignoring on_hold for non-canonical subscription",
          { incomingSubId, canonicalSubId: settings.subscriptionId },
        );
        await forceCancelDodoSubscription(incomingSubId);
        return;
      }
      userId = byEmail.id;
      isCanonical = Boolean(
        incomingSubId && settings?.subscriptionId === incomingSubId,
      );
    }
  }
  if (!userId) return;

  if (!isCanonical) {
    if (incomingSubId) {
      await forceCancelDodoSubscription(incomingSubId);
    }
    return;
  }

  await setSubscription(userId, {
    tier: "free",
    expiresAt: null,
    subscriptionId: null,
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
  const incomingSubId = data.subscription_id ?? null;
  let userId: string | null = null;

  if (incomingSubId) {
    const bySubId = await db.query.userSettings.findFirst({
      where: eq(userSettings.subscriptionId, incomingSubId),
      columns: { userId: true },
    });
    if (bySubId) userId = bySubId.userId;
  }
  if (!userId && data.customer?.email) {
    const byEmail = await db.query.user.findFirst({
      where: eq(user.email, data.customer.email),
      columns: { id: true },
    });
    if (byEmail) {
      const settings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, byEmail.id),
        columns: { subscriptionId: true },
      });
      // Ignore cancel/expired events for duplicate/zombie subs — only act on
      // the canonical subscription stored in user_settings.
      if (
        incomingSubId &&
        settings?.subscriptionId &&
        settings.subscriptionId !== incomingSubId
      ) {
        console.log(
          "[dodo webhook] Ignoring cancel/expired for non-canonical subscription",
          { incomingSubId, canonicalSubId: settings.subscriptionId },
        );
        return;
      }
      userId = byEmail.id;
    }
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
 * On subscription.renewed: if user had a pending plan change stored locally
 * (legacy downgrade path), apply it now. Upgrades scheduled via Dodo
 * (effective_at=next_billing_date) are applied by Dodo itself — we only clear
 * pending when the renewed product already matches.
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
    !isActiveTier(row.pendingPlanTier as SubscriptionTier)
  ) {
    return;
  }

  const renewedTier = getTierFromProductId(data.product_id ?? "");
  if (renewedTier === row.pendingPlanTier) {
    await db
      .update(userSettings)
      .set({ pendingPlanTier: null, downgradeReason: null })
      .where(eq(userSettings.userId, row.userId));
    console.log("[dodo webhook] Pending plan change already applied by Dodo", {
      pendingPlanTier: row.pendingPlanTier,
    });
    return;
  }

  // Legacy local-only downgrade: apply now.
  const interval =
    getIntervalFromProductId(data.product_id ?? "") ?? "monthly";
  const productId = getProductId(
    row.pendingPlanTier as PaidPlanTier,
    interval,
  );
  if (!productId) return;

  const client = new DodoPayments({ bearerToken: apiKey, environment });
  try {
    await client.subscriptions.changePlan(subscriptionId, {
      product_id: productId,
      quantity: 1,
      proration_billing_mode: "do_not_bill",
      effective_at: "immediately",
    });
    await db
      .update(userSettings)
      .set({ pendingPlanTier: null, downgradeReason: null })
      .where(eq(userSettings.userId, row.userId));
    console.log("[dodo webhook] Pending plan change applied on renewal", {
      pendingPlanTier: row.pendingPlanTier,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Apply pending plan failed";
    console.error(
      "[dodo webhook] Failed to apply pending plan change on renewal:",
      msg,
    );
  }
}

async function handlePaymentSucceeded(payload: {
  data: {
    subscription_id?: string | null;
    status?: string;
    // Some Dodo payloads nest ids differently — accept common aliases.
    subscriptionId?: string | null;
  };
}) {
  const subscriptionId =
    payload.data.subscription_id ?? payload.data.subscriptionId ?? null;
  if (!subscriptionId || !apiKey) {
    console.log(
      "[dodo webhook] payment.succeeded skipped: missing subscription_id",
    );
    return;
  }

  // Only act when this payment event itself succeeded (defensive).
  if (payload.data.status && payload.data.status !== "succeeded") return;

  const client = new DodoPayments({ bearerToken: apiKey, environment });
  try {
    const sub = await client.subscriptions.retrieve(subscriptionId);
    await handleSubscriptionActiveOrUpdated({
      data: {
        subscription_id: sub.subscription_id ?? subscriptionId,
        product_id: sub.product_id ?? undefined,
        status: sub.status ?? undefined,
        next_billing_date: sub.next_billing_date ?? null,
        previous_billing_date: sub.previous_billing_date ?? null,
        customer: sub.customer
          ? {
              customer_id: sub.customer.customer_id,
              email: sub.customer.email,
            }
          : undefined,
        metadata:
          sub.metadata && typeof sub.metadata === "object"
            ? (sub.metadata as Record<string, string>)
            : undefined,
      },
    });
    console.log("[dodo webhook] payment.succeeded → re-synced subscription", {
      subscriptionId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[dodo webhook] payment.succeeded sync failed:", msg);
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

  let payload: {
    type?: string;
    data?: DodoSubscriptionData & {
      subscription_id?: string | null;
      status?: string;
    };
  };
  try {
    const wh = new Webhook(webhookSecret);
    payload = wh.verify(rawBody, {
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp,
      "webhook-signature": webhookSignature,
    }) as {
      type?: string;
      data?: DodoSubscriptionData & {
        subscription_id?: string | null;
        status?: string;
      };
    };
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
    if (eventType === "payment.succeeded" && data) {
      await handlePaymentSucceeded({ data });
    } else if (eventType === "subscription.renewed" && data) {
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
    // The claim was taken before the handler ran. Hand it back so Dodo's retry
    // of this delivery is actually processed instead of short-circuiting as a
    // duplicate — otherwise one transient failure drops a billing event.
    await releaseWebhookDelivery(webhookId);
    return RouteResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return RouteResponse.json({ received: true });
}
