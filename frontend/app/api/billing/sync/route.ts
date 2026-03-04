import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { PLAN_IDS } from "@/lib/plans";
import { syncSubscriptionForUserId } from "@/lib/billing-sync";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";

/**
 * Sync current user's subscription from Dodo Payments.
 * Updates DB so the app shows the correct plan (e.g. after payment when webhook didn't run).
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const productIds = [PLAN_IDS.starter, PLAN_IDS.growth].filter(Boolean);
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
