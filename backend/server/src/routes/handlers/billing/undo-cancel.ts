import { auth } from "../../../lib/auth.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { db } from "../../../db/index.js";
import { userSettings } from "../../../db/schema.js";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { subscriptionId: true, subscriptionExpiresAt: true },
  });

  if (!row?.subscriptionId) {
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 404 },
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const client = new DodoPayments({ bearerToken: apiKey, environment });

  try {
    if (row.subscriptionExpiresAt && new Date() > new Date(row.subscriptionExpiresAt)) {
      return NextResponse.json(
        { error: "Subscription already expired" },
        { status: 409 },
      );
    }
    await client.subscriptions.update(row.subscriptionId, {
      cancel_at_next_billing_date: false,
    });
    await db.execute(sql`
      UPDATE user_settings SET subscription_cancel_at_period_end = false WHERE user_id = ${session.user.id}
    `);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Undo cancel failed";
    console.error("[billing/undo-cancel] Dodo error:", msg);
    return NextResponse.json(
      { error: "Failed to undo cancellation" },
      { status: 502 },
    );
  }
}
