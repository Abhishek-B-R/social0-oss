import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import DodoPayments from "dodopayments";
import {
  getProductId,
  parseBillingInterval,
  parsePaidPlanTier,
  sanitizeReturnToPath,
} from "@social0/shared";
import { resolveAppUrlFromRequest } from "../../lib/app-url.js";
import { env } from "../../lib/env.js";
import { checkoutLimiter, enforceRateLimit } from "../../lib/ratelimit.js";
import {
  createCustomerPortalUrl,
  evaluateCheckoutEligibility,
  resolveBillingCustomer,
} from "../../lib/billing-guards.js";
import {
  clearPendingCheckout,
  resolveCheckoutSession,
} from "../../lib/pending-checkout.js";

const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
const environment = env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

const ATTRIBUTION_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * DataBull visitor/session ids for revenue attribution. The SPA forwards them
 * in the body (the API is on another subdomain and never gets DataBull's
 * host-only cookies in prod); the cookie fallback covers same-origin dev.
 */
function databullMetadata(
  body: Record<string, unknown>,
  request: Request,
): Record<string, string> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = (name: string) =>
    cookieHeader.match(new RegExp("(?:^|; )" + name + "=([^;]+)"))?.[1];
  const pick = (value: unknown, cookieName: string) => {
    const raw = typeof value === "string" ? value.trim() : cookie(cookieName);
    return raw && ATTRIBUTION_ID.test(raw) ? raw : undefined;
  };
  const visitorId = pick(body.databullVisitorId, "datacheap_visitor_id");
  const sessionId = pick(body.databullSessionId, "datacheap_session_id");
  return {
    ...(visitorId ? { databull_visitor_id: visitorId } : {}),
    ...(sessionId ? { databull_session_id: sessionId } : {}),
  };
}

export async function createCheckout(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(checkoutLimiter, session.user.id);
  if (!rate.allowed) {
    return RouteResponse.json({ error: rate.error }, { status: rate.status });
  }

  const body = await request.json().catch(() => ({}));
  const planTier = parsePaidPlanTier(body.plan);
  const interval = parseBillingInterval(body.interval);
  const forceNewSession = body.forceNewSession === true;
  const successUrl =
    typeof body.successUrl === "string" ? body.successUrl.trim() : null;
  if (!planTier) {
    return RouteResponse.json(
      { error: "Invalid plan. Use 'starter', 'growth', 'pro', or 'max'." },
      { status: 400 },
    );
  }

  const productId = getProductId(planTier, interval);
  if (!productId) {
    return RouteResponse.json(
      { error: "Billing is not configured for this plan." },
      { status: 503 },
    );
  }

  const userEmail = session.user.email?.trim() ?? "";
  if (!userEmail) {
    return RouteResponse.json(
      { error: "Your account must have an email before subscribing." },
      { status: 400 },
    );
  }

  const eligibility = await evaluateCheckoutEligibility(
    session.user.id,
    userEmail,
  );
  if (!eligibility.allowed) {
    if (eligibility.code === "use_portal") {
      const { customerId } = await resolveBillingCustomer(
        session.user.id,
        userEmail,
      );
      if (customerId) {
        const portalUrl = await createCustomerPortalUrl(customerId);
        if (portalUrl) {
          return RouteResponse.json(
            {
              error: eligibility.error,
              code: eligibility.code,
              url: portalUrl,
            },
            { status: 409 },
          );
        }
      }
    }
    return RouteResponse.json(
      { error: eligibility.error, code: eligibility.code },
      { status: eligibility.status },
    );
  }

  const appUrl = resolveAppUrlFromRequest(request);
  const safeSuccessPath = successUrl ? sanitizeReturnToPath(successUrl) : null;
  const returnUrl = safeSuccessPath
    ? `${appUrl}${safeSuccessPath}`
    : `${appUrl}/dashboard/billing?success=1`;

  try {
    if (forceNewSession) {
      await clearPendingCheckout(session.user.id);
    }

    const resolved = await resolveCheckoutSession({
      userId: session.user.id,
      plan: planTier,
      interval,
      trialPeriodDays: eligibility.trialPeriodDays,
      createSession: async () => {
        const sessionResponse = await client.checkoutSessions.create({
          product_cart: [{ product_id: productId, quantity: 1 }],
          customer: {
            email: userEmail,
            name: session.user.name ?? undefined,
          },
          return_url: returnUrl,
          metadata: {
            userId: session.user.id,
            ...databullMetadata(body, request),
          },
          subscription_data: {
            trial_period_days: eligibility.trialPeriodDays,
          },
          feature_flags: {
            always_create_new_customer: false,
          },
        });

        const url = sessionResponse.checkout_url ?? null;
        const sessionId = sessionResponse.session_id ?? null;
        if (!url || !sessionId) {
          throw new Error("Checkout session has no URL.");
        }
        return { sessionId, url };
      },
    });

    if (!resolved.ok) {
      return RouteResponse.json(
        {
          error: resolved.error,
          code: resolved.code,
        },
        { status: 409 },
      );
    }

    return RouteResponse.json({
      url: resolved.url,
      reused: resolved.reused,
      fresh: forceNewSession && !resolved.reused,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    console.error("Dodo checkout create error:", msg);
    return RouteResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 },
    );
  }
}
