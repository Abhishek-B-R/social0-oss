import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { PLAN_IDS } from "@/lib/plans";
import { env } from "@/lib/env";
import { checkoutLimiter, enforceRateLimit } from "@/lib/ratelimit";
import { evaluateCheckoutEligibility } from "@/lib/billing-guards";
import { resolveCheckoutSession } from "@/lib/pending-checkout";

const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
const environment = env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";
const client = new DodoPayments({ bearerToken: apiKey, environment });

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(checkoutLimiter, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
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

  const planTier = plan as "starter" | "growth";

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

  const userEmail = session.user.email?.trim() ?? "";
  if (!userEmail) {
    return NextResponse.json(
      { error: "Your account must have an email before subscribing." },
      { status: 400 },
    );
  }

  const eligibility = await evaluateCheckoutEligibility(
    session.user.id,
    userEmail,
  );
  if (!eligibility.allowed) {
    return NextResponse.json(
      { error: eligibility.error, code: eligibility.code },
      { status: eligibility.status },
    );
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const returnUrl =
    successUrl && successUrl.startsWith("/")
      ? `${appUrl}${successUrl}`
      : `${appUrl}/dashboard/billing?success=1`;

  try {
    const resolved = await resolveCheckoutSession({
      userId: session.user.id,
      plan: planTier,
      trialPeriodDays: eligibility.trialPeriodDays,
      createSession: async () => {
        const sessionResponse = await client.checkoutSessions.create({
          product_cart: [{ product_id: productId, quantity: 1 }],
          customer: {
            email: userEmail,
            name: session.user.name ?? undefined,
          },
          return_url: returnUrl,
          metadata: { userId: session.user.id },
          subscription_data: {
            trial_period_days: eligibility.trialPeriodDays,
          },
          feature_flags: {
            always_create_new_customer: false,
          },
        });

        const url = sessionResponse.checkout_url ?? null;
        const sessionId = sessionResponse.session_id ?? null;
        if (!url || !sessionId) {
          throw new Error("Checkout session has no URL.");
        }
        return { sessionId, url };
      },
    });

    if (!resolved.ok) {
      return NextResponse.json(
        {
          error: resolved.error,
          code: resolved.code,
          ...(resolved.url ? { url: resolved.url } : {}),
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      url: resolved.url,
      reused: resolved.reused,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    console.error("Dodo checkout create error:", msg);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 },
    );
  }
}
