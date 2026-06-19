import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { refreshTwitterPremiumStatus } from "@/lib/twitter-premium";
import { twitterPremiumRefreshLimiter, enforceRateLimit } from "@/lib/ratelimit";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(
    twitterPremiumRefreshLimiter,
    session.user.id,
    { failClosedWhenUnavailable: false },
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
