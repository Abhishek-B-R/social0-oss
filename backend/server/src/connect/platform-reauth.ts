import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { headers } from "../lib/http/request-cookies.js";
import { AppRequest, RouteResponse } from "../lib/http/http.js";
import { appUrlForPath, getConnectCallbackBaseUrl } from "../lib/app-url.js";
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

export async function platformReauth(
  req: AppRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return RouteResponse.redirect(appUrlForPath("/dashboard/connections", req));
  }

  const { requireWorkspacePermissionForUser } = await import(
    "../lib/workspace/session.js"
  );
  const ws = await requireWorkspacePermissionForUser(
    session.user.id,
    "manage_connections",
  );
  if (!ws.ok) {
    return RouteResponse.redirect(
      appUrlForPath(
        `/dashboard/connections?error=${encodeURIComponent(ws.error)}`,
        req,
      ),
    );
  }
  const resourceUserId = ws.ctx.resourceUserId;

  const rate = await enforceRateLimit(oauthLimiter, session.user.id);
  if (!rate.allowed) {
    return RouteResponse.redirect(
      appUrlForPath("/dashboard/connections?error=rate_limited", req),
    );
  }

  const { platform: platformParam } = await params;
  if (!VALID_PLATFORMS.includes(platformParam as (typeof VALID_PLATFORMS)[number])) {
    return RouteResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const accountId = req.parsedUrl.searchParams.get("accountId");
  if (!accountId) {
    return RouteResponse.json(
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
        eq(connectedAccounts.userId, resourceUserId),
      ),
    )
    .limit(1);

  if (!account) {
    return RouteResponse.json({ error: "Account not found" }, { status: 403 });
  }

  const reauthUrl = new URL(
    `/api/connect/${platformParam}`,
    getConnectCallbackBaseUrl(),
  );
  reauthUrl.searchParams.set("reauth", "1");
  reauthUrl.searchParams.set("accountId", accountId);

  return RouteResponse.redirect(reauthUrl);
}
