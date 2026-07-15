import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { headers } from "../lib/http/request-cookies.js";
import { RouteResponse } from "../lib/http/http.js";
import { refreshTwitterPremiumStatus } from "../lib/twitter-premium.js";
import { twitterPremiumRefreshLimiter, enforceRateLimit } from "../lib/ratelimit.js";

export async function refreshTwitterPremium() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requireWorkspacePermissionForUser } = await import(
    "../lib/workspace/session.js"
  );
  const ws = await requireWorkspacePermissionForUser(
    session.user.id,
    "manage_connections",
  );
  if (!ws.ok) {
    return RouteResponse.json({ error: ws.error }, { status: ws.statusCode });
  }
  const resourceUserId = ws.ctx.resourceUserId;

  const rate = await enforceRateLimit(
    twitterPremiumRefreshLimiter,
    session.user.id,
  );
  if (!rate.allowed) {
    return RouteResponse.json(
      {
        error:
          rate.status === 503
            ? "Service temporarily unavailable. Try again later."
            : "Please wait a few minutes before refreshing again.",
      },
      { status: rate.status },
    );
  }

  const accounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, resourceUserId),
        eq(connectedAccounts.platform, "twitter_x"),
      ),
    );

  let updated = 0;

  for (const account of accounts) {
    const result = await refreshTwitterPremiumStatus(account.id);
    if (result?.ok === false && result.freeTierBlocked) {
      return RouteResponse.json(
        {
          error:
            "X Premium check requires Twitter API Basic tier or higher. Upgrade at developer.twitter.com.",
        },
        { status: 403 },
      );
    }
    if (result?.ok === true) {
      updated++;
    }
  }

  return RouteResponse.json({ success: true, updated });
}
