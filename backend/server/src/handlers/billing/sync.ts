import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import { allPlanProductIds } from "@social0/shared";
import { syncSubscriptionForUserId } from "../../lib/billing-sync.js";
import { billingSyncLimiter, enforceRateLimit } from "../../lib/ratelimit.js";

const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";

/**
 * Sync current user's subscription from Dodo Payments.
 * Updates DB so the app shows the correct plan (e.g. after payment when webhook didn't run).
 */
export async function syncBilling(_request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(billingSyncLimiter, session.user.id);
  if (!rate.allowed) {
    return RouteResponse.json({ error: rate.error }, { status: rate.status });
  }

  const productIds = allPlanProductIds();
  if (!apiKey || productIds.length === 0) {
    return RouteResponse.json(
      { ok: false, error: "Billing sync not configured" },
      { status: 503 },
    );
  }

  const result = await syncSubscriptionForUserId(session.user.id);
  if (result.ok && result.tier) {
    return RouteResponse.json({ ok: true, tier: result.tier });
  }
  return RouteResponse.json({ ok: false });
}
