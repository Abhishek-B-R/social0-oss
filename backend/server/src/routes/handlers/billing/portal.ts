import { auth } from "../../../lib/auth.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { db } from "../../../db/index.js";
import { userSettings } from "../../../db/schema.js";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment = (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

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

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { customerId: true },
  });

  if (!row?.customerId) {
    return NextResponse.json(
      { error: "No subscription found. Subscribe to a plan first." },
      { status: 404 },
    );
  }

  try {
    const portalSession = await client.customers.customerPortal.create(row.customerId);
    const link = portalSession.link ?? null;
    if (!link) {
      return NextResponse.json(
        { error: "Could not open customer portal" },
        { status: 502 },
      );
    }
    // Allowlist redirect: only Dodo customer portal domains (prevents open redirect)
    let allowed = false;
    try {
      const u = new URL(link);
      const host = u.hostname.toLowerCase();
      if (
        host === "customer.dodopayments.com" ||
        host === "test.customer.dodopayments.com"
      ) {
        allowed = u.protocol === "https:";
      }
    } catch {
      /* invalid URL */
    }
    if (!allowed) {
      console.error("[billing/portal] Rejected non-Dodo redirect URL");
      return NextResponse.json(
        { error: "Could not open customer portal" },
        { status: 502 },
      );
    }
    return NextResponse.redirect(link);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Portal failed";
    console.error("Dodo customer portal error:", msg);
    return NextResponse.json(
      { error: "Could not open customer portal" },
      { status: 502 },
    );
  }
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

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { customerId: true },
  });

  if (!row?.customerId) {
    return NextResponse.json(
      { error: "No subscription found. Subscribe to a plan first." },
      { status: 404 },
    );
  }

  try {
    const portalSession = await client.customers.customerPortal.create(
      row.customerId,
    );
    const link = portalSession.link ?? null;
    if (!link) {
      return NextResponse.json(
        { error: "Could not open customer portal" },
        { status: 502 },
      );
    }

    // Allowlist redirect: only Dodo customer portal domains (prevents open redirect)
    let allowed = false;
    try {
      const u = new URL(link);
      const host = u.hostname.toLowerCase();
      if (
        host === "customer.dodopayments.com" ||
        host === "test.customer.dodopayments.com"
      ) {
        allowed = u.protocol === "https:";
      }
    } catch {
      /* invalid URL */
    }
    if (!allowed) {
      console.error("[billing/portal] Rejected non-Dodo redirect URL");
      return NextResponse.json(
        { error: "Could not open customer portal" },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: link });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Portal failed";
    console.error("Dodo customer portal error:", msg);
    return NextResponse.json(
      { error: "Could not open customer portal" },
      { status: 502 },
    );
  }
}
