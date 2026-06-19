import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { PLAN_IDS } from "@/lib/plans";
import { syncSubscriptionForUserId } from "@/lib/billing-sync";
import { billingSyncLimiter, enforceRateLimit } from "@/lib/ratelimit";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";

/**
 * Sync current user's subscription from Dodo Payments.
 * Updates DB so the app shows the correct plan (e.g. after payment when webhook didn't run).
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(billingSyncLimiter, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  const productIds = [PLAN_IDS.starter, PLAN_IDS.growth, PLAN_IDS.pro].filter(
    Boolean,
  );
  if (!apiKey || productIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Billing sync not configured" },
      { status: 503 },
    );
  }

  const result = await syncSubscriptionForUserId(session.user.id);
  if (result.ok && result.tier) {
    return NextResponse.json({ ok: true, tier: result.tier });
  }
  return NextResponse.json({ ok: false });
}
