/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import DodoPayments from "dodopayments";
import { db } from "../../db/index.js";
import { userSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { getProductId, parseBillingInterval } from "@social0/shared";
import { env } from "../../lib/env.js";
import {
  listOpenDodoSubscriptions,
} from "../../lib/billing-guards.js";

const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
const environment = env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

type PaidPlan = "starter" | "growth" | "pro";

function tierRank(tier: string): number {
  switch (tier) {
    case "starter":
      return 1;
    case "growth":
      return 2;
    case "pro":
      return 3;
    default:
      return 0;
  }
}

function planLabel(plan: PaidPlan): string {
  if (plan === "pro") return "Pro";
  if (plan === "growth") return "Growth";
  return "Starter";
}

/** Best-effort: drop any Dodo-scheduled plan change (404 = nothing pending). */
async function clearScheduledPlanChange(subscriptionId: string): Promise<void> {
  try {
    await client.subscriptions.cancelChangePlan(subscriptionId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) {
      console.warn("[billing/change-plan] cancelChangePlan warning:", msg);
    }
  }
}

/**
 * Change plan (upgrade now, schedule upgrade at renewal, or schedule downgrade).
 *
 * Upgrade now: prorated_immediately + prevent_change (charge saved method;
 * unlock only after payment succeeds via webhook/sync).
 * Upgrade on renewal: do_not_bill at next_billing_date (no charge today).
 * Downgrade: schedule locally for renewal (legacy) / next_billing_date in Dodo.
 */
export async function changePlan(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const scheduleAtPeriodEnd = Boolean(body.scheduleAtPeriodEnd);
  const interval = parseBillingInterval(body.interval);
  const plan: PaidPlan | null =
    body.plan === "starter" || body.plan === "growth" || body.plan === "pro"
      ? body.plan
      : null;
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 5000) : "";
  if (!plan) {
    return RouteResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const productId = getProductId(plan, interval);
  if (!productId) {
    return RouteResponse.json({ error: "Plan not configured" }, { status: 503 });
  }

  if (!apiKey) {
    return RouteResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: {
      subscriptionId: true,
      subscriptionExpiresAt: true,
      customerId: true,
      subscriptionTier: true,
      subscriptionCancelAtPeriodEnd: true,
    },
  });

  const userEmail = session.user.email?.trim() ?? "";

  if (!row?.subscriptionId) {
    if (userEmail) {
      const openSubs = await listOpenDodoSubscriptions(
        userEmail,
        row?.customerId,
      );
      if (openSubs.length > 0) {
        const hasActive = openSubs.some((s) => s.status === "active");
        return RouteResponse.json(
          {
            error: hasActive
              ? "You already have an active subscription. Manage it from billing."
              : "You have an unpaid subscription. Update your payment method in the customer portal.",
            code: hasActive ? "use_change_plan" : "use_portal",
          },
          { status: 409 },
        );
      }
    }
    return RouteResponse.json(
      { error: "no_active_subscription" },
      { status: 404 },
    );
  }

  const currentTier = (row.subscriptionTier as string) ?? "free";
  const isUpgrade = tierRank(plan) > tierRank(currentTier);
  const isDowngrade = tierRank(plan) < tierRank(currentTier);

  if (!scheduleAtPeriodEnd && isDowngrade) {
    return RouteResponse.json(
      { error: "Use scheduleAtPeriodEnd to downgrade" },
      { status: 400 },
    );
  }

  try {
    let subscription: {
      status?: string;
      product_id?: string | null;
      previous_billing_date?: string | null;
    } | null;
    try {
      subscription = await client.subscriptions.retrieve(row.subscriptionId);
    } catch {
      return RouteResponse.json(
        { error: "no_active_subscription" },
        { status: 404 },
      );
    }
    const status = subscription?.status;
    if (status === "on_hold") {
      return RouteResponse.json(
        {
          error:
            "Your subscription payment failed. Update your payment method in the customer portal.",
          code: "use_portal",
        },
        { status: 409 },
      );
    }
    if (status !== "active") {
      return RouteResponse.json(
        { error: "no_active_subscription" },
        { status: 404 },
      );
    }

    const currentProductId = subscription?.product_id ?? "";
    if (currentProductId === productId) {
      return RouteResponse.json(
        { error: `Already on ${planLabel(plan)} plan` },
        { status: 400 },
      );
    }

    const isIntervalOnlyChange =
      currentTier === plan && currentProductId !== productId;

    if (scheduleAtPeriodEnd && !isUpgrade && !isDowngrade && !isIntervalOnlyChange) {
      return RouteResponse.json({ error: "Invalid plan change" }, { status: 400 });
    }

    if (scheduleAtPeriodEnd) {
      if (row.subscriptionCancelAtPeriodEnd) {
        try {
          await client.subscriptions.update(row.subscriptionId, {
            cancel_at_next_billing_date: false,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(
            "[billing/change-plan] undo cancel before scheduled change:",
            msg,
          );
        }
      }

      await clearScheduledPlanChange(row.subscriptionId);

      await client.subscriptions.changePlan(row.subscriptionId, {
        product_id: productId,
        quantity: 1,
        proration_billing_mode: "do_not_bill",
        effective_at: "next_billing_date",
      });

      await db
        .update(userSettings)
        .set({
          pendingPlanTier: plan,
          subscriptionCancelAtPeriodEnd: false,
          ...(isDowngrade && reason.length > 0
            ? { downgradeReason: reason }
            : { downgradeReason: null }),
        })
        .where(eq(userSettings.userId, session.user.id));

      return RouteResponse.json({
        success: true,
        scheduled: true,
        direction: isUpgrade ? "upgrade" : "downgrade",
      });
    }

    // Immediate upgrade
    const previousBillingDate =
      subscription && "previous_billing_date" in subscription
        ? subscription.previous_billing_date
        : null;
    const isTrialUpgrade = !previousBillingDate;
    if (isTrialUpgrade) {
      return RouteResponse.json(
        {
          success: false,
          requireCheckout: true,
          error: "trial_upgrade_requires_checkout",
        },
        { status: 402 },
      );
    }

    await clearScheduledPlanChange(row.subscriptionId);
    await db
      .update(userSettings)
      .set({ pendingPlanTier: null, downgradeReason: null })
      .where(eq(userSettings.userId, session.user.id));

    await client.subscriptions.changePlan(row.subscriptionId, {
      product_id: productId,
      quantity: 1,
      proration_billing_mode: "prorated_immediately",
      effective_at: "immediately",
      on_payment_failure: "prevent_change",
    });

    // Do NOT update subscriptionTier here. Dodo may still show the new product
    // while the charge is "processing"; entitlements flip only after
    // payment.succeeded (newest payment must be succeeded) via webhook.
    return RouteResponse.json({
      success: true,
      applied: false,
      pending: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to change plan";
    const lowerMsg = String(msg).toLowerCase();
    const is409 =
      String(msg).includes("409") ||
      lowerMsg.includes("previous payment is not successful") ||
      lowerMsg.includes("pendingplanchangeexists");
    const isDecline =
      lowerMsg.includes("generic_decline") ||
      lowerMsg.includes("payment_declined") ||
      lowerMsg.includes("declined");
    if (is409) {
      return RouteResponse.json(
        {
          error:
            "A previous plan change is still pending. Cancel it or wait a moment and try again.",
          code: "pending_plan_change",
        },
        { status: 409 },
      );
    }
    if (isDecline) {
      return RouteResponse.json(
        {
          error:
            "Your payment could not be processed. Please check your card details or try a different payment method.",
        },
        { status: 402 },
      );
    }
    console.error("[billing/change-plan] Dodo error:", msg);
    return RouteResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
