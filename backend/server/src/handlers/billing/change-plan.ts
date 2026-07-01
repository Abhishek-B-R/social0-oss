/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import DodoPayments from "dodopayments";
import { db } from "../../db/index.js";
import { userSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { PLAN_IDS } from "../../lib/plans.js";
import { env } from "../../lib/env.js";
import { listOpenDodoSubscriptions } from "../../lib/billing-guards.js";


const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
const environment = env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

/**
 * Change plan (upgrade or schedule downgrade). Upgrade: charge difference now, optionally redirect to checkout.
 * Downgrade: schedule at period end, store pending_plan in DB.
 */
export async function changePlan(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const scheduleAtPeriodEnd = Boolean(body.scheduleAtPeriodEnd);
  const plan =
    body.plan === "starter" || body.plan === "growth" ? body.plan : null;
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 5000) : "";
  if (!plan) {
    return RouteResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const productId =
    plan === "starter"
      ? PLAN_IDS.starter
      : plan === "growth"
        ? PLAN_IDS.growth
        : "";
  if (!productId) {
    return RouteResponse.json({ error: "Plan not configured" }, { status: 503 });
  }

  const planTier = plan;

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
  if (!scheduleAtPeriodEnd && currentTier === plan) {
    const planLabel = plan === "growth" ? "Growth" : "Starter";
    return RouteResponse.json(
      { error: `Already on ${planLabel} plan` },
      { status: 400 },
    );
  }

  try {
    if (scheduleAtPeriodEnd) {
      // Don't call Dodo changePlan - defer downgrade until renewal. Store pending
      // locally; webhook handler will call changePlan on subscription.renewed.
      // Replace cancel with downgrade: clear cancel flag so only one intent applies.
      if (reason.length > 0) {
        await db
          .update(userSettings)
          .set({ downgradeReason: reason })
          .where(eq(userSettings.userId, session.user.id));
      }
      await db
        .update(userSettings)
        .set({
          pendingPlanTier: planTier,
          subscriptionCancelAtPeriodEnd: false,
        })
        .where(eq(userSettings.userId, session.user.id));
      return RouteResponse.json({ success: true, scheduled: true });
    }

    // Immediate upgrade: verify subscription is still active in Dodo before changing.
    // IMPORTANT: Trial → upgrade must go through checkout so a payment is actually collected.
    let subscription: {
      status?: string;
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
    if (status !== "active" && status !== "on_hold") {
      return RouteResponse.json(
        { error: "no_active_subscription" },
        { status: 404 },
      );
    }

    // Trial users (no previous_billing_date) must upgrade via checkout, not changePlan,
    // otherwise they'd get premium without a confirmed payment.
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

    // Update the same subscription in-place (no new subscription created). Only one active subscription exists.
    const dodoResponse = await client.subscriptions.changePlan(
      row.subscriptionId,
      {
        product_id: productId,
        quantity: 1,
        proration_billing_mode: "prorated_immediately",
      },
    );

    // Only log in non-production to avoid leaking billing data
    if (
      process.env.BILLING_DEBUG === "1" &&
      process.env.NODE_ENV !== "production"
    ) {
      console.log(
        "[billing/change-plan] UPGRADE RESPONSE:",
        JSON.stringify(dodoResponse, null, 2),
      );
    }

    // Dodo may not return proration details from changePlan. Pull the latest payment
    // so the client can show what was actually charged and use its created_at for renewedAt.
    let latestPayment: {
      paymentId: string;
      status?: string;
      totalAmount?: number;
      currency?: string;
      invoiceUrl?: string;
    } | null = null;
    let renewedAt: string | null = null;
    try {
      const list = await (client.payments as any).list({
        subscription_id: row.subscriptionId,
        limit: 1,
      });
      const item = Array.isArray((list as any)?.items)
        ? (list as any).items[0]
        : null;
      if (item && typeof item === "object") {
        latestPayment = {
          paymentId: String((item as any).payment_id ?? ""),
          status:
            typeof (item as any).status === "string"
              ? (item as any).status
              : undefined,
          totalAmount:
            typeof (item as any).total_amount === "number"
              ? (item as any).total_amount
              : undefined,
          currency:
            typeof (item as any).currency === "string"
              ? (item as any).currency
              : undefined,
          invoiceUrl:
            typeof (item as any).invoice_url === "string"
              ? (item as any).invoice_url
              : undefined,
        };
        const createdAt = (item as { created_at?: string }).created_at;
        renewedAt =
          typeof createdAt === "string" ? createdAt : new Date().toISOString();
      } else {
        renewedAt = new Date().toISOString();
      }
    } catch {
      renewedAt = new Date().toISOString();
    }

    const rawUnknown = dodoResponse as unknown;
    const raw =
      rawUnknown && typeof rawUnknown === "object"
        ? (rawUnknown as Record<string, unknown>)
        : {};
    const checkoutUrl =
      typeof raw?.payment_link === "string"
        ? raw.payment_link
        : typeof raw?.checkout_url === "string"
          ? raw.checkout_url
          : typeof raw?.redirect_url === "string"
            ? raw.redirect_url
            : typeof raw?.url === "string"
              ? raw.url
              : null;

    return RouteResponse.json({
      success: true,
      pending: true,
      ...(checkoutUrl ? { checkoutUrl } : {}),
      ...(latestPayment ? { latestPayment } : {}),
      ...(renewedAt ? { renewedAt } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to change plan";
    const lowerMsg = String(msg).toLowerCase();
    const is409 =
      String(msg).includes("409") ||
      lowerMsg.includes("previous payment is not successful");
    const isDecline =
      lowerMsg.includes("generic_decline") ||
      lowerMsg.includes("payment_declined") ||
      lowerMsg.includes("declined");
    if (is409) {
      return RouteResponse.json(
        {
          error:
            "Previous payment is not complete. Please wait a moment and try again.",
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
