import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import { checkoutLimiter, enforceRateLimit } from "../../lib/ratelimit.js";
import { syncAgencyExtraAccounts } from "../../lib/extra-accounts.js";

/**
 * POST /api/billing/extra-accounts: re-sync the Agency extra-account add-on
 * with the connected-account count now.
 *
 * Agency bills every account above the 59 included, so the quantity is never
 * picked by hand: connects and disconnects queue this same sync, and a daily
 * cron reconciles. Any `quantity` in the body is ignored. Kept as an explicit
 * "sync now" for the billing page and older clients.
 */
export async function setExtraAccounts(_request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Calls the Dodo API: same per-user budget as change-plan.
  const rate = await enforceRateLimit(checkoutLimiter, session.user.id);
  if (!rate.allowed) {
    return RouteResponse.json({ error: rate.error }, { status: rate.status });
  }

  const result = await syncAgencyExtraAccounts(session.user.id);
  switch (result.status) {
    case "changed":
      return RouteResponse.json({ success: true, pending: true, quantity: result.to });
    case "unchanged":
      return RouteResponse.json({
        success: true,
        pending: false,
        unchanged: true,
        quantity: result.quantity,
      });
    case "skipped":
      return RouteResponse.json(
        {
          error:
            result.reason === "not_agency"
              ? "Extra accounts are only billed on the Agency plan."
              : "Your subscription can't be changed right now.",
          code: result.reason,
        },
        { status: result.reason === "not_agency" ? 400 : 409 },
      );
    case "failed":
      console.error("[billing/extra-accounts] sync failed:", result.reason);
      return RouteResponse.json(
        {
          error:
            "We couldn't update your bill just now. Your accounts stay connected and we'll retry automatically.",
          code: "sync_failed",
        },
        { status: 502 },
      );
  }
}
