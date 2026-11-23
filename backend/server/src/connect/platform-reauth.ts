import { getRouteSession } from "../lib/session.js";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { AppRequest, RouteResponse } from "../lib/http/http.js";
import { appUrlForPath, getConnectCallbackBaseUrl } from "../lib/app-url.js";
import { enforceRateLimit, oauthLimiter } from "../lib/ratelimit.js";
import { sanitizeReturnToPath } from "@social0/shared";

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
  const session = await getRouteSession();
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
  const workspaceId = ws.ctx.workspaceId;

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

  const { connectionScopeCondition } = await import(
    "../lib/workspace/context.js"
  );
  const [account] = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        connectionScopeCondition({ resourceUserId, workspaceId }),
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
  // Same rule as platform-start: only same-origin app paths. Lets "Reconnect &
  // retry" on a post come back to that post instead of Accounts.
  const returnTo = sanitizeReturnToPath(req.parsedUrl.searchParams.get("returnTo"));
  if (returnTo) reauthUrl.searchParams.set("returnTo", returnTo);

  return RouteResponse.redirect(reauthUrl);
}
