import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { refreshTwitterPremiumStatus } from "@/lib/twitter-premium";
import { NextRequest, NextResponse } from "next/server";
import {
  enforceRateLimit,
  twitterPremiumRefreshLimiter,
} from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(
    twitterPremiumRefreshLimiter,
    session.user.id,
  );
  if (!rate.allowed) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  let body: { accountId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountId = body.accountId;
  if (!accountId || typeof accountId !== "string") {
    return NextResponse.json(
      { error: "accountId required" },
      { status: 400 },
    );
  }

  const [account] = await db
    .select({ id: connectedAccounts.id, platform: connectedAccounts.platform })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (account.platform !== "twitter_x") {
    return NextResponse.json(
      { error: "Only Twitter/X accounts support premium refresh" },
      { status: 400 },
    );
  }

  const result = await refreshTwitterPremiumStatus(accountId);

  if (result?.ok === true) {
    return NextResponse.json({ isPremium: result.premium });
  }

  if (result?.ok === false && result.freeTierBlocked) {
    return NextResponse.json(
      {
        error:
          "X Premium check requires Twitter API Basic tier or higher. Upgrade at developer.twitter.com.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    { error: "Failed to refresh premium status" },
    { status: 502 },
  );
}
