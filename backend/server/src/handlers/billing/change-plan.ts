import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import {
  checkoutLimiter,
  enforceRateLimit,
} from "../../lib/ratelimit.js";
import DodoPayments from "dodopayments";
import { db } from "../../db/index.js";
import { userSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import {
  getExtraAccountAddonId,
  getProductId,
  isSellableTier,
  parseBillingInterval,
  parsePaidPlanTier,
  planDisplayName,
  tierRank,
  type PaidPlanTier,
} from "@social0/shared";
import {
  agencyExtraAccountsForUser,
  extraAccountAddons,
} from "../../lib/extra-accounts.js";
import { env } from "../../lib/env.js";
import {
  listOpenDodoSubscriptions,
} from "../../lib/billing-guards.js";
import { forceCancelDodoSubscription } from "../../lib/billing-zombie-utils.js";
import {
  clearAfterUpgradeMarker,
  rescheduleDroppedChange,
  saveAfterUpgradeMarker,
} from "../../lib/billing-after-upgrade.js";

const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
const environment = env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

function planLabel(plan: PaidPlanTier): string {
  return planDisplayName(plan);
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
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Every branch below calls the Dodo API. Without a per-user cap an
  // authenticated client can burn the payment provider's quota and take
  // billing down for everyone.
  const rate = await enforceRateLimit(checkoutLimiter, session.user.id);
  if (!rate.allowed) {
    return RouteResponse.json({ error: rate.error }, { status: rate.status });
  }

  const body = await request.json().catch(() => ({}));
  const scheduleAtPeriodEnd = Boolean(body.scheduleAtPeriodEnd);
  const interval = parseBillingInterval(body.interval);
  const plan = parsePaidPlanTier(body.plan);
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 5000) : "";
  if (!plan) {
    return RouteResponse.json({ error: "Invalid plan" }, { status: 400 });
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
      extraAccounts: true,
    },
  });

  const currentTier = (row?.subscriptionTier as string) ?? "free";
  // Old plans are closed to new customers; someone already on one may still
  // switch its billing interval.
  if (!isSellableTier(plan) && plan !== currentTier) {
    return RouteResponse.json(
      {
        error: "This plan is no longer offered. Choose Creator or Agency.",
        code: "plan_not_offered",
      },
      { status: 400 },
    );
  }

  // Agency bills the connected accounts above the 59 included; the client
  // never picks the number.
  const extraAccounts =
    plan === "agency" ? await agencyExtraAccountsForUser(session.user.id) : 0;

  const productId = getProductId(plan, interval);
  if (!productId) {
    return RouteResponse.json({ error: "Plan not configured" }, { status: 503 });
  }
  if (extraAccounts > 0 && !getExtraAccountAddonId(interval)) {
    return RouteResponse.json(
      { error: "Billing is not configured for extra accounts." },
      { status: 503 },
    );
  }
  // Dodo replaces the add-on list on every plan change (empty removes them):
  // Agency carries its extra accounts, any other plan carries none.
  const addons = extraAccountAddons(plan, extraAccounts, interval);

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

  const isUpgrade = tierRank(plan) > tierRank(currentTier);
  const isDowngrade = tierRank(plan) < tierRank(currentTier);

  if (!scheduleAtPeriodEnd && isDowngrade) {
    return RouteResponse.json(
      { error: "Use scheduleAtPeriodEnd to downgrade" },
      { status: 400 },
    );
  }

  try {
    // Drop duplicate/on-hold Dodo subs before changing plan (e.g. stuck Pro
    // from a previous failed upgrade attempt).
    if (userEmail) {
      const openSubs = await listOpenDodoSubscriptions(
        userEmail,
        row.customerId,
      );
      for (const sub of openSubs) {
        if (sub.subscriptionId === row.subscriptionId) continue;
        await forceCancelDodoSubscription(sub.subscriptionId).catch((e) =>
          console.warn("[billing/change-plan] cancel rival sub:", e),
        );
      }
    }

    let subscription: {
      status?: string;
      product_id?: string | null;
      previous_billing_date?: string | null;
      cancel_at_next_billing_date?: boolean;
      scheduled_change?: {
        product_id: string;
        quantity: number;
        addons?: { addon_id: string; quantity: number }[];
      } | null;
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
            "Your subscription payment failed. Cancel the pending upgrade from billing, then try again.",
          code: "cancel_pending",
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
        plan === "agency"
          ? {
              error:
                "Already on the Agency plan. Change extra accounts from billing instead.",
              code: "use_extra_accounts",
            }
          : { error: `Already on ${planLabel(plan)} plan` },
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
        addons,
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

    // Upgrading (or switching interval) means staying, so a pending
    // cancellation is lifted and a scheduled change is superseded. The charge
    // settles asynchronously and `prevent_change` rolls the plan back if it
    // fails, so the cancellation is only lifted once the charge succeeds and
    // the scheduled change (which Dodo needs out of the way now) is put back if
    // it fails: the payment webhook runs that from this marker
    // (lib/billing-after-upgrade.ts). Without the marker neither could be
    // undone, so it is written before anything changes in Dodo.
    const undoCancel = Boolean(
      row.subscriptionCancelAtPeriodEnd ||
        subscription?.cancel_at_next_billing_date,
    );
    const scheduled = subscription?.scheduled_change ?? null;
    const droppedChange = scheduled
      ? {
          productId: scheduled.product_id,
          quantity: scheduled.quantity,
          ...(scheduled.addons?.length ? { addons: scheduled.addons } : {}),
        }
      : null;
    const deferred = undoCancel || droppedChange !== null;
    if (deferred) {
      try {
        await saveAfterUpgradeMarker(row.subscriptionId, {
          userId: session.user.id,
          targetProductId: productId,
          undoCancel,
          scheduledChange: droppedChange,
          createdAt: Date.now(),
        });
      } catch (e) {
        console.error("[billing/change-plan] save after-upgrade marker:", e);
        return RouteResponse.json(
          { error: "Billing is temporarily unavailable. Please try again." },
          { status: 503 },
        );
      }
    }

    await clearScheduledPlanChange(row.subscriptionId);
    if (!droppedChange) {
      // Nothing in Dodo to put back: the DB copy (if any) is stale either way.
      await db
        .update(userSettings)
        .set({ pendingPlanTier: null, downgradeReason: null })
        .where(eq(userSettings.userId, session.user.id));
    }

    try {
      await client.subscriptions.changePlan(row.subscriptionId, {
        product_id: productId,
        quantity: 1,
        addons,
        proration_billing_mode: "prorated_immediately",
        effective_at: "immediately",
        on_payment_failure: "prevent_change",
      });
    } catch (e) {
      // Rejected outright (decline, conflict): nothing will settle, so put the
      // scheduled change back now and drop the deferred work.
      if (droppedChange) {
        await rescheduleDroppedChange(client, row.subscriptionId, droppedChange).catch(
          (err) =>
            console.error("[billing/change-plan] restore scheduled change:", err),
        );
      }
      if (deferred) {
        await clearAfterUpgradeMarker(row.subscriptionId).catch((err) =>
          console.warn("[billing/change-plan] clear after-upgrade marker:", err),
        );
      }
      throw e;
    }

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
