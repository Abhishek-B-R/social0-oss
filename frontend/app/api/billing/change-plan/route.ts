import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PLAN_IDS } from "@/lib/plans";

export const dynamic = "force-dynamic";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

/**
 * Change plan for an existing subscription (upgrade or downgrade).
 * Uses difference_immediately: user pays/gets credited the price difference.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const plan = body.plan as string | undefined;
  if (plan !== "starter" && plan !== "growth" && plan !== "pro") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const productId =
    plan === "starter"
      ? PLAN_IDS.starter
      : plan === "growth"
        ? PLAN_IDS.growth
        : PLAN_IDS.pro;
  if (!productId) {
    return NextResponse.json(
      { error: "Product not configured" },
      { status: 503 },
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { subscriptionId: true },
  });

  if (!row?.subscriptionId) {
    return NextResponse.json(
      { error: "No active subscription found" },
      { status: 404 },
    );
  }

  try {
    // Verify subscription is active before calling changePlan (DB may have stale cancelled ID)
    const subscription = await client.subscriptions.retrieve(row.subscriptionId);
    const status = subscription.status ?? "";
    if (status !== "active") {
      return NextResponse.json(
        { error: "no_active_subscription", plan },
        { status: 422 },
      );
    }

    await client.subscriptions.changePlan(row.subscriptionId, {
      product_id: productId,
      quantity: 1,
      proration_billing_mode: "difference_immediately",
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to change plan";
    console.error("[billing/change-plan] Dodo changePlan error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
