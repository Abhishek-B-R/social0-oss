import { getRouteSession } from "../../lib/session.js";
import { RouteResponse } from "../../lib/http/http.js";
import { getSubscriptionForUser } from "../../lib/subscription.js";
import { isActiveTier } from "@social0/shared";


/**
 * Used by proxy to gate dashboard access for users without an active subscription.
 * Returns { hasSubscription, tier, extraAccounts }. No subscription = must pay
 * before using dashboard. `extraAccounts` is the Agency add-on quantity (0 on
 * other plans), so the SPA can tell an extra-accounts change has landed.
 */
export async function subscriptionCheck() {
  const session = await getRouteSession();
  if (!session?.user) {
    return RouteResponse.json({
      hasSubscription: false,
      tier: "free",
      extraAccounts: 0,
    });
  }
  const subscription = await getSubscriptionForUser(session.user.id);
  return RouteResponse.json({
    hasSubscription: isActiveTier(subscription.tier),
    tier: subscription.tier,
    extraAccounts: subscription.extraAccounts ?? 0,
  });
}
