import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { db } from "@/db";
import { userSettings, subscriptionCancellations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { setSubscription } from "@/lib/subscription";

export const dynamic = "force-dynamic";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { subscriptionId: true },
  });

  if (!row?.subscriptionId) {
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 404 },
    );
  }

  try {
    await db.insert(subscriptionCancellations).values({
      userId: session.user.id,
      subscriptionId: row.subscriptionId,
      reason,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.toLowerCase().includes("subscription_cancellations")) throw e;
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const client = new DodoPayments({ bearerToken: apiKey, environment });

  try {
    const subscription = await client.subscriptions.retrieve(row.subscriptionId);
    const trialPeriodDays = (subscription as { trial_period_days?: number }).trial_period_days ?? 0;
    const previousBillingDate = (subscription as { previous_billing_date?: string | null }).previous_billing_date;

    const isTrialUser =
      trialPeriodDays > 0 &&
      (previousBillingDate == null || previousBillingDate === "");

    if (isTrialUser) {
      await client.subscriptions.update(row.subscriptionId, {
        status: "cancelled",
      });
      await setSubscription(session.user.id, {
        tier: "free",
        expiresAt: null,
        subscriptionId: null,
        customerId: null,
      });
      return NextResponse.json({ success: true, immediate: true });
    }

    await client.subscriptions.update(row.subscriptionId, {
      cancel_at_next_billing_date: true,
    });
    await db.execute(sql`
      UPDATE user_settings SET subscription_cancel_at_period_end = true WHERE user_id = ${session.user.id}
    `);
    return NextResponse.json({ success: true, scheduled: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cancel failed";
    console.error("[billing/cancel] Dodo cancel error:", msg);
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 502 },
    );
  }
}

