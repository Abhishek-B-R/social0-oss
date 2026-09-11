import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import {
  checkoutLimiter,
  enforceRateLimit,
} from "../../lib/ratelimit.js";


export async function pauseSubscription(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Every branch below calls the Dodo API. Without a per-user cap an
  // authenticated client can burn the payment provider's quota and take
  // billing down for everyone.
  const rate = await enforceRateLimit(checkoutLimiter, session.user.id);
  if (!rate.allowed) {
    return RouteResponse.json({ error: rate.error }, { status: rate.status });
  }

  const body = await request.json().catch(() => ({}));
  const months = body.months as number | undefined;
  if (months !== 1 && months !== 2 && months !== 3) {
    return RouteResponse.json({ error: "Invalid months" }, { status: 400 });
  }

  // Dodo SDK currently doesn't expose a pause endpoint; direct users to feedback/support.
  return RouteResponse.json(
    { error: "not_supported" },
    { status: 501 },
  );
}

