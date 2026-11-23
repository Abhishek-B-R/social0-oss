import { RouteResponse } from "../../lib/http/http.js";
import { Webhook } from "standardwebhooks";
import DodoPayments from "dodopayments";
import { db } from "../../db/index.js";
import { user, userSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import {
  setSubscription,
  setSubscriptionIfCanonical,
} from "../../lib/subscription.js";
import { syncConnectedAccountsToLimit } from "../../lib/plan-limits.js";
import {
  extraAccountsFromAddons,
  getTierFromProductId,
  PLAN_IDS,
  isActiveTier,
  tierRank,
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
import { refundLatestSubscriptionCharge } from "../../lib/billing-refunds.js";
import { clearPendingCheckout } from "../../lib/pending-checkout.js";
import { SUBSCRIPTION_ID_UNIQUE } from "../../lib/billing-ownership.js";
import { isUniqueViolation } from "../../lib/pg-errors.js";
import {
  getAfterUpgradeMarker,
  settleAfterUpgrade,
} from "../../lib/billing-after-upgrade.js";
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

type DodoSubscriptionData = {
  subscription_id?: string;
  product_id?: string;
  next_billing_date?: string | null;
  previous_billing_date?: string | null;
  created_at?: string;
  status?: string;
  customer?: { customer_id?: string; email?: string };
  metadata?: Record<string, string>;
  /** A plan change Dodo will apply at next_billing_date, if any. */
  scheduled_change?: { product_id?: string } | null;
  /** Add-ons on the subscription (Agency extra accounts). */
  addons?: Array<{ addon_id: string; quantity: number }> | null;
};

/**
 * Agency extra accounts on a subscription: 0 for any other tier, undefined
 * when the data carries no add-on list (the stored count is then kept).
 */
function extraAccountsFor(
  tier: SubscriptionTier,
  data: DodoSubscriptionData,
): number | undefined {
  if (tier !== "agency") return 0;
  return Array.isArray(data.addons)
    ? extraAccountsFromAddons(data.addons)
    : undefined;
}

/**
 * The Social0 user a Dodo subscription belongs to: the `userId` checkout put
 * in its metadata, else the account with the customer's email.
 */
async function resolveSubscriptionOwnerId(
  data: DodoSubscriptionData,
): Promise<string | null> {
  const metadataUserId =
    data.metadata && typeof data.metadata.userId === "string"
      ? data.metadata.userId
      : null;
  if (metadataUserId) {
    const byId = await db.query.user.findFirst({
      where: eq(user.id, metadataUserId),
      columns: { id: true },
    });
    if (byId) return byId.id;
  }
  if (data.customer?.email) {
    const byEmail = await db.query.user.findFirst({
      where: eq(user.email, data.customer.email),
      columns: { id: true },
    });
    if (byEmail) return byEmail.id;
  }
  return null;
}

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
      expectedCreatorId: PLAN_IDS.creator ? "(set)" : "(not set)",
      expectedAgencyId: PLAN_IDS.agency ? "(set)" : "(not set)",
      customerEmail: data.customer?.email ? "(redacted)" : undefined,
    });
    return;
  }

  const userId = await resolveSubscriptionOwnerId(data);
  if (!userId) {
    console.warn(
      "[dodo webhook] No user found for subscription (email/metadata redacted)",
    );
    return;
  }

  const incomingSubId = data.subscription_id ?? null;
  if (!incomingSubId) {
    console.warn(
      "[dodo webhook] Skipping tier update: missing subscription_id",
    );
    return;
  }
  const extraAccounts = extraAccountsFor(tier, data);

  // One subscription backs a user's plan. When a second one activates (two
  // checkout sessions both paid, e.g. Starter opened, then Growth), the
  // higher tier is kept whichever webhook lands first, and the other one is
  // cancelled and its charge refunded. Ties keep the subscription already in
  // place.
  let settings: CanonicalSettings | undefined;
  let displacedSubId: string | null;
  for (let attempt = 1; ; attempt += 1) {
    settings = await readCanonicalSettings(userId);
    const currentTier = (settings?.subscriptionTier as string | null) ?? "free";
    const canonicalSubId = settings?.subscriptionId ?? null;
    const rivalSubId =
      canonicalSubId &&
      canonicalSubId !== incomingSubId &&
      isActiveTier(currentTier as SubscriptionTier)
        ? canonicalSubId
        : null;

    if (rivalSubId && tierRank(tier) <= tierRank(currentTier)) {
      console.warn(
        "[dodo webhook] Ignoring duplicate subscription activation",
        {
          incomingSubId,
          canonicalSubId,
          incomingTier: tier,
          currentTier,
        },
      );
      await cancelAndRefundDuplicate(incomingSubId);
      return;
    }

    if (
      !(await passesPaymentGuard({
        data,
        userId,
        tier,
        currentTier,
        incomingSubId,
        // More paid Agency accounts on the same subscription is an upgrade
        // too: it needs the same proof of payment as a higher tier.
        addsExtraAccounts:
          tier === "agency" &&
          currentTier === "agency" &&
          canonicalSubId === incomingSubId &&
          extraAccounts !== undefined &&
          extraAccounts > (settings?.extraAccounts ?? 0),
      }))
    ) {
      return;
    }

    // Compare-and-set against the id read above: a subscription activating
    // at the same moment may have taken the slot since. Id and tier are
    // written together, so the re-read below judges against the real winner.
    let written: boolean;
    try {
      written = await setSubscriptionIfCanonical(userId, canonicalSubId, {
        tier,
        expiresAt: data.next_billing_date
          ? new Date(data.next_billing_date)
          : null,
        subscriptionId: incomingSubId,
        customerId: data.customer?.customer_id ?? null,
        extraAccounts,
      });
    } catch (err) {
      if (!isUniqueViolation(err, SUBSCRIPTION_ID_UNIQUE)) throw err;
      // Bound to a different user already. Retrying cannot change that, so
      // acknowledge the delivery instead of failing it forever.
      console.error(
        "[dodo webhook] Subscription already belongs to another user; not binding",
        { incomingSubId },
      );
      return;
    }
    if (written) {
      displacedSubId = rivalSubId;
      break;
    }
    if (attempt >= CANONICAL_WRITE_ATTEMPTS) {
      // Fail the delivery: Dodo retries once the competing activations settle.
      throw new Error("Canonical subscription kept changing during activation");
    }
    console.warn(
      "[dodo webhook] Canonical subscription changed during activation; re-reading",
      { incomingSubId, expectedSubId: canonicalSubId },
    );
  }

  if (displacedSubId) {
    console.warn(
      "[dodo webhook] Higher-tier subscription replaced the canonical one; cancelling the old one",
      { displacedSubId, incomingSubId, tier },
    );
    await cancelAndRefundDuplicate(displacedSubId);
  }

  // Cancel any other open Dodo subscriptions so the user is never charged
  // twice: a stuck checkout and a fresh retry that both complete, or one that
  // completes after this one.
  const customerEmail = data.customer?.email ?? "";
  if (customerEmail && apiKey) {
    cancelRivalSubscriptions({
      email: customerEmail,
      customerId: data.customer?.customer_id ?? null,
      acceptedSubId: incomingSubId,
      acceptedTier: tier,
      alreadyHandled: displacedSubId ? [displacedSubId] : [],
    }).catch((e) =>
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
 * How many times activation re-reads the canonical subscription after losing
 * the compare-and-set to a concurrent activation before failing the delivery.
 */
const CANONICAL_WRITE_ATTEMPTS = 3;

type CanonicalSettings = {
  subscriptionTier: string | null;
  subscriptionId: string | null;
  pendingPlanTier: string | null;
  extraAccounts: number;
};

async function readCanonicalSettings(
  userId: string,
): Promise<CanonicalSettings | undefined> {
  return db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: {
      subscriptionTier: true,
      subscriptionId: true,
      pendingPlanTier: true,
      extraAccounts: true,
    },
  });
}

/**
 * CRITICAL MONEY GUARD: never unlock a higher tier without a recent succeeded
 * payment, and never grant a second ₹0 trial.
 */
async function passesPaymentGuard(args: {
  data: DodoSubscriptionData;
  userId: string;
  tier: SubscriptionTier;
  currentTier: string;
  incomingSubId: string;
  addsExtraAccounts?: boolean;
}): Promise<boolean> {
  const { data, userId, tier, currentTier, incomingSubId } = args;
  const isUpgrade =
    tierRank(tier) > tierRank(currentTier) || args.addsExtraAccounts === true;

  if (isUpgrade) {
    if (!apiKey) {
      console.error(
        "[dodo webhook] Skipping upgrade: DODO_PAYMENTS_API_KEY missing",
      );
      return false;
    }

    const planRow = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
      columns: { subscriptionUpdatedAt: true },
    });
    const upgradePayment = await findRecentPaidUpgradePayment(
      incomingSubId,
      planRow?.subscriptionUpdatedAt ?? null,
    );
    if (!upgradePayment) {
      console.log("[dodo webhook] Skipping upgrade: no recent paid payment", {
        currentTier,
        newTier: tier,
        subscriptionId: incomingSubId,
      });
      return false;
    }

    console.log("[dodo webhook] Upgrade verified by recent paid payment", {
      paymentId: upgradePayment.payment_id ?? "(missing)",
      currentTier,
      newTier: tier,
    });
    return true;
  }

  if (currentTier === "free") {
    // First subscription: allow ₹0 trial only if trial not already claimed for this email.
    const email = data.customer?.email ?? "";
    if (email) {
      const trialClaimed = await hasTrialBeenClaimed(email, userId);
      if (trialClaimed && apiKey) {
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
          return false;
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
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Cancel a subscription that lost to the user's canonical one, then refund the
 * charge it took. Cancelling alone stops renewals but keeps that first payment,
 * so a customer who paid two checkouts would pay for both and keep one plan.
 * Never throws: the plan the webhook accepted stands either way.
 */
async function cancelAndRefundDuplicate(subscriptionId: string): Promise<void> {
  try {
    const cancelled = await forceCancelDodoSubscription(subscriptionId);
    if (!cancelled.ok) {
      console.error(
        "[dodo webhook] Failed to cancel duplicate subscription; not refunding it",
        { subscriptionId, message: cancelled.message },
      );
      return;
    }
    const refund = await refundLatestSubscriptionCharge(
      subscriptionId,
      "Duplicate subscription: the customer already has an active Social0 plan",
    );
    if (refund.refunded) {
      console.log("[dodo webhook] Refunded duplicate subscription charge", {
        subscriptionId,
        paymentId: refund.paymentId,
        refundId: refund.refundId,
      });
    } else if (refund.reason === "failed") {
      console.error(
        "[dodo webhook] Refund of duplicate subscription charge failed",
        {
          subscriptionId,
          paymentId: refund.paymentId,
          message: refund.message,
        },
      );
    } else {
      console.log("[dodo webhook] No duplicate subscription charge to refund", {
        subscriptionId,
        reason: refund.reason,
      });
    }
  } catch (e) {
    console.error("[dodo webhook] Failed to cancel duplicate subscription:", e);
  }
}

/**
 * After accepting a subscription, cancel (and refund) any *other* open Dodo
 * subscriptions for the same customer/email. Prevents double-charging when two
 * checkout sessions (e.g. a stuck one and a fresh retry) both complete.
 *
 * An active rival on a higher tier is left alone: it outranks the accepted one,
 * and its own activation replaces this plan and cancels this subscription.
 */
async function cancelRivalSubscriptions(args: {
  email: string;
  customerId: string | null;
  acceptedSubId: string;
  acceptedTier: SubscriptionTier;
  alreadyHandled: string[];
}): Promise<void> {
  const { email, customerId, acceptedSubId, acceptedTier, alreadyHandled } =
    args;
  const openSubs = await listOpenDodoSubscriptions(email, customerId);
  for (const rival of openSubs) {
    if (rival.subscriptionId === acceptedSubId) continue;
    if (alreadyHandled.includes(rival.subscriptionId)) continue;
    const rivalTier = getTierFromProductId(rival.productId);
    if (
      rival.status === "active" &&
      tierRank(rivalTier) > tierRank(acceptedTier)
    ) {
      console.log("[dodo webhook] Leaving higher-tier rival subscription", {
        rivalSubId: rival.subscriptionId,
        rivalTier,
        acceptedSubId,
        acceptedTier,
      });
      continue;
    }
    console.log("[dodo webhook] Cancelling rival subscription", {
      rivalSubId: rival.subscriptionId,
      rivalStatus: rival.status,
      acceptedSubId,
    });
    await cancelAndRefundDuplicate(rival.subscriptionId);
  }
}

async function handleSubscriptionOnHold(payload: {
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
  if (!userId && incomingSubId) {
    // Not the stored subscription: find the owner the way activation does
    // (checkout metadata, then email).
    const ownerId = await resolveSubscriptionOwnerId(data);
    if (ownerId) {
      const settings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, ownerId),
        columns: { subscriptionId: true, subscriptionTier: true },
      });
      // Only a *live* plan backed by a different subscription makes this one
      // a rival. A null id (cleared by an earlier on_hold, or a first checkout
      // whose charge failed) or a lapsed free row is no rival: this is the
      // user's own subscription in dunning, and cancelling it would kill the
      // portal recovery evaluateCheckoutEligibility sends them to.
      if (
        settings?.subscriptionId &&
        settings.subscriptionId !== incomingSubId &&
        isActiveTier(settings.subscriptionTier as SubscriptionTier)
      ) {
        console.log(
          "[dodo webhook] Ignoring on_hold for non-canonical subscription",
          { incomingSubId, canonicalSubId: settings.subscriptionId },
        );
        await forceCancelDodoSubscription(incomingSubId);
        return;
      }
      userId = ownerId;
    }
  }
  if (!userId) return;

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
 * On subscription.renewed: settle the DB copy of a scheduled plan change.
 *
 * change-plan schedules every period-end change in Dodo
 * (effective_at=next_billing_date), and Dodo applies it at renewal; the
 * active/updated handling that follows writes the tier from the renewed
 * product. All that is left here is the DB `pendingPlanTier` banner: cleared
 * once the renewed product matches it, kept while Dodo still has that change
 * scheduled, and otherwise cleared as stale (the change was dropped in Dodo,
 * or it belonged to an earlier subscription).
 *
 * This never changes the plan in Dodo. It used to apply a mismatched pending
 * tier with `do_not_bill` + `immediately`, which moved whatever subscription
 * was canonical now to that tier for free: schedule Max on one Starter
 * subscription, let it lapse, buy Starter again, and the first renewal
 * (charged at the Starter price) handed over Max.
 */
async function handleSubscriptionRenewed(payload: {
  data: DodoSubscriptionData;
}) {
  const data = payload.data;
  const subscriptionId = data.subscription_id ?? null;
  if (!subscriptionId) return;

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.subscriptionId, subscriptionId),
    columns: { userId: true, pendingPlanTier: true },
  });
  if (!row?.pendingPlanTier) return;

  const pending = row.pendingPlanTier;
  const renewedTier = getTierFromProductId(data.product_id ?? "");
  const scheduledTier = data.scheduled_change?.product_id
    ? getTierFromProductId(data.scheduled_change.product_id)
    : null;
  if (renewedTier !== pending && scheduledTier === pending) {
    // Still ahead of us in Dodo (e.g. scheduled after this renewal ran).
    return;
  }

  await db
    .update(userSettings)
    .set({ pendingPlanTier: null, downgradeReason: null })
    .where(eq(userSettings.userId, row.userId));
  if (renewedTier === pending) {
    console.log("[dodo webhook] Pending plan change applied by Dodo", {
      pendingPlanTier: pending,
    });
  } else {
    console.warn(
      "[dodo webhook] Cleared a pending plan change Dodo no longer has scheduled",
      { pendingPlanTier: pending, renewedTier, subscriptionId },
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

  // No catch here: for an immediate upgrade this event is usually the only one
  // that can unlock the paid tier (the earlier plan_changed is skipped while
  // the proration charge is pending). A Dodo or DB error must fail the webhook
  // so handleDodoWebhook releases the claim and Dodo retries; every step below
  // is idempotent.
  const client = new DodoPayments({ bearerToken: apiKey, environment });
  const sub = await client.subscriptions.retrieve(subscriptionId);
  await handleSubscriptionActiveOrUpdated({
    data: subscriptionDataFromDodo(sub, { subscription_id: subscriptionId }),
  });
  console.log("[dodo webhook] payment.succeeded → re-synced subscription", {
    subscriptionId,
  });

  // An "Upgrade now" that went through: lift the cancellation it promised to
  // remove.
  await settleAfterUpgrade(client, subscriptionId, sub, "succeeded");
}

/**
 * A declined "Upgrade now" charge (`prevent_change` kept the old plan): put
 * back the scheduled plan change the upgrade had replaced.
 */
async function handlePaymentFailed(payload: {
  data: { subscription_id?: string | null; subscriptionId?: string | null };
}) {
  const subscriptionId =
    payload.data.subscription_id ?? payload.data.subscriptionId ?? null;
  if (!subscriptionId || !apiKey) return;
  // Most failed payments (renewals) have nothing deferred: skip the Dodo read.
  if (!(await getAfterUpgradeMarker(subscriptionId))) return;
  const client = new DodoPayments({ bearerToken: apiKey, environment });
  const sub = await client.subscriptions.retrieve(subscriptionId);
  await settleAfterUpgrade(client, subscriptionId, sub, "failed");
}

type LiveDodoSubscription = Awaited<
  ReturnType<DodoPayments["subscriptions"]["retrieve"]>
>;

/**
 * Map a subscription read from Dodo onto the webhook data shape. Customer and
 * metadata fall back to the event's copy only when Dodo returns none.
 */
function subscriptionDataFromDodo(
  sub: LiveDodoSubscription,
  fallback: DodoSubscriptionData,
): DodoSubscriptionData {
  const metadata =
    sub.metadata &&
    typeof sub.metadata === "object" &&
    Object.keys(sub.metadata).length > 0
      ? (sub.metadata as Record<string, string>)
      : fallback.metadata;
  return {
    subscription_id: sub.subscription_id ?? fallback.subscription_id,
    product_id: sub.product_id ?? undefined,
    status: sub.status ?? undefined,
    next_billing_date: sub.next_billing_date ?? null,
    previous_billing_date: sub.previous_billing_date ?? null,
    created_at: sub.created_at ?? fallback.created_at,
    customer: sub.customer
      ? {
          customer_id: sub.customer.customer_id,
          email: sub.customer.email,
        }
      : fallback.customer,
    metadata,
    scheduled_change: sub.scheduled_change
      ? { product_id: sub.scheduled_change.product_id }
      : null,
    addons: Array.isArray(sub.addons)
      ? sub.addons.map((a) => ({ addon_id: a.addon_id, quantity: a.quantity }))
      : null,
  };
}

function isDodoNotFound(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { status?: unknown }).status === 404
  );
}

/**
 * The subscription as Dodo has it now, not as it was when the event was
 * created. A failed delivery is retried with its original payload minutes or
 * hours later, after newer events have been applied: acting on that snapshot
 * let a retried on_hold drop a user who had since paid back to free, and a
 * retried updated(pro) re-grant Pro after a downgrade to Starter renewed.
 *
 * Returns null when there is nothing to act on. Any other Dodo error throws,
 * so the delivery fails and Dodo retries it.
 */
async function readLiveSubscription(
  data: DodoSubscriptionData,
): Promise<DodoSubscriptionData | null> {
  const subscriptionId = data.subscription_id;
  if (!subscriptionId) {
    console.warn("[dodo webhook] Subscription event without subscription_id");
    return null;
  }
  if (!apiKey) {
    console.error(
      "[dodo webhook] DODO_PAYMENTS_API_KEY missing: acting on the event payload, which may be stale",
    );
    return data;
  }
  const client = new DodoPayments({ bearerToken: apiKey, environment });
  try {
    const sub = await client.subscriptions.retrieve(subscriptionId);
    return subscriptionDataFromDodo(sub, data);
  } catch (e) {
    if (isDodoNotFound(e)) {
      console.warn("[dodo webhook] Subscription not found in Dodo; skipped", {
        subscriptionId,
      });
      return null;
    }
    throw e;
  }
}

/**
 * Every subscription.* event re-reads the subscription and applies its
 * current status, whichever event announced the change.
 */
async function handleSubscriptionEvent(
  eventType: string,
  eventData: DodoSubscriptionData,
): Promise<void> {
  const data = await readLiveSubscription(eventData);
  if (!data) return;

  if (eventType === "subscription.renewed") {
    await handleSubscriptionRenewed({ data });
  }
  switch (data.status) {
    case "active":
      await handleSubscriptionActiveOrUpdated({ data });
      return;
    case "on_hold":
      await handleSubscriptionOnHold({ data });
      return;
    case "cancelled":
    case "expired":
    case "failed":
      await handleSubscriptionFailedOrExpired({ data });
      return;
    default:
      console.log("[dodo webhook] No plan change for subscription status", {
        eventType,
        status: data.status ?? "(empty)",
      });
  }
}

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.active",
  "subscription.updated",
  "subscription.plan_changed",
  "subscription.renewed",
  "subscription.on_hold",
  "subscription.cancelled",
  "subscription.expired",
  "subscription.failed",
]);

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
    } else if (eventType === "payment.failed" && data) {
      await handlePaymentFailed({ data });
    } else if (SUBSCRIPTION_EVENTS.has(eventType) && data) {
      await handleSubscriptionEvent(eventType, data);
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
