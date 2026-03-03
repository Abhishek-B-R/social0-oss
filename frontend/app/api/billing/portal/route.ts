import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Polar } from "@polar-sh/sdk";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Redirects the current user to their Polar customer portal.
 * Use this for plan changes (upgrade/downgrade), cancellation, payment method, invoices.
 * Polar handles proration when upgrading (e.g. Starter → Growth).
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const polar = new Polar({ accessToken: token });

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { polarCustomerId: true },
  });

  if (!row?.polarCustomerId) {
    return NextResponse.json(
      { error: "No subscription found. Subscribe to a plan first." },
      { status: 404 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000";
  const returnUrl = `${appUrl}/dashboard/billing`;

  const portalSession = await polar.customerSessions.create({
    customerId: row.polarCustomerId,
    returnUrl,
  });

  if (!portalSession.customerPortalUrl) {
    return NextResponse.json(
      { error: "Could not open customer portal" },
      { status: 502 },
    );
  }

  return NextResponse.redirect(portalSession.customerPortalUrl);
}
