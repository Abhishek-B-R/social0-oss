import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { PLAN_IDS } from "@/lib/plans";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment = (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const plan = body.plan as string | undefined;
  if (!plan || (plan !== "starter" && plan !== "growth")) {
    return NextResponse.json(
      { error: "Invalid plan. Use 'starter' or 'growth'." },
      { status: 400 },
    );
  }

  const productId = plan === "starter" ? PLAN_IDS.starter : PLAN_IDS.growth;
  if (!productId) {
    return NextResponse.json(
      { error: "Billing is not configured for this plan." },
      { status: 503 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000";
  const returnUrl = `${appUrl}/dashboard/billing?success=1`;

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
