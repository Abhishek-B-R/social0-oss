import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { connectedAccounts, verification } from "../db/schema.js";
import { encrypt, encryptToken } from "@social0/shared";
import { env } from "../lib/env.js";
import { getConnectCallbackBaseUrl } from "../lib/app-url.js";
import {
  buildFacebookOAuthUrl,
  getFacebookLoginConfigId,
} from "../lib/facebook-oauth.js";
import { PLATFORM_OAUTH_CONFIG, type Platform } from "../lib/platforms.js";
import { revokeTokenOnPlatform } from "../lib/revoke-token.js";
import { decryptToken } from "@social0/shared";

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

export async function v1ListAccounts(userId: string) {
  const accounts = await db.query.connectedAccounts.findMany({
    where: eq(connectedAccounts.userId, userId),
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
  userId: string,
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, userId),
      ),
    )
    .limit(1);

  if (!account) return { ok: false, error: "Account not found" };

  try {
    const accessToken = decryptToken(account.encryptedAccessToken, account.id);
    await revokeTokenOnPlatform(account.platform as Platform, accessToken);
  } catch {
    // best effort
  }

  await db.delete(connectedAccounts).where(eq(connectedAccounts.id, accountId));
  return { ok: true };
}

/** Build OAuth authorization URL for dashboard-style connect flow. */
export async function v1BuildConnectUrl(
  userId: string,
  platform: string,
): Promise<{ ok: true; authorization_url: string } | { ok: false; error: string }> {
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

    state = encrypt({ userId, platform, stateId });
    url.searchParams.set("client_key", clientId);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  } else {
    state = encrypt({ userId, platform });
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
      configId: getFacebookLoginConfigId(),
      scope: config.scope,
    });
    return { ok: true, authorization_url: fbUrl };
  }

  return { ok: true, authorization_url: url.toString() };
}
