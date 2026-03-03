import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Polar } from "@polar-sh/sdk";
import { PLAN_IDS } from "@/lib/plans";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
});

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
  const successUrl = `${appUrl}/dashboard/billing?success=1`;
  const returnUrl = `${appUrl}/dashboard/billing`;

  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      customerEmail: session.user.email ?? undefined,
      customerName: session.user.name ?? undefined,
      successUrl,
      returnUrl,
      metadata: { userId: session.user.id },
    });

    const url = checkout.url;
    if (!url) {
      return NextResponse.json(
        { error: "Checkout session has no URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url });
  } catch (e) {
    console.error("Polar checkout create error:", e);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 },
    );
  }
}
