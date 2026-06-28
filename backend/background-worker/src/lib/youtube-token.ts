import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "./encryption.js";
import { env } from "./env.js";

export const YOUTUBE_UPLOAD_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

type GoogleTokenInfo = {
  scope?: string;
  expires_in?: string | number;
  error?: string;
  error_description?: string;
};

export async function fetchGoogleTokenInfo(
  accessToken: string,
): Promise<GoogleTokenInfo | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken.trim())}`,
    );
    const body = (await res.json().catch(() => ({}))) as GoogleTokenInfo;
    if (!res.ok || body.error) return null;
    return body;
  } catch {
    return null;
  }
}

export function tokenInfoHasYouTubeUploadScope(
  scope: string | undefined,
): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).filter(Boolean).includes(YOUTUBE_UPLOAD_SCOPE);
}

export async function isYouTubeAccessTokenUsable(
  accessToken: string,
): Promise<boolean> {
  const trimmed = accessToken.trim();
  if (!trimmed) return false;
  const info = await fetchGoogleTokenInfo(trimmed);
  return tokenInfoHasYouTubeUploadScope(info?.scope);
}

type YouTubeAccountRow = {
  id: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
};

async function refreshYouTubeToken(
  account: YouTubeAccountRow,
): Promise<string> {
  if (!account.encryptedRefreshToken) {
    throw new Error(
      "No refresh token available. Please reconnect your YouTube account from Connections.",
    );
  }
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new Error("YouTube OAuth credentials not configured");
  }

  const refreshToken = decryptToken(
    account.encryptedRefreshToken,
    account.id,
  );
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

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    console.error("YouTube token refresh failed:", {
      status: response.status,
      error: data,
    });
    throw new Error(
      "Failed to refresh YouTube token. Please reconnect your account from Connections.",
    );
  }

  const expiresIn = data.expires_in || 3600;
  await db
    .update(connectedAccounts)
    .set({
      encryptedAccessToken: encryptToken(data.access_token, account.id),
      ...(data.refresh_token
        ? {
            encryptedRefreshToken: encryptToken(
              data.refresh_token,
              account.id,
            ),
          }
        : {}),
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      tokenStatus: "active",
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(connectedAccounts.id, account.id));

  console.log(`✅ Refreshed YouTube token for account ${account.id}`);
  return data.access_token;
}

export async function getValidYouTubeToken(
  account: YouTubeAccountRow,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  const accessToken = decryptToken(account.encryptedAccessToken, account.id);
  const expiresAt = account.tokenExpiresAt;
  const nearExpiry =
    expiresAt != null &&
    new Date(expiresAt) <= new Date(Date.now() + REFRESH_BUFFER_MS);

  let token = accessToken;
  const needsRefresh =
    options?.forceRefresh ||
    nearExpiry ||
    expiresAt == null ||
    !(await isYouTubeAccessTokenUsable(accessToken));

  if (needsRefresh) {
    token = await refreshYouTubeToken(account);
  }

  if (!(await isYouTubeAccessTokenUsable(token))) {
    throw new Error(
      "YouTube access is missing upload permission. Reconnect YouTube from Connections and approve all requested permissions.",
    );
  }

  return token;
}

export function resolveEncryptedRefreshToken(
  accountId: string,
  existingEncrypted: string | null,
  newRefreshToken: string | undefined | null,
): string | null {
  if (newRefreshToken) {
    return encryptToken(newRefreshToken, accountId);
  }
  return existingEncrypted;
}

export function youtubeTokenExpiresAt(
  expiresIn: number | undefined,
): Date {
  const seconds =
    typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 3600;
  return new Date(Date.now() + seconds * 1000);
}
