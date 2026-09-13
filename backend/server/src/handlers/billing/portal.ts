import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import { checkoutLimiter, enforceRateLimit } from "../../lib/ratelimit.js";
import {
  createCustomerPortalUrl,
  resolveBillingCustomer,
} from "../../lib/billing-guards.js";
import { env } from "../../lib/env.js";

const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";

/**
 * Resolve the current user's Dodo customer portal link, or the error response
 * that explains why there isn't one.
 *
 * Both entry points below ran this identically and differed only in what they
 * do with the link — which matters, because every branch of it calls the Dodo
 * API and the per-user rate limit in the middle is what stops an authenticated
 * client from burning the payment provider's quota and taking billing down for
 * everyone. One copy of that guard, not two.
 */
async function resolvePortalLink(): Promise<
  { ok: true; url: string } | { ok: false; response: RouteResponse }
> {
  const fail = (error: string, status: number) => ({
    ok: false as const,
    response: RouteResponse.json({ error }, { status }),
  });

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return fail("Unauthorized", 401);

  const rate = await enforceRateLimit(checkoutLimiter, session.user.id);
  if (!rate.allowed) return fail(rate.error, rate.status);

  if (!apiKey) return fail("Billing is not configured", 503);

  const userEmail = session.user.email?.trim() ?? "";
  if (!userEmail) {
    return fail("Your account must have an email to open billing.", 400);
  }

  const { customerId } = await resolveBillingCustomer(
    session.user.id,
    userEmail,
  );
  if (!customerId) {
    return fail("No subscription found. Subscribe to a plan first.", 404);
  }

  const link = await createCustomerPortalUrl(customerId);
  if (!link) return fail("Could not open customer portal", 502);

  return { ok: true, url: link };
}

/**
 * Redirects the current user to their Dodo Payments customer portal
 * for plan changes, cancellation, payment method, invoices.
 */
export async function getBillingPortal() {
  const result = await resolvePortalLink();
  return result.ok ? RouteResponse.redirect(result.url) : result.response;
}

/** Same portal, handed back as JSON for the dashboard to open itself. */
export async function openBillingPortal() {
  const result = await resolvePortalLink();
  return result.ok
    ? RouteResponse.json({ url: result.url })
    : result.response;
}
