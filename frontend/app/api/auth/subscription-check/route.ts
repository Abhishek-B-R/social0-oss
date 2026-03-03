import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSubscriptionForUser } from "@/lib/subscription";
import { isActiveTier } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Used by proxy to gate dashboard access for users without an active subscription.
 * Returns { hasSubscription: boolean }. No subscription = must pay before using dashboard.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ hasSubscription: false });
  }
  const subscription = await getSubscriptionForUser(session.user.id);
  return NextResponse.json({
    hasSubscription: isActiveTier(subscription.tier),
  });
}
