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
} from "@social0/shared";
import {
  agencyExtraAccountsForUser,
  extraAccountAddons,
} from "../../lib/extra-accounts.js";


const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";

/**
 * Preview plan change (e.g. Creator → Agency, optionally with extra accounts). Returns immediate charge and new plan.
 * Returns 404 if user has no active subscription (e.g. free plan → use checkout instead).
 */
export async function previewPlanChange(request: Request) {
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
  const interval = parseBillingInterval(body.interval);
  const plan = parsePaidPlanTier(body.plan);
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
    columns: { subscriptionId: true, subscriptionTier: true, extraAccounts: true },
  });

  if (!row?.subscriptionId) {
    return RouteResponse.json(
      { error: "No active subscription found" },
      { status: 404 },
    );
  }

  const currentTier = row.subscriptionTier ?? "free";
  if (!isSellableTier(plan) && plan !== currentTier) {
    return RouteResponse.json(
      {
        error: "This plan is no longer offered. Choose Creator or Agency.",
        code: "plan_not_offered",
      },
      { status: 400 },
    );
  }
  // Agency bills the connected accounts above the 59 included.
  const extras = {
    value: plan === "agency" ? await agencyExtraAccountsForUser(session.user.id) : 0,
  };

  const productId = getProductId(plan, interval);
  if (!productId) {
    return RouteResponse.json({ error: "Plan not configured" }, { status: 503 });
  }
  if (extras.value > 0 && !getExtraAccountAddonId(interval)) {
    return RouteResponse.json(
      { error: "Billing is not configured for extra accounts." },
      { status: 503 },
    );
  }

  const client = new DodoPayments({ bearerToken: apiKey, environment });

  try {
    const preview = await client.subscriptions.previewChangePlan(
      row.subscriptionId,
      {
        product_id: productId,
        quantity: 1,
        addons: extraAccountAddons(plan, extras.value, interval),
        proration_billing_mode: "prorated_immediately",
      },
    );

    return RouteResponse.json({
      immediateCharge: preview.immediate_charge,
      newPlan: preview.new_plan,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Preview failed";
    console.error("[billing/preview-plan-change] Dodo error:", msg);
    return RouteResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 502 },
    );
  }
}
