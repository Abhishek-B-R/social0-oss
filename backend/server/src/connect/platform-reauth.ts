import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { headers } from "../lib/shim/next-headers.js";
import { NextRequest, NextResponse } from "../lib/shim/next-server.js";
import { appUrlForPath, resolveAppUrlFromRequest } from "../lib/app-url.js";
import { enforceRateLimit, oauthLimiter } from "../lib/ratelimit.js";

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
    return NextResponse.redirect(appUrlForPath("/dashboard/connections", req));
  }

  const rate = await enforceRateLimit(oauthLimiter, session.user.id, {
    failClosedWhenUnavailable: false,
  });
  if (!rate.allowed) {
    return NextResponse.redirect(
      appUrlForPath("/dashboard/connections?error=rate_limited", req),
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

  const baseUrl = resolveAppUrlFromRequest(req);
  const reauthUrl = new URL(
    `/api/connect/${platformParam}`,
    baseUrl,
  );
  reauthUrl.searchParams.set("reauth", "1");
  reauthUrl.searchParams.set("accountId", accountId);

  return NextResponse.redirect(reauthUrl);
}
