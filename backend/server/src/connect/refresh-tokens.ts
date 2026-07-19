import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { headers } from "../lib/http/request-cookies.js";
import { AppRequest, RouteResponse } from "../lib/http/http.js";
import { getValidToken } from "../lib/token-refresh.js";
import { PLATFORMS, type Platform } from "../lib/platforms.js";
import { enforceRateLimit, tokenRefreshLimiter } from "../lib/ratelimit.js";

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

export async function refreshTokens(req: AppRequest) {
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

  const rate = await enforceRateLimit(tokenRefreshLimiter, session.user.id);
  if (!rate.allowed) {
    return RouteResponse.json({ error: rate.error }, { status: rate.status });
  }

  let body: { platform?: string };
  try {
    body = await req.json();
  } catch {
    return RouteResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = body.platform;
  if (!platform || typeof platform !== "string") {
    return RouteResponse.json(
      { error: "platform required" },
      { status: 400 },
    );
  }

  if (!VALID_PLATFORM_IDS.has(platform)) {
    return RouteResponse.json(
      { error: "Invalid platform" },
      { status: 400 },
    );
  }

  if (!REFRESH_SUPPORTED_PLATFORMS.has(platform)) {
    return RouteResponse.json(
      { error: "Platform does not support token refresh" },
      { status: 400 },
    );
  }

  const accounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, resourceUserId),
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

  return RouteResponse.json({
    success: true,
    refreshed,
    failed,
  });
}
