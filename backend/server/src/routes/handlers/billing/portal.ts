import { auth } from "../../../lib/auth.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  createCustomerPortalUrl,
  resolveBillingCustomer,
} from "../../../lib/billing-guards.js";
import { env } from "../../../lib/env.js";

export const dynamic = "force-dynamic";

const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";

/**
 * Redirects the current user to their Dodo Payments customer portal
 * for plan changes, cancellation, payment method, invoices.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const userEmail = session.user.email?.trim() ?? "";
  if (!userEmail) {
    return NextResponse.json(
      { error: "Your account must have an email to open billing." },
      { status: 400 },
    );
  }

  const { customerId } = await resolveBillingCustomer(session.user.id, userEmail);
  if (!customerId) {
    return NextResponse.json(
      { error: "No subscription found. Subscribe to a plan first." },
      { status: 404 },
    );
  }

  const link = await createCustomerPortalUrl(customerId);
  if (!link) {
    return NextResponse.json(
      { error: "Could not open customer portal" },
      { status: 502 },
    );
  }
  return NextResponse.redirect(link);
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const userEmail = session.user.email?.trim() ?? "";
  if (!userEmail) {
    return NextResponse.json(
      { error: "Your account must have an email to open billing." },
      { status: 400 },
    );
  }

  const { customerId } = await resolveBillingCustomer(session.user.id, userEmail);
  if (!customerId) {
    return NextResponse.json(
      { error: "No subscription found. Subscribe to a plan first." },
      { status: 404 },
    );
  }

  const link = await createCustomerPortalUrl(customerId);
  if (!link) {
    return NextResponse.json(
      { error: "Could not open customer portal" },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: link });
}
