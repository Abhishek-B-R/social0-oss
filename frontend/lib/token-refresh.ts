import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "@/lib/encryption";
import { env } from "@/lib/env";

/**
 * Gets a valid access token for a platform, automatically refreshing if expired or expiring soon.
 * Only supports platforms with refresh tokens (YouTube, LinkedIn).
 * Other platforms use long-lived tokens or don't expire.
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

  // If token doesn't expire or expires more than 5 minutes from now, return it
  if (
    !account.tokenExpiresAt ||
    new Date(account.tokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)
  ) {
    return accessToken;
  }

  // Token expired or expiring soon - refresh it
  if (!account.encryptedRefreshToken) {
    throw new Error(
      "No refresh token available. Please reconnect your account.",
    );
  }

  const refreshToken = decryptToken(
    account.encryptedRefreshToken,
    account.id,
  );

  // Platform-specific refresh logic
  let newAccessToken: string;
  let expiresIn: number;

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
  } else {
    // Other platforms don't support refresh or use long-lived tokens
    // Return existing token (it might still work even if expired)
    return accessToken;
  }

  // Update database with new token
  await db
    .update(connectedAccounts)
    .set({
      encryptedAccessToken: encryptToken(newAccessToken, account.id),
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      updatedAt: new Date(),
    })
    .where(eq(connectedAccounts.id, account.id));

  console.log(`✅ Refreshed ${platform} token for account ${accountId}`);

  return newAccessToken;
}
