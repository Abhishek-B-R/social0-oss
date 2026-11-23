import { connectionScopeCondition } from "../lib/workspace/context.js";
import type { V1Scope } from "../lib/v1-workspace.js";
import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { connectedAccounts, verification } from "../db/schema.js";
import { encrypt, encryptToken } from "@social0/shared";
import { env } from "../lib/env.js";
import { getConnectCallbackBaseUrl } from "../lib/app-url.js";
import { buildFacebookOAuthUrl } from "../lib/facebook-oauth.js";
import { PLATFORM_OAUTH_CONFIG, type Platform } from "../lib/platforms.js";
import { revokeAccountGrant } from "../lib/revoke-account-grant.js";
import { queueAgencyExtraAccountsSync } from "../lib/extra-accounts.js";

const VALID_PLATFORMS: Platform[] = [
  "linkedin",
  "instagram",
  "youtube",
  "pinterest",
  "tiktok",
  "twitter_x",
  "threads",
  "bluesky",
  "facebook",
];

/** Accounts in the caller's scope: the personal pool, or the `workspace_id` workspace. */
export async function v1ListAccounts(scope: V1Scope) {
  const accounts = await db.query.connectedAccounts.findMany({
    where: connectionScopeCondition({
      resourceUserId: scope.userId,
      workspaceId: scope.workspaceId,
    }),
    orderBy: [asc(connectedAccounts.createdAt), asc(connectedAccounts.id)],
    columns: {
      id: true,
      platform: true,
      platformUsername: true,
      profileImageUrl: true,
      isActive: true,
      tokenExpiresAt: true,
      tokenStatus: true,
      createdAt: true,
    },
  });

  return accounts.map((a) => ({
    id: a.id,
    platform: a.platform,
    username: a.platformUsername,
    profile_image_url: a.profileImageUrl,
    is_active: a.isActive,
    token_expires_at: a.tokenExpiresAt?.toISOString() ?? null,
    token_status: a.tokenStatus,
    created_at: a.createdAt?.toISOString() ?? null,
  }));
}

export async function v1DisconnectAccount(
  scope: V1Scope,
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = scope;
  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        connectionScopeCondition({
          resourceUserId: userId,
          workspaceId: scope.workspaceId,
        }),
      ),
    )
    .limit(1);

  if (!account) return { ok: false, error: "Account not found" };

  // Best effort; skipped while another row still uses the same grant.
  await revokeAccountGrant(account);

  await db.delete(connectedAccounts).where(eq(connectedAccounts.id, accountId));
  // Agency: one account fewer to bill (never below 0, no mid-cycle refund).
  queueAgencyExtraAccountsSync(userId, "disconnect");
  return { ok: true };
}

/** Build OAuth authorization URL for dashboard-style connect flow. */
export async function v1BuildConnectUrl(
  scope: V1Scope,
  platform: string,
): Promise<{ ok: true; authorization_url: string } | { ok: false; error: string }> {
  // The account lands in the workspace's pool, owned by the workspace owner (as the dashboard's connect does).
  const { userId, workspaceId } = scope;
  if (!VALID_PLATFORMS.includes(platform as Platform)) {
    return { ok: false, error: "Invalid platform" };
  }

  if (platform === "twitter_x") {
    return {
      ok: false,
      error:
        "Twitter/X connect requires browser session. Connect via the dashboard at /dashboard/connections.",
    };
  }

  if (platform === "bluesky") {
    return {
      ok: false,
      error: "Bluesky uses BYOK credentials. Connect via the dashboard.",
    };
  }

  const config = PLATFORM_OAUTH_CONFIG[platform as Platform];
  if (!config) {
    return { ok: false, error: "Platform not configured for OAuth" };
  }

  const clientId = env[config.clientIdEnv as keyof typeof env] as string;
  const clientSecret = env[config.clientSecretEnv as keyof typeof env] as string;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Platform OAuth credentials not configured" };
  }

  const redirectUri = `${getConnectCallbackBaseUrl()}/api/connect/${platform}/callback`;
  const url = new URL(config.authUrl);
  let state: string;

  if (platform === "tiktok") {
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const stateId = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.insert(verification).values({
      id: stateId,
      identifier: `pkce_${userId}_${platform}`,
      value: encryptToken(codeVerifier, stateId),
      expiresAt,
    });

    state = encrypt({ userId, workspaceId, platform, stateId });
    url.searchParams.set("client_key", clientId);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  } else {
    state = encrypt({ userId, workspaceId, platform });
    url.searchParams.set("client_id", clientId);
  }

  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);

  if (platform === "facebook") {
    const fbUrl = buildFacebookOAuthUrl({
      clientId,
      redirectUri,
      state,
      scope: config.scope,
    });
    return { ok: true, authorization_url: fbUrl };
  }

  return { ok: true, authorization_url: url.toString() };
}
