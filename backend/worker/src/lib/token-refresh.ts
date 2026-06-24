import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "./encryption.js";
import { env } from "./env.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Gets a valid access token for a platform, automatically refreshing if expired or expiring soon.
 * - LinkedIn: refresh with refresh_token when < 7 days remaining.
 * - Instagram / Threads (Meta): refresh with current token when < 14 days remaining (no secret needed).
 * - YouTube / TikTok: refresh with refresh_token when within buffer (5 min / 10 min).
 */
export async function getValidToken(
  accountId: string,
  platform: string,
): Promise<string> {
  const account = await db.query.connectedAccounts.findFirst({
    where: eq(connectedAccounts.id, accountId),
  });

  if (!account) {
    throw new Error("Account not found");
  }

  const accessToken = decryptToken(account.encryptedAccessToken, account.id);

  const bufferMs =
    platform === "linkedin"
      ? SEVEN_DAYS_MS
      : platform === "instagram" ||
          platform === "threads" ||
          platform === "facebook"
        ? FOURTEEN_DAYS_MS
        : platform === "tiktok"
          ? 10 * 60 * 1000
          : platform === "youtube"
            ? 5 * 60 * 1000
            : 5 * 60 * 1000;

  if (
    !account.tokenExpiresAt ||
    new Date(account.tokenExpiresAt) > new Date(Date.now() + bufferMs)
  ) {
    return accessToken;
  }

  // Platform-specific refresh logic
  // Initialize to satisfy TS definite assignment; guarded by didRefresh below.
  let newAccessToken: string = accessToken;
  let expiresIn: number = 0;
  let didRefresh = false;

  // Meta long-lived: refresh with current token only (no secret)
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
    newAccessToken = data.access_token;
    expiresIn = data.expires_in ?? 60 * 24 * 60 * 60;
    didRefresh = true;
  } else if (platform === "threads") {
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
    newAccessToken = data.access_token;
    expiresIn = data.expires_in ?? 60 * 24 * 60 * 60;
    didRefresh = true;
  } else if (platform === "facebook") {
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
    newAccessToken = data.access_token;
    expiresIn = data.expires_in ?? 60 * 24 * 60 * 60;
    didRefresh = true;
  } else if (
    platform === "youtube" ||
    platform === "tiktok" ||
    platform === "linkedin"
  ) {
    if (!account.encryptedRefreshToken) {
      throw new Error(
        "No refresh token available. Please reconnect your account.",
      );
    }
    const refreshToken = decryptToken(
      account.encryptedRefreshToken,
      account.id,
    );

  if (platform === "youtube") {
    if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
      throw new Error("YouTube OAuth credentials not configured");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.YOUTUBE_CLIENT_ID,
        client_secret: env.YOUTUBE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("YouTube token refresh failed:", {
        status: response.status,
        error: errorData,
      });
      throw new Error(
        "Failed to refresh YouTube token. Please reconnect your account.",
      );
    }

    const data = await response.json();
    newAccessToken = data.access_token;
    expiresIn = data.expires_in || 3600;
    didRefresh = true;
  } else if (platform === "tiktok") {
    if (!env.TIKTOK_CLIENT_ID || !env.TIKTOK_CLIENT_SECRET) {
      throw new Error("TikTok OAuth credentials not configured");
    }

    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: env.TIKTOK_CLIENT_ID,
          client_secret: env.TIKTOK_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );

    const data = await response.json();
    if (!response.ok || !data.data?.access_token) {
      console.error("TikTok token refresh failed:", {
        status: response.status,
        data,
      });
      throw new Error(
        "TikTok refresh failed. Please reconnect your account.",
      );
    }

    newAccessToken = data.data.access_token;
    expiresIn = data.data.expires_in ?? 24 * 3600;

    const newRefreshToken = data.data.refresh_token;
    if (newRefreshToken) {
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken: encryptToken(newAccessToken, account.id),
          encryptedRefreshToken: encryptToken(newRefreshToken, account.id),
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, account.id));
    } else {
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken: encryptToken(newAccessToken, account.id),
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, account.id));
    }

    console.log(`✅ Refreshed TikTok token for account ${accountId}`);
    return newAccessToken;
  } else if (platform === "linkedin") {
    if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
      throw new Error("LinkedIn OAuth credentials not configured");
    }

    const response = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.LINKEDIN_CLIENT_ID,
          client_secret: env.LINKEDIN_CLIENT_SECRET,
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
    newAccessToken = data.access_token;
    expiresIn = data.expires_in || 3600;
    didRefresh = true;
  }
  } else {
    // Other platforms don't support refresh or use long-lived tokens
    // Return existing token (it might still work even if expired)
    return accessToken;
  }

  if (!didRefresh || !newAccessToken || expiresIn <= 0) {
    return accessToken;
  }

  // Update database (Instagram, Threads, Facebook, YouTube, LinkedIn; TikTok does its own update above)
  await db
    .update(connectedAccounts)
    .set({
      encryptedAccessToken: encryptToken(newAccessToken, account.id),
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(connectedAccounts.id, account.id));

  console.log(`✅ Refreshed ${platform} token for account ${accountId}`);

  return newAccessToken;
}
