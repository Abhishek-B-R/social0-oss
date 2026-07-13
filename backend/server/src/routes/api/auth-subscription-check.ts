import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import { getSubscriptionForUser } from "../../lib/subscription.js";
import { isActiveTier } from "@social0/shared";


/**
 * Used by proxy to gate dashboard access for users without an active subscription.
 * Returns { hasSubscription: boolean }. No subscription = must pay before using dashboard.
 */
export async function subscriptionCheck() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return RouteResponse.json({ hasSubscription: false });
  }
  const subscription = await getSubscriptionForUser(session.user.id);
  return RouteResponse.json({
    hasSubscription: isActiveTier(subscription.tier),
  });
}
