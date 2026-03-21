import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { PLAN_IDS } from "@/lib/plans";
import { env } from "@/lib/env";

const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
const environment = env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const plan = body.plan as string | undefined;
  const successUrl = typeof body.successUrl === "string" ? body.successUrl.trim() : null;
  // Pro tier commented out for now — add back later
  if (!plan || (plan !== "starter" && plan !== "growth" /* && plan !== "pro" */)) {
    return NextResponse.json(
      { error: "Invalid plan. Use 'starter' or 'growth'." },
      { status: 400 },
    );
  }

  const productId =
    plan === "starter"
      ? PLAN_IDS.starter
      : plan === "growth"
        ? PLAN_IDS.growth
        : PLAN_IDS.pro; // unreachable while pro is commented out above
  if (!productId) {
    return NextResponse.json(
      { error: "Billing is not configured for this plan." },
      { status: 503 },
    );
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const returnUrl =
    successUrl && successUrl.startsWith("/")
      ? `${appUrl}${successUrl}`
      : `${appUrl}/dashboard/billing?success=1`;

  try {
    const sessionResponse = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: session.user.email ?? undefined,
        name: session.user.name ?? undefined,
      },
      return_url: returnUrl,
      metadata: session.user.id ? { userId: session.user.id } : undefined,
    });

    const url = sessionResponse.checkout_url ?? null;
    if (!url) {
      return NextResponse.json(
        { error: "Checkout session has no URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    console.error("Dodo checkout create error:", msg);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 },
    );
  }
}
