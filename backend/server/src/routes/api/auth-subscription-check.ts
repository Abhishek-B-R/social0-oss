import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/shim/next-headers.js";
import { NextResponse } from "../../lib/shim/next-server.js";
import { getSubscriptionForUser } from "../../lib/subscription.js";
import { isActiveTier } from "../../lib/plans.js";

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
