import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { normalizeAppUrl } from "@/lib/url-utils";
import { env } from "@/lib/env";
import { enforceRateLimit, oauthLimiter } from "@/lib/ratelimit";

const VALID_PLATFORMS = [
  "linkedin",
  "instagram",
  "youtube",
  "pinterest",
  "tiktok",
  "twitter_x",
  "threads",
  "facebook",
] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.redirect(
      new URL("/dashboard/connections", req.url),
    );
  }

  const rate = await enforceRateLimit(oauthLimiter, session.user.id, {
    failClosedWhenUnavailable: false,
  });
  if (!rate.allowed) {
    return NextResponse.redirect(
      new URL("/dashboard/connections?error=rate_limited", req.url),
    );
  }

  const { platform: platformParam } = await params;
  if (!VALID_PLATFORMS.includes(platformParam as (typeof VALID_PLATFORMS)[number])) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json(
      { error: "accountId required" },
      { status: 400 },
    );
  }

  const [account] = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 403 });
  }

  const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
  const reauthUrl = new URL(
    `/api/connect/${platformParam}`,
    baseUrl,
  );
  reauthUrl.searchParams.set("reauth", "1");
  reauthUrl.searchParams.set("accountId", accountId);

  return NextResponse.redirect(reauthUrl);
}
