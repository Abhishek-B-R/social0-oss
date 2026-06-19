import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getValidToken } from "@/lib/token-refresh";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { enforceRateLimit, tokenRefreshLimiter } from "@/lib/ratelimit";

const VALID_PLATFORM_IDS = new Set<string>(
  PLATFORMS.map((p) => p.id),
);
const REFRESH_SUPPORTED_PLATFORMS = new Set<string>([
  "instagram",
  "threads",
  "tiktok",
  "linkedin",
  "facebook",
  "pinterest",
  "youtube",
]);

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(tokenRefreshLimiter, session.user.id, {
    failClosedWhenUnavailable: false,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  let body: { platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = body.platform;
  if (!platform || typeof platform !== "string") {
    return NextResponse.json(
      { error: "platform required" },
      { status: 400 },
    );
  }

  if (!VALID_PLATFORM_IDS.has(platform)) {
    return NextResponse.json(
      { error: "Invalid platform" },
      { status: 400 },
    );
  }

  if (!REFRESH_SUPPORTED_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { error: "Platform does not support token refresh" },
      { status: 400 },
    );
  }

  const accounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, platform as Platform),
      ),
    );

  let refreshed = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      await getValidToken(account.id, platform);
      refreshed++;
    } catch (e) {
      console.warn(
        `[refresh-tokens] Failed for account ${account.id} (${platform}):`,
        e,
      );
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    refreshed,
    failed,
  });
}
