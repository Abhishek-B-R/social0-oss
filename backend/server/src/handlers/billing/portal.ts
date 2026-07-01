import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import {
  createCustomerPortalUrl,
  resolveBillingCustomer,
} from "../../lib/billing-guards.js";
import { env } from "../../lib/env.js";


const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";

/**
 * Redirects the current user to their Dodo Payments customer portal
 * for plan changes, cancellation, payment method, invoices.
 */
export async function getBillingPortal() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!apiKey) {
    return RouteResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const userEmail = session.user.email?.trim() ?? "";
  if (!userEmail) {
    return RouteResponse.json(
      { error: "Your account must have an email to open billing." },
      { status: 400 },
    );
  }

  const { customerId } = await resolveBillingCustomer(session.user.id, userEmail);
  if (!customerId) {
    return RouteResponse.json(
      { error: "No subscription found. Subscribe to a plan first." },
      { status: 404 },
    );
  }

  const link = await createCustomerPortalUrl(customerId);
  if (!link) {
    return RouteResponse.json(
      { error: "Could not open customer portal" },
      { status: 502 },
    );
  }
  return RouteResponse.redirect(link);
}

export async function openBillingPortal() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!apiKey) {
    return RouteResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const userEmail = session.user.email?.trim() ?? "";
  if (!userEmail) {
    return RouteResponse.json(
      { error: "Your account must have an email to open billing." },
      { status: 400 },
    );
  }

  const { customerId } = await resolveBillingCustomer(session.user.id, userEmail);
  if (!customerId) {
    return RouteResponse.json(
      { error: "No subscription found. Subscribe to a plan first." },
      { status: 404 },
    );
  }

  const link = await createCustomerPortalUrl(customerId);
  if (!link) {
    return RouteResponse.json(
      { error: "Could not open customer portal" },
      { status: 502 },
    );
  }

  return RouteResponse.json({ url: link });
}
