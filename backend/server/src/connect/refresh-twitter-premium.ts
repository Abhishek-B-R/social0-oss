import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { headers } from "../lib/shim/next-headers.js";
import { NextResponse } from "../lib/shim/next-server.js";
import { refreshTwitterPremiumStatus } from "../lib/twitter-premium.js";
import { twitterPremiumRefreshLimiter, enforceRateLimit } from "../lib/ratelimit.js";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(
    twitterPremiumRefreshLimiter,
    session.user.id,
  );
  if (!rate.allowed) {
    return NextResponse.json(
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
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "twitter_x"),
      ),
    );

  let updated = 0;

  for (const account of accounts) {
    const result = await refreshTwitterPremiumStatus(account.id);
    if (result?.ok === false && result.freeTierBlocked) {
      return NextResponse.json(
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

  return NextResponse.json({ success: true, updated });
}
