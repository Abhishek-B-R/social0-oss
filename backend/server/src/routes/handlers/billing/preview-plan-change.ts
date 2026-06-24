import { auth } from "../../../lib/auth.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { db } from "../../../db/index.js";
import { userSettings } from "../../../db/schema.js";
import { eq } from "drizzle-orm";
import { PLAN_IDS } from "../../../lib/plans.js";

export const dynamic = "force-dynamic";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";

/**
 * Preview plan change (e.g. Starter → Growth). Returns immediate charge and new plan.
 * Returns 404 if user has no active subscription (e.g. free plan → use checkout instead).
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const plan =
    body.plan === "starter" || body.plan === "growth" ? body.plan : null;
  if (!plan) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const productId =
    plan === "starter" ? PLAN_IDS.starter : plan === "growth" ? PLAN_IDS.growth : "";
  if (!productId) {
    return NextResponse.json({ error: "Plan not configured" }, { status: 503 });
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

  const client = new DodoPayments({ bearerToken: apiKey, environment });

  try {
    const preview = await client.subscriptions.previewChangePlan(
      row.subscriptionId,
      {
        product_id: productId,
        quantity: 1,
        proration_billing_mode: "prorated_immediately",
      },
    );

    return NextResponse.json({
      immediateCharge: preview.immediate_charge,
      newPlan: preview.new_plan,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Preview failed";
    console.error("[billing/preview-plan-change] Dodo error:", msg);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 502 },
    );
  }
}
