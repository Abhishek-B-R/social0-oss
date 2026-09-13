import { db } from "../db/instance.js";
import { connectedAccounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "./encryption.js";
import { getValidYouTubeToken } from "./youtube-token.js";
import { parseTikTokTokenResponse } from "./tiktok-token.js";
import { withTokenRefreshLock } from "./token-refresh-lock.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Platforms that can silently renew access tokens (no reconnect UX). */
export const REFRESHABLE_PLATFORMS = new Set([
  "linkedin",
  "tiktok",
  "youtube",
  "instagram",
  "threads",
  "facebook",
  "pinterest",
]);

function refreshBufferMs(platform: string): number {
  switch (platform) {
    case "linkedin":
      return SEVEN_DAYS_MS;
    case "instagram":
    case "threads":
    case "facebook":
      return FOURTEEN_DAYS_MS;
    case "tiktok":
      return TEN_MIN_MS;
    case "pinterest":
      return ONE_DAY_MS;
    default:
      return 5 * 60 * 1000;
  }
}

/**
 * Persist a refreshed token pair.
 *
 * Deliberately does NOT touch `isActive`. The only thing that clears that flag
 * is `syncConnectedAccountsToLimit` (accounts over the plan's connection cap),
 * so setting it back to true here silently undid plan enforcement whenever a
 * token happened to refresh. Reconnecting through OAuth sets it explicitly.
 */
async function persistTokens(
  accountId: string,
  accessToken: string,
  expiresIn: number,
  refreshToken?: string | null,
): Promise<void> {
  const patch: {
    encryptedAccessToken: string;
    tokenExpiresAt: Date;
    tokenStatus: "active";
    updatedAt: Date;
    encryptedRefreshToken?: string;
  } = {
    encryptedAccessToken: encryptToken(accessToken, accountId),
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    tokenStatus: "active",
    updatedAt: new Date(),
  };
  if (refreshToken) {
    patch.encryptedRefreshToken = encryptToken(refreshToken, accountId);
  }
  await db
    .update(connectedAccounts)
    .set(patch)
    .where(eq(connectedAccounts.id, accountId));
}

/**
 * Gets a valid access token, refreshing when expired / near expiry.
 * null tokenExpiresAt is treated as still-valid (e.g. Facebook page tokens).
 */
export async function getValidToken(
  accountId: string,
  platform: string,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  const outcome = await withTokenRefreshLock(accountId, () =>
    refreshTokenUnlocked(accountId, platform, options),
  );
  if (outcome.refreshed) return outcome.value;

  // A forced refresh means the provider just rejected the stored token, and the
  // caller we waited on may only have read that same token. Refresh now that
  // the lock is free: `refreshTokenUnlocked` re-reads the account, so it
  // presents whatever refresh token that caller stored.
  if (options?.forceRefresh) {
    return refreshTokenUnlocked(accountId, platform, options);
  }

  // Another caller just refreshed this account. Read what they stored rather
  // than calling the provider again with a refresh token they may have rotated.
  const account = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.id, accountId),
  });
  if (!account) throw new Error("Account not found");
  return decryptToken(account.encryptedAccessToken, account.id);
}

async function refreshTokenUnlocked(
  accountId: string,
  platform: string,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  const account = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.id, accountId),
  });

  if (!account) {
    throw new Error("Account not found");
  }

  if (platform === "youtube") {
    return getValidYouTubeToken(account, options);
  }

  const accessToken = decryptToken(account.encryptedAccessToken, account.id);
  const expiresAt = account.tokenExpiresAt;
  const force = options?.forceRefresh === true;

  // ponytail: null expiry means "platform didn't give us a clock" — use token as-is
  // until a verify/publish 401 forces a refresh path. Upgrade: store provider TTL hints.
  if (
    !force &&
    (expiresAt == null ||
      new Date(expiresAt) > new Date(Date.now() + refreshBufferMs(platform)))
  ) {
    return accessToken;
  }

  if (platform === "instagram") {
    const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Instagram token refresh failed:", {
        status: response.status,
        error: errorData,
      });
      throw new Error(
        "Failed to refresh Instagram token. Please reconnect your account.",
      );
    }
    const data = await response.json();
    const newAccessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) ?? 60 * 24 * 60 * 60;
    await persistTokens(account.id, newAccessToken, expiresIn);
    console.log(`✅ Refreshed Instagram token for account ${accountId}`);
    return newAccessToken;
  }

  if (platform === "threads") {
    const url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Threads token refresh failed:", {
        status: response.status,
        error: errorData,
      });
      throw new Error(
        "Failed to refresh Threads token. Please reconnect your account.",
      );
    }
    const data = await response.json();
    const newAccessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) ?? 60 * 24 * 60 * 60;
    await persistTokens(account.id, newAccessToken, expiresIn);
    console.log(`✅ Refreshed Threads token for account ${accountId}`);
    return newAccessToken;
  }

  if (platform === "facebook") {
    // Page tokens from long-lived user tokens typically don't expire.
    // If we have an expiry clock and hit the buffer, try Meta's refresh endpoint.
    const url = `https://graph.facebook.com/refresh_access_token?grant_type=fb_refresh_token&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Facebook token refresh failed:", {
        status: response.status,
        error: errorData,
      });
      throw new Error(
        "Failed to refresh Facebook token. Please reconnect your account.",
      );
    }
    const data = await response.json();
    const newAccessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) ?? 60 * 24 * 60 * 60;
    await persistTokens(account.id, newAccessToken, expiresIn);
    console.log(`✅ Refreshed Facebook token for account ${accountId}`);
    return newAccessToken;
  }

  if (platform === "tiktok") {
    if (!account.encryptedRefreshToken) {
      // Access token still live — don't demand a refresh token we never got.
      if (expiresAt && new Date(expiresAt) > new Date()) {
        return accessToken;
      }
      throw new Error(
        "No refresh token available. Please reconnect your account.",
      );
    }
    if (!process.env.TIKTOK_CLIENT_ID || !process.env.TIKTOK_CLIENT_SECRET) {
      throw new Error("TikTok OAuth credentials not configured");
    }
    const refreshToken = decryptToken(
      account.encryptedRefreshToken,
      account.id,
    );
    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_ID,
          client_secret: process.env.TIKTOK_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );
    const raw = await response.json().catch(() => ({}));
    // TikTok returns flat JSON or nested under data — tolerate both.
    const parsed = parseTikTokTokenResponse(raw);
    if (!response.ok || !parsed) {
      console.error("TikTok token refresh failed:", {
        status: response.status,
        data: raw,
      });
      throw new Error("TikTok refresh failed. Please reconnect your account.");
    }
    await persistTokens(
      account.id,
      parsed.access_token,
      parsed.expires_in,
      parsed.refresh_token,
    );
    console.log(`✅ Refreshed TikTok token for account ${accountId}`);
    return parsed.access_token;
  }

  if (platform === "linkedin") {
    if (!account.encryptedRefreshToken) {
      // Standard LinkedIn apps (non-MDP) never get refresh_token — 60-day access token is the real TTL.
      if (expiresAt && new Date(expiresAt) > new Date()) {
        return accessToken;
      }
      throw new Error(
        "No refresh token available. Please reconnect your account.",
      );
    }
    if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
      throw new Error("LinkedIn OAuth credentials not configured");
    }
    const refreshToken = decryptToken(
      account.encryptedRefreshToken,
      account.id,
    );
    const response = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("LinkedIn token refresh failed:", {
        status: response.status,
        error: errorData,
      });
      throw new Error(
        "Failed to refresh LinkedIn token. Please reconnect your account.",
      );
    }
    const data = await response.json();
    const newAccessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) || 3600;
    // LinkedIn may rotate refresh_token — persist when present
    const newRefresh =
      typeof data.refresh_token === "string" ? data.refresh_token : null;
    await persistTokens(account.id, newAccessToken, expiresIn, newRefresh);
    console.log(`✅ Refreshed LinkedIn token for account ${accountId}`);
    return newAccessToken;
  }

  if (platform === "pinterest") {
    if (!account.encryptedRefreshToken) {
      if (expiresAt && new Date(expiresAt) > new Date()) {
        return accessToken;
      }
      throw new Error(
        "No refresh token available. Please reconnect your account.",
      );
    }
    if (!process.env.PINTEREST_CLIENT_ID || !process.env.PINTEREST_CLIENT_SECRET) {
      throw new Error("Pinterest OAuth credentials not configured");
    }
    const refreshToken = decryptToken(
      account.encryptedRefreshToken,
      account.id,
    );
    const basic = Buffer.from(
      `${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`,
    ).toString("base64");
    const response = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      console.error("Pinterest token refresh failed:", {
        status: response.status,
        data,
      });
      throw new Error(
        "Failed to refresh Pinterest token. Please reconnect your account.",
      );
    }
    const newAccessToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) || 30 * 24 * 60 * 60;
    const newRefresh =
      typeof data.refresh_token === "string"
        ? data.refresh_token
        : refreshToken;
    await persistTokens(account.id, newAccessToken, expiresIn, newRefresh);
    console.log(`✅ Refreshed Pinterest token for account ${accountId}`);
    return newAccessToken;
  }

  // Unknown / non-refreshable: return stored token
  return accessToken;
}
