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
  // Pro tier commented out for now — add back later
  if (plan !== "starter" && plan !== "growth" /* && plan !== "pro" */) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const productId =
    plan === "starter"
      ? PLAN_IDS.starter
      : plan === "growth"
        ? PLAN_IDS.growth
        : PLAN_IDS.pro; // unreachable while pro is commented out above
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

    const dodoResponse = await client.subscriptions.changePlan(
      row.subscriptionId,
      {
        product_id: productId,
        quantity: 1,
        proration_billing_mode: "difference_immediately",
      },
    );

    // Dodo may return a checkout URL when user must complete payment on their hosted page
    const raw = dodoResponse as Record<string, unknown>;
    if (process.env.NODE_ENV !== "production") {
      console.log("[billing/change-plan] Dodo changePlan response keys:", raw ? Object.keys(raw) : "null");
    }
    const checkoutUrl =
      typeof raw?.payment_link === "string"
        ? raw.payment_link
        : typeof raw?.checkout_url === "string"
          ? raw.checkout_url
          : typeof raw?.redirect_url === "string"
            ? raw.redirect_url
            : typeof raw?.url === "string"
              ? raw.url
              : null;

    if (checkoutUrl) {
      return NextResponse.json({ success: true, checkoutUrl });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to change plan";
    const body =
      error instanceof Error ? error.message : JSON.stringify(error);
    console.error("[billing/change-plan] Dodo error full:", body);
    // Log any response body if present (e.g. SDK error with response)
    const err = error as Record<string, unknown> | undefined;
    if (err && typeof err === "object" && err.response != null) {
      console.error("[billing/change-plan] Dodo error response:", err.response);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
