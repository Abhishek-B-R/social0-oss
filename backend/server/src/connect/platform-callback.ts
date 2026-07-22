import { PLATFORM_OAUTH_CONFIG, Platform } from "../lib/platforms.js";
import { db } from "../db/index.js";
import { connectedAccounts, verification } from "../db/schema.js";
import { checkAccountLimits } from "../lib/plan-limits.js";
import { logConnectBlocked } from "@social0/shared";
import { syncSubscriptionForUserId } from "../lib/billing-sync.js";
import { eq, and, isNull } from "drizzle-orm";
import { env } from "../lib/env.js";
import { decrypt, encryptToken, decryptToken } from "@social0/shared";
import { assertOAuthCallbackSession } from "../lib/oauth-callback-session.js";
import { sanitizeReturnToPath } from "@social0/shared";
import crypto from "crypto";
import {
  connectionsSelectPath,
  getConnectCallbackBaseUrl,
} from "../lib/app-url.js";
import { safeRedirect, rethrowRouteRedirect } from "../lib/redirect.js";
import { AppRequest } from "../lib/http/http.js";
import { cookies } from "../lib/http/request-cookies.js";
import OAuth from "oauth-1.0a";
import { TwitterApi } from "twitter-api-v2";
import {
  isLikelyTikTokOpenId,
  parseTikTokTokenResponse,
  resolveTikTokConnectUser,
} from "../lib/tiktok-connect.js";
import {
  isYouTubeAccessTokenUsable,
  resolveEncryptedRefreshToken,
  youtubeTokenExpiresAt,
} from "../lib/youtube-token.js";
import { mirrorProfileImageToR2, resolveProfileImageUrl } from "../lib/mirror-profile-image.js";

function normalizeWorkspaceId(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function connectedAccountWorkspaceCondition(workspaceId: string | null) {
  return workspaceId
    ? eq(connectedAccounts.workspaceId, workspaceId)
    : isNull(connectedAccounts.workspaceId);
}

/** Validate URL is http/https before treating it as a fetchable profile image. */
function isValidProfileImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.trim()) return false;
  const u = url.trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

export async function platformCallback(
  req: AppRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform: platformParam } = await params;

  // Validate platform is a valid Platform type (including BYOK platforms)
  const validPlatforms: Platform[] = [
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
  if (!validPlatforms.includes(platformParam as Platform)) {
    return safeRedirect(
      `/dashboard?error=invalid_platform&platform=${platformParam}`,
      "/dashboard",
    );
  }

  const platform = platformParam as Platform;
  const url = new URL(req.url);

  // Instagram appends #_ to redirect URI - strip it
  if (url.hash === "#_") {
    url.hash = "";
  }

  const { searchParams } = url;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const oauthToken = searchParams.get("oauth_token");
  const oauthVerifier = searchParams.get("oauth_verifier");

  // Handle OAuth errors
  if (error) {
    return safeRedirect(
      `/dashboard?error=oauth_failed&platform=${platform}`,
      "/dashboard",
    );
  }

  // Twitter OAuth 1.0a callback: oauth_token + oauth_verifier (no "code"; state not returned by Twitter)
  if (platform === "twitter_x") {
    if (!oauthToken || !oauthVerifier) {
      return safeRedirect(
        `/dashboard?error=invalid_callback&platform=${platform}`,
        "/dashboard",
      );
    }
    try {
      const cookieStore = await cookies();
      const secretCookie = cookieStore.get("twitter_oauth1_request_secret");
      if (!secretCookie?.value) {
        return safeRedirect(
          `/dashboard?error=verifier_missing&platform=${platform}`,
          "/dashboard",
        );
      }
      const secretDecrypted = decrypt(secretCookie.value);
      const requestTokenSecret = secretDecrypted.oauth_token_secret;
      const userId = secretDecrypted.userId;
      const workspaceId = normalizeWorkspaceId(secretDecrypted.workspaceId);
      cookieStore.delete("twitter_oauth1_request_secret");

      await assertOAuthCallbackSession(req, userId, platform);

      if (!requestTokenSecret) {
        return safeRedirect(
          `/dashboard?error=invalid_state&platform=${platform}`,
          "/dashboard",
        );
      }

      const consumerKey = env.TWITTER_CONSUMER_KEY;
      const consumerSecret = env.TWITTER_CONSUMER_SECRET;
      if (!consumerKey || !consumerSecret) {
        return safeRedirect(
          `/dashboard?error=credentials_not_configured&platform=${platform}`,
          "/dashboard",
        );
      }

      const client = new TwitterApi({
        appKey: consumerKey,
        appSecret: consumerSecret,
        accessToken: oauthToken,
        accessSecret: requestTokenSecret,
      });
      const { accessToken, accessSecret } = await client.login(oauthVerifier);

      let userInfo: {
        id: string;
        username: string | null;
        profileImageUrl: string | null;
      };
      try {
        const oauth = new OAuth({
          consumer: { key: consumerKey, secret: consumerSecret },
          signature_method: "HMAC-SHA1",
          hash_function(base_string: string, key: string) {
            return crypto
              .createHmac("sha1", key)
              .update(base_string)
              .digest("base64");
          },
        });
        const verifyUrl =
          "https://api.twitter.com/1.1/account/verify_credentials.json?include_entities=false&skip_status=true&include_email=false";
        const authHeader = oauth.toHeader(
          oauth.authorize(
            { url: verifyUrl, method: "GET" },
            { key: accessToken, secret: accessSecret },
          ),
        );
        const response = await fetch(verifyUrl, {
          headers: authHeader as unknown as Record<string, string>,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error(
            "Twitter verify_credentials error:",
            response.status,
            data,
          );
          userInfo = {
            id: `twitter_x-${Date.now()}`,
            username: null,
            profileImageUrl: null,
          };
        } else {
          let profileImageUrl: string | null =
            typeof data.profile_image_url_https === "string"
              ? data.profile_image_url_https
              : null;
          if (profileImageUrl) {
            profileImageUrl = profileImageUrl.replace(
              /_normal(\.[a-z]+)?$/i,
              "_400x400$1",
            ) as string;
            if (!isValidProfileImageUrl(profileImageUrl))
              profileImageUrl = null;
          }
          userInfo = {
            id: data.id_str ?? `twitter_x-${Date.now()}`,
            username: data.screen_name ?? data.name ?? null,
            profileImageUrl,
          };
          console.log("Twitter pfp:", userInfo.profileImageUrl);
        }
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error(
          "Twitter OAuth 1.0a verify_credentials fetch failed:",
          err,
        );
        userInfo = {
          id: `twitter_x-${Date.now()}`,
          username: null,
          profileImageUrl: null,
        };
      }

      if (!userId) {
        return safeRedirect(
          `/dashboard?error=invalid_state&platform=${platform}`,
          "/dashboard",
        );
      }
      const existing = secretDecrypted.reauthAccountId
        ? await db.query.connectedAccounts.findFirst({
            where: and(
              eq(connectedAccounts.id, secretDecrypted.reauthAccountId),
              eq(connectedAccounts.userId, userId),
              eq(connectedAccounts.platform, "twitter_x"),
            ),
          })
        : await db.query.connectedAccounts.findFirst({
            where: and(
              eq(connectedAccounts.userId, userId),
              eq(connectedAccounts.platform, "twitter_x"),
              eq(connectedAccounts.platformUserId, userInfo.id),
              connectedAccountWorkspaceCondition(workspaceId),
            ),
          });

      const accountId = existing?.id ?? crypto.randomUUID();
      const encryptedAccess = encryptToken(accessToken, accountId);
      const encryptedSecret = encryptToken(accessSecret, accountId);
      const mirroredProfileImageUrl = await mirrorProfileImageToR2(
        userInfo.profileImageUrl,
        { userId, accountId, platform: "twitter_x" },
      );
      const profileImageUrl = resolveProfileImageUrl(
        mirroredProfileImageUrl,
        existing?.profileImageUrl,
      );

      if (existing) {
        await db
          .update(connectedAccounts)
          .set({
            encryptedAccessToken: encryptedAccess,
            encryptedRefreshToken: encryptedSecret,
            tokenExpiresAt: null,
            platformUserId: userInfo.id,
            platformUsername: userInfo.username,
            profileImageUrl,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(connectedAccounts.id, existing.id));
      } else {
        let limitCheck = await checkAccountLimits(userId, "twitter_x");
        if (!limitCheck.allowed && limitCheck.limitTotal === 0) {
          await syncSubscriptionForUserId(userId);
          limitCheck = await checkAccountLimits(userId, "twitter_x");
        }
        if (!limitCheck.allowed) {
          logConnectBlocked(
            userId,
            "twitter_x",
            limitCheck.reason ??
              "You need an active plan to connect accounts and post content.",
            limitCheck.currentTotal,
            limitCheck.limitTotal,
          );
          return safeRedirect(
            `/dashboard/connections?error=limit_reached&message=${encodeURIComponent(limitCheck.reason ?? "You need an active plan to connect accounts and post content.")}`,
            "/dashboard/connections",
          );
        }
        await db.insert(connectedAccounts).values({
          id: accountId,
          userId,
          workspaceId,
          platform: "twitter_x",
          platformUserId: userInfo.id,
          platformUsername: userInfo.username,
          profileImageUrl,
          encryptedAccessToken: encryptedAccess,
          encryptedRefreshToken: encryptedSecret,
          tokenExpiresAt: null,
          isActive: true,
        });
      }
      try {
        const { refreshTwitterPremiumStatus } =
          await import("../lib/twitter-premium.js");
        await refreshTwitterPremiumStatus(accountId);
      } catch {
        // Best effort - don't block redirect
      }
      let twitterRedirect =
        sanitizeReturnToPath(secretDecrypted.returnTo) ??
        "/dashboard/connections?connected=twitter_x";
      if (secretDecrypted.reauth) {
        twitterRedirect = twitterRedirect.includes("?")
          ? `${twitterRedirect}&reauth=success`
          : `${twitterRedirect}?reauth=success`;
      }
      return safeRedirect(twitterRedirect, twitterRedirect);
    } catch (err) {
      rethrowRouteRedirect(err);
      console.error("Twitter OAuth 1.0a callback error:", err);
      return safeRedirect(
        `/dashboard?error=oauth_failed&platform=${platform}`,
        "/dashboard",
      );
    }
  }

  // Check if platform uses OAuth (not BYOK)
  if (!PLATFORM_OAUTH_CONFIG[platform]) {
    return safeRedirect(
      `/dashboard?error=platform_not_configured&platform=${platform}`,
      "/dashboard",
    );
  }

  if (!code || !state) {
    return safeRedirect(
      `/dashboard?error=invalid_callback&platform=${platform}`,
      "/dashboard",
    );
  }

  // Decrypt state to get userId (and stateId for TikTok PKCE verifier lookup)
  let userId: string;
  let workspaceId: string | null;
  let codeVerifier: string | undefined;
  let successRedirect = "/dashboard/connections";
  let isReauth: boolean;
  let reauthAccountId: string | undefined;
  try {
    const decrypted = decrypt(state);
    userId = decrypted.userId;
    workspaceId = normalizeWorkspaceId(decrypted.workspaceId);
    isReauth = decrypted.reauth === true;
    if (typeof decrypted.reauthAccountId === "string") {
      reauthAccountId = decrypted.reauthAccountId;
    }
    const returnTo = sanitizeReturnToPath(decrypted.returnTo);
    if (returnTo) {
      successRedirect = returnTo;
    }

    if (decrypted.platform !== platform) {
      return safeRedirect(
        `/dashboard?error=state_mismatch&platform=${platform}`,
        "/dashboard",
      );
    }

    // TikTok: Retrieve verifier from DB using stateId
    if (platform === "tiktok" && decrypted.stateId) {
      const verifierRecord = await db.query.verification.findFirst({
        where: eq(verification.id, decrypted.stateId),
      });

      if (!verifierRecord || new Date(verifierRecord.expiresAt) < new Date()) {
        console.error("TikTok PKCE: verifier not found or expired");
        return safeRedirect(
          `/dashboard?error=verifier_expired&platform=${platform}`,
          "/dashboard",
        );
      }

      try {
        codeVerifier = decryptToken(verifierRecord.value, decrypted.stateId);
      } catch {
        codeVerifier = verifierRecord.value;
      }

      // Clean up verifier from DB (one-time use)
      await db
        .delete(verification)
        .where(eq(verification.id, decrypted.stateId));
    }

    await assertOAuthCallbackSession(req, userId, platform);
  } catch (err) {
    rethrowRouteRedirect(err);
    console.error("OAuth state decryption failed");
    return safeRedirect(
      `/dashboard?error=invalid_state&platform=${platform}`,
      "/dashboard",
    );
  }

  const config = PLATFORM_OAUTH_CONFIG[platform];
  if (!config) {
    return safeRedirect(
      `/dashboard?error=platform_not_configured&platform=${platform}`,
      "/dashboard",
    );
  }

  // Get client ID and secret from env
  const clientId = env[config.clientIdEnv as keyof typeof env] as string;
  const clientSecret = env[
    config.clientSecretEnv as keyof typeof env
  ] as string;

  if (!clientId || !clientSecret) {
    return safeRedirect(
      `/dashboard?error=credentials_not_configured&platform=${platform}`,
      "/dashboard",
    );
  }

  try {
    // Exchange code for tokens - platform-specific handling
    let tokenResponse: Response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- platform OAuth payloads vary widely
    let tokens: any;

    const redirectUri = `${getConnectCallbackBaseUrl()}/api/connect/${platform}/callback`;

    // Use platform's token URL
    const tokenUrl = config.tokenUrl;

    if (
      platform === "instagram" ||
      platform === "threads" ||
      platform === "facebook"
    ) {
      // Instagram, Threads, and Facebook use Meta Graph API (same format)
      const tokenParams = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      });

      try {
        tokenResponse = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: tokenParams,
        });
      } catch (fetchError) {
        if (
          (fetchError as { digest?: string })?.digest?.startsWith(
            "ROUTE_REDIRECT",
          )
        ) {
          throw fetchError;
        }
        if (
          fetchError instanceof Error &&
          fetchError.message === "ROUTE_REDIRECT"
        ) {
          throw fetchError;
        }
        const err = fetchError as Error & { code?: string; cause?: Error };
        console.error(`${platform} token exchange fetch error:`, {
          error: err.message,
          code: err.code,
          cause: err.cause?.message,
          tokenUrl,
          redirectUri,
          stack: err.stack,
        });
        throw new Error(
          `Failed to connect to ${platform} API: ${err.code === "ECONNRESET" ? "Connection was reset. This may be a temporary network issue - please try again." : err.message}`,
          { cause: fetchError },
        );
      }

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        let errorJson;
        try {
          errorJson = JSON.parse(errorText);
        } catch (parseErr) {
          if (
            (parseErr as { digest?: string })?.digest?.startsWith(
              "ROUTE_REDIRECT",
            )
          ) {
            throw parseErr;
          }
          if (
            parseErr instanceof Error &&
            parseErr.message === "ROUTE_REDIRECT"
          ) {
            throw parseErr;
          }
          errorJson = { raw: errorText };
        }
        console.error(`${platform} token exchange failed:`, {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorJson,
          tokenUrl,
        });
        const errMsg =
          errorJson.error?.message ??
          errorJson.error_description ??
          String(errorJson.error ?? errorText);
        throw new Error(`Token exchange failed: ${errMsg}`);
      }

      tokens = await tokenResponse.json();
      // Meta Graph API returns: { access_token, token_type, expires_in }
      // Normalize to standard format
      if (tokens.access_token && !tokens.refresh_token) {
        tokens.expires_in = tokens.expires_in || 3600;
      }
      // Threads: exchange short-lived token for long-lived (60 days)
      if (platform === "threads" && tokens.access_token) {
        const exchangeUrl = new URL("https://graph.threads.net/access_token");
        exchangeUrl.searchParams.set("grant_type", "th_exchange_token");
        exchangeUrl.searchParams.set("client_secret", clientSecret);
        exchangeUrl.searchParams.set("access_token", tokens.access_token);
        const exchangeRes = await fetch(exchangeUrl.toString());
        if (exchangeRes.ok) {
          const longLived = (await exchangeRes.json()) as {
            access_token?: string;
            token_type?: string;
            expires_in?: number;
          };
          if (longLived.access_token) {
            tokens.access_token = longLived.access_token;
            tokens.expires_in = longLived.expires_in ?? 60 * 24 * 60 * 60; // 60 days in seconds
          }
        }
      }

      // Instagram: exchange short-lived token for long-lived (60 days)
      if (platform === "instagram" && tokens.access_token) {
        const exchangeUrl = new URL("https://graph.instagram.com/access_token");
        exchangeUrl.searchParams.set("grant_type", "ig_exchange_token");
        exchangeUrl.searchParams.set("client_secret", clientSecret);
        exchangeUrl.searchParams.set("access_token", tokens.access_token);

        const exchangeRes = await fetch(exchangeUrl.toString());
        if (exchangeRes.ok) {
          const longLived = await exchangeRes.json();
          if (longLived.access_token) {
            tokens.access_token = longLived.access_token;
            tokens.expires_in = longLived.expires_in ?? 60 * 24 * 60 * 60;
          }
        } else {
          console.error(
            "Instagram long-lived token exchange failed:",
            await exchangeRes.text(),
          );
        }
      }
    } else if (platform === "tiktok") {
      // TikTok OAuth 2.0 with PKCE
      if (!codeVerifier) {
        console.error("❌ TikTok PKCE: Missing code_verifier");
        throw new Error("Missing code_verifier for TikTok PKCE");
      }

      const tokenRequestBody = new URLSearchParams({
        client_key: clientId, // TikTok uses client_key instead of client_id
        client_secret: clientSecret,
        code: code!,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: codeVerifier, // Required for PKCE
      });

      tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenRequestBody,
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        let errorJson;
        try {
          errorJson = JSON.parse(errorText);
        } catch (parseErr) {
          if (
            (parseErr as { digest?: string })?.digest?.startsWith(
              "ROUTE_REDIRECT",
            )
          ) {
            throw parseErr;
          }
          if (
            parseErr instanceof Error &&
            parseErr.message === "ROUTE_REDIRECT"
          ) {
            throw parseErr;
          }
          errorJson = { raw: errorText };
        }

        const errMsg =
          errorJson.error_description ??
          errorJson.error ??
          "Token exchange failed";
        console.error(
          "TikTok token exchange failed:",
          tokenResponse.status,
          errMsg,
        );
        throw new Error(`TikTok: ${errMsg}`);
      }

      tokens = await tokenResponse.json();
      const parsedTikTok = parseTikTokTokenResponse(tokens);
      if (!parsedTikTok) {
        console.error(
          "TikTok token exchange: missing access_token in response",
          tokens,
        );
        throw new Error("TikTok: invalid token response");
      }
      tokens = parsedTikTok;
    } else if (platform === "pinterest") {
      // Pinterest: Basic Auth + form body only (no client_id/client_secret in body)
      // Using sandbox API for trial access
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
        "base64",
      );
      tokenResponse = await fetch("https://api.pinterest.com/v5/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        console.error("Pinterest token exchange failed:", tokenResponse.status);
        throw new Error("Token exchange failed");
      }

      tokens = await tokenResponse.json();
    } else {
      // Standard OAuth 2.0 flow (LinkedIn, YouTube, etc.)
      tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!tokenResponse.ok) {
        console.error("Token exchange failed:", tokenResponse.status);
        throw new Error("Token exchange failed");
      }

      tokens = await tokenResponse.json();
    }

    // Pinterest: complete connection (board chosen at post time)
    if (platform === "pinterest") {
      const userInfo = await fetchPlatformUserInfo(
        platform,
        tokens.access_token,
      );
      const existing = await db.query.connectedAccounts.findFirst({
        where: and(
          eq(connectedAccounts.userId, userId),
          eq(connectedAccounts.platform, "pinterest"),
          eq(connectedAccounts.platformUserId, userInfo.id),
          connectedAccountWorkspaceCondition(workspaceId),
        ),
      });
      const accountId = existing?.id ?? crypto.randomUUID();
      const tokenExpiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;
      const profileImageUrl = await mirrorProfileImageToR2(
        userInfo.profileImageUrl,
        { userId, accountId, platform: "pinterest" },
      );
      if (existing) {
        await db
          .update(connectedAccounts)
          .set({
            platformUsername: userInfo.username,
            profileImageUrl: resolveProfileImageUrl(
              profileImageUrl,
              existing.profileImageUrl,
            ),
            encryptedAccessToken: encryptToken(
              tokens.access_token,
              existing.id,
            ),
            encryptedRefreshToken: resolveEncryptedRefreshToken(
              existing.id,
              existing.encryptedRefreshToken,
              tokens.refresh_token,
            ),
            tokenExpiresAt,
            tokenStatus: "active",
            isActive: true,
            platformMetadata:
              (existing.platformMetadata as Record<string, unknown>) ?? {},
            updatedAt: new Date(),
          })
          .where(eq(connectedAccounts.id, existing.id));
      } else {
        const pinterestLimitCheck = await checkAccountLimits(
          userId,
          "pinterest",
        );
        if (!pinterestLimitCheck.allowed) {
          logConnectBlocked(
            userId,
            "pinterest",
            pinterestLimitCheck.reason ??
              "You need an active plan to connect accounts and post content.",
            pinterestLimitCheck.currentTotal,
            pinterestLimitCheck.limitTotal,
          );
          return safeRedirect(
            `/dashboard/connections?error=limit_reached&message=${encodeURIComponent(pinterestLimitCheck.reason ?? "You need an active plan to connect accounts and post content.")}`,
            "/dashboard/connections",
          );
        }
        await db.insert(connectedAccounts).values({
          id: accountId,
          userId,
          workspaceId,
          platform: "pinterest",
          platformUserId: userInfo.id,
          platformUsername: userInfo.username,
          profileImageUrl,
          encryptedAccessToken: encryptToken(tokens.access_token, accountId),
          encryptedRefreshToken: tokens.refresh_token
            ? encryptToken(tokens.refresh_token, accountId)
            : null,
          tokenExpiresAt,
          tokenStatus: "active",
          isActive: true,
          platformMetadata: {},
        });
      }
      return safeRedirect(successRedirect, successRedirect);
    }

    // Facebook: cache pages and redirect to single-page picker (do not save to DB yet)
    if (platform === "facebook") {
      const pagesRes = await fetch(
        "https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,picture.type(large){url,is_silhouette}",
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        },
      );
      if (!pagesRes.ok) {
        console.error("Facebook pages fetch failed:", await pagesRes.text());
        return safeRedirect(
          `/dashboard?error=oauth_failed&platform=${platform}`,
          "/dashboard",
        );
      }
      const pagesData = await pagesRes.json();
      const pages: {
        id: string;
        name: string;
        access_token: string;
        picture?: { data?: { url?: string; is_silhouette?: boolean } };
      }[] = pagesData.data || [];
      if (pages.length === 0) {
        return safeRedirect(
          `/dashboard?error=no_facebook_pages&platform=${platform}`,
          "/dashboard",
        );
      }
      const pagesWithPictures: Array<{
        id: string;
        name: string;
        access_token: string;
        pictureUrl: string | null;
      }> = [];
      for (const page of pages) {
        let profileImageUrl: string | null = null;
        const fromList = page.picture?.data?.url;
        if (
          isValidProfileImageUrl(fromList) &&
          !page.picture?.data?.is_silhouette
        ) {
          profileImageUrl = fromList;
        } else {
          try {
            const pageRes = await fetch(
              `https://graph.facebook.com/v21.0/${page.id}?fields=id,name,picture`,
              { headers: { Authorization: `Bearer ${page.access_token}` } },
            );
            if (pageRes.ok) {
              const pageData = await pageRes.json();
              const url = pageData.picture?.data?.url;
              if (isValidProfileImageUrl(url)) profileImageUrl = url;
            }
          } catch (err) {
            rethrowRouteRedirect(err);
            console.error("Facebook page picture fetch failed:", err);
          }
        }
        pagesWithPictures.push({
          id: page.id,
          name: page.name,
          access_token: page.access_token,
          pictureUrl: profileImageUrl,
        });
      }
      const stateId = crypto.randomBytes(16).toString("hex");
      const payload = JSON.stringify({
        userId,
        workspaceId,
        pages: pagesWithPictures,
      });
      await db.insert(verification).values({
        id: stateId,
        identifier: "facebook_pages",
        value: encryptToken(payload, stateId),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      });
      const selectUrl = connectionsSelectPath(
        "connections/facebook/select",
        successRedirect,
        {
          token: stateId,
          returnTo: successRedirect,
        },
      );
      return safeRedirect(selectUrl, successRedirect);
    }

    // Fetch platform user info (platform-specific)
    let userInfo: {
      id: string;
      username: string | null;
      profileImageUrl: string | null;
      platformMetadata?: Record<string, unknown>;
    };

    if (platform === "tiktok") {
      const resolved = await resolveTikTokConnectUser(tokens);
      if (!resolved.ok) {
        const errParam =
          resolved.reason === "missing_basic_scope"
            ? "tiktok_scope_required"
            : "tiktok_profile_failed";
        return safeRedirect(
          `/dashboard/connections?error=${errParam}&platform=tiktok`,
          "/dashboard/connections",
        );
      }
      userInfo = resolved.profile;
    } else if (
      (platform === "instagram" || platform === "threads") &&
      tokens.user_id
    ) {
      try {
        userInfo = await fetchPlatformUserInfo(platform, tokens.access_token);
        // Use user_id from token response as fallback
        if (!userInfo.id || userInfo.id.startsWith(`${platform}-`)) {
          userInfo.id = tokens.user_id;
        }
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error(`Failed to fetch ${platform} user info:`, err);
        // Use user_id from token response
        userInfo = {
          id: tokens.user_id || `${platform}-${Date.now()}`,
          username: null,
          profileImageUrl: null,
        };
      }
    } else {
      try {
        userInfo = await fetchPlatformUserInfo(platform, tokens.access_token);
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error("Failed to fetch platform user info:", err);
        userInfo = {
          id: `unknown-${Date.now()}`,
          username: null,
          profileImageUrl: null,
        };
      }
    }

    if (platform === "youtube") {
      const usable = await isYouTubeAccessTokenUsable(tokens.access_token);
      if (!usable) {
        return safeRedirect(
          `/dashboard/connections?error=youtube_scope_required&platform=youtube`,
          "/dashboard/connections",
        );
      }
    }

    // LinkedIn: if user has company pages, redirect to select modal instead of connecting immediately
    if (platform === "linkedin") {
      try {
        const orgResponse = await fetch(
          "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              "LinkedIn-Version": "202304",
            },
          },
        );
        const orgData = await orgResponse.json().catch(() => ({}));
        console.log("[LinkedIn] orgResponse status:", orgResponse.status);
        console.log("[LinkedIn] orgData:", JSON.stringify(orgData, null, 2));
        const elements = Array.isArray(orgData.elements)
          ? orgData.elements
          : [];
        if (elements.length > 0) {
          const orgDetails = await Promise.all(
            elements.map(async (element: { organization?: string }) => {
              const orgUrn = element.organization;
              if (!orgUrn || typeof orgUrn !== "string") return null;
              const orgId = orgUrn.split(":").pop();
              if (!orgId) return null;
              const detailRes = await fetch(
                `https://api.linkedin.com/v2/organizations/${orgId}?fields=id,localizedName,logoV2`,
                {
                  headers: {
                    Authorization: `Bearer ${tokens.access_token}`,
                    "LinkedIn-Version": "202304",
                  },
                },
              );
              const detail = await detailRes.json().catch(() => ({}));
              return {
                id: orgId,
                urn: orgUrn,
                name: detail.localizedName ?? `Company ${orgId}`,
              };
            }),
          );
          const companyPages = orgDetails.filter(
            (o): o is { id: string; urn: string; name: string } => o !== null,
          );
          console.log("[LinkedIn] orgDetails count:", orgDetails.length);
          console.log(
            "[LinkedIn] redirecting to select:",
            companyPages.length > 0,
          );
          if (companyPages.length > 0) {
            const stateId = crypto.randomBytes(16).toString("hex");
            const payload = JSON.stringify({
              userId,
              workspaceId,
              accessToken: tokens.access_token,
              personalProfile: {
                id: userInfo.id,
                name: userInfo.username ?? "Personal Profile",
                picture: userInfo.profileImageUrl,
              },
              companyPages,
            });
            await db.insert(verification).values({
              id: stateId,
              identifier: "linkedin_accounts",
              value: encryptToken(payload, stateId),
              expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            });
            const selectUrl = connectionsSelectPath(
              "connections/linkedin/select",
              successRedirect,
              {
                token: stateId,
                returnTo: successRedirect,
              },
            );
            return safeRedirect(selectUrl, successRedirect);
          }
        }
      } catch (err) {
        rethrowRouteRedirect(err);
        // Skip silently: connect personal only (fall through)
      }
    }

    // Re-auth: update the account the user clicked refresh on (not only platformUserId match).
    let existing =
      isReauth && reauthAccountId
        ? await db.query.connectedAccounts.findFirst({
            where: and(
              eq(connectedAccounts.id, reauthAccountId),
              eq(connectedAccounts.userId, userId),
              eq(connectedAccounts.platform, platform),
            ),
          })
        : null;

    if (!existing) {
      existing = await db.query.connectedAccounts.findFirst({
        where:
          platform === "tiktok"
            ? and(
                eq(connectedAccounts.userId, userId),
                eq(connectedAccounts.platform, platform),
                connectedAccountWorkspaceCondition(workspaceId),
              )
            : and(
                eq(connectedAccounts.userId, userId),
                eq(connectedAccounts.platform, platform),
                eq(connectedAccounts.platformUserId, userInfo.id),
                connectedAccountWorkspaceCondition(workspaceId),
              ),
      });
    }

    if (existing) {
      // Update existing (token refresh / profile refresh only)
      let tokenExpiresAt: Date | null = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;
      if (platform === "youtube") {
        tokenExpiresAt = youtubeTokenExpiresAt(tokens.expires_in);
      }
      if (platform === "tiktok" && tokens.expires_in) {
        tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      }
      const mirroredProfileImageUrl = userInfo.profileImageUrl
        ? await mirrorProfileImageToR2(userInfo.profileImageUrl, {
            userId,
            accountId: existing.id,
            platform,
          })
        : null;
      const updateData: {
        encryptedAccessToken: string;
        encryptedRefreshToken: string | null;
        tokenExpiresAt: Date | null;
        tokenStatus: string;
        platformUserId?: string;
        platformUsername: string | null;
        profileImageUrl: string | null;
        isActive: boolean;
        platformMetadata?: Record<string, unknown>;
        updatedAt: Date;
      } = {
        encryptedAccessToken: encryptToken(tokens.access_token, existing.id),
        encryptedRefreshToken: resolveEncryptedRefreshToken(
          existing.id,
          existing.encryptedRefreshToken,
          tokens.refresh_token,
        ),
        tokenExpiresAt,
        tokenStatus: "active",
        platformUsername:
          userInfo.username != null && userInfo.username !== ""
            ? userInfo.username
            : existing.platformUsername,
        profileImageUrl:
          resolveProfileImageUrl(
            mirroredProfileImageUrl,
            existing.profileImageUrl,
          ) ??
          (!userInfo.profileImageUrl ? existing.profileImageUrl : null),
        isActive: true,
        updatedAt: new Date(),
        ...(platform === "tiktok" && isLikelyTikTokOpenId(userInfo.id)
          ? { platformUserId: userInfo.id }
          : {}),
        ...(platform === "youtube" ? { platformUserId: userInfo.id } : {}),
      };

      // Set connectionMethod for Instagram direct OAuth
      if (platform === "instagram") {
        updateData.platformMetadata = {
          ...((existing.platformMetadata as Record<string, unknown>) || {}),
          connectionMethod: "direct",
        };
      }

      await db
        .update(connectedAccounts)
        .set(updateData)
        .where(eq(connectedAccounts.id, existing.id));

      const redirectUrl = isReauth
        ? successRedirect.includes("?")
          ? `${successRedirect}&reauth=success`
          : `${successRedirect}?reauth=success`
        : successRedirect;
      return safeRedirect(redirectUrl, redirectUrl);
    }

    // Generate UUID for account ID (needed for encryption)
    const accountId = crypto.randomUUID();

    // Prepare metadata for Instagram direct OAuth
    const platformMetadata: Record<string, unknown> | undefined =
      platform === "instagram" ? { connectionMethod: "direct" } : undefined;

    if (platform === "threads") {
      console.log("Saving Threads account:", {
        platformUserId: userInfo.id,
        username: userInfo.username,
      });
    }

    let insertTokenExpiresAt: Date | null = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
    if (platform === "youtube") {
      insertTokenExpiresAt = youtubeTokenExpiresAt(tokens.expires_in);
      if (!tokens.refresh_token) {
        return safeRedirect(
          `/dashboard/connections?error=youtube_no_refresh_token&platform=youtube`,
          "/dashboard/connections",
        );
      }
    }
    if (platform === "tiktok" && tokens.expires_in) {
      insertTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    }

    let limitCheck = await checkAccountLimits(userId, platform);
    if (!limitCheck.allowed && limitCheck.limitTotal === 0) {
      await syncSubscriptionForUserId(userId);
      limitCheck = await checkAccountLimits(userId, platform);
    }
    if (!limitCheck.allowed) {
      logConnectBlocked(
        userId,
        platform,
        limitCheck.reason ??
          "You need an active plan to connect accounts and post content.",
        limitCheck.currentTotal,
        limitCheck.limitTotal,
      );
      return safeRedirect(
        `/dashboard/connections?error=limit_reached&message=${encodeURIComponent(limitCheck.reason ?? "You need an active plan to connect accounts and post content.")}`,
        "/dashboard/connections",
      );
    }

    await db.insert(connectedAccounts).values({
      id: accountId,
      userId,
      workspaceId,
      platform: platform,
      platformUserId: userInfo.id,
      platformUsername: userInfo.username,
      profileImageUrl: await mirrorProfileImageToR2(userInfo.profileImageUrl, {
        userId,
        accountId,
        platform,
      }),
      encryptedAccessToken: encryptToken(tokens.access_token, accountId),
      encryptedRefreshToken: tokens.refresh_token
        ? encryptToken(tokens.refresh_token, accountId)
        : null,
      tokenExpiresAt: insertTokenExpiresAt,
      tokenStatus: "active",
      isActive: true,
      platformMetadata,
    });

    const insertRedirectUrl = isReauth
      ? successRedirect.includes("?")
        ? `${successRedirect}&reauth=warning`
        : `${successRedirect}?reauth=warning`
      : platform === "tiktok" && !isReauth
        ? successRedirect.includes("?")
          ? `${successRedirect}&connected=tiktok`
          : `${successRedirect}?connected=tiktok`
        : successRedirect;
    return safeRedirect(insertRedirectUrl, insertRedirectUrl);
  } catch (err) {
    rethrowRouteRedirect(err);
    console.error("OAuth callback error:", err);
    return safeRedirect(
      `/dashboard/connections?error=oauth_failed&platform=${platform}`,
      "/dashboard/connections",
    );
  }
}

// Platform-specific user info fetch (implement per platform)
async function fetchPlatformUserInfo(
  platform: Platform,
  accessToken: string,
): Promise<{
  id: string;
  username: string | null;
  profileImageUrl: string | null;
  platformMetadata?: Record<string, unknown>;
}> {
  switch (platform) {
    case "linkedin": {
      try {
        const response = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.sub) {
          console.error("LinkedIn userinfo error:", response.status, data);
          break;
        }
        let profileImageUrl: string | null = null;
        try {
          const profileRes = await fetch(
            "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))",
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (profileRes.ok) {
            const profileData = await profileRes.json().catch(() => ({}));
            console.log(
              "LinkedIn raw data:",
              JSON.stringify(profileData.profilePicture, null, 2),
            );
            const elements =
              profileData.profilePicture?.["displayImage~"]?.elements;
            const urlFromProjection =
              elements?.[elements.length - 1]?.identifiers?.[0]?.identifier ??
              null;
            if (isValidProfileImageUrl(urlFromProjection)) {
              profileImageUrl = urlFromProjection;
            }
          }
          if (!profileImageUrl) {
            const fallbackUrl = data.picture ?? null;
            if (isValidProfileImageUrl(fallbackUrl))
              profileImageUrl = fallbackUrl;
          }
        } catch (err) {
          rethrowRouteRedirect(err);
          console.error("LinkedIn profile picture fetch failed:", err);
          const fallbackUrl = data.picture ?? null;
          if (isValidProfileImageUrl(fallbackUrl))
            profileImageUrl = fallbackUrl;
        }
        return {
          id: data.sub,
          username: data.name || data.given_name || "LinkedIn User",
          profileImageUrl,
        };
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error("LinkedIn user info fetch failed:", err);
      }
      break;
    }

    case "instagram": {
      try {
        const response = await fetch(
          `https://graph.instagram.com/me?fields=id,username,profile_picture_url&access_token=${accessToken}`,
        );
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Instagram Graph API userinfo error:", errorText);
          // Fallback: personal/non-business accounts may not have profile_picture_url permission
          const fallbackRes = await fetch(
            `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${accessToken}`,
          );
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            console.log(
              "Instagram direct user data (fallback):",
              JSON.stringify(fallbackData, null, 2),
            );
            return {
              id: fallbackData.id || `instagram-${Date.now()}`,
              username: fallbackData.username || null,
              profileImageUrl: null,
            };
          }
          break;
        }
        const data = await response.json();
        console.log(
          "Instagram direct user data:",
          JSON.stringify(data, null, 2),
        );
        let profileImageUrl: string | null = null;
        try {
          const raw = data.profile_picture_url;
          // Remote URL is mirrored to R2 before DB write; keep validation only.
          if (
            typeof raw === "string" &&
            (raw.startsWith("http://") || raw.startsWith("https://"))
          ) {
            profileImageUrl = raw;
          }
        } catch (pfpErr) {
          rethrowRouteRedirect(pfpErr);
          console.error("Instagram profile_picture_url parse failed:", pfpErr);
        }
        return {
          id: data.id || `instagram-${Date.now()}`,
          username: data.username || null,
          profileImageUrl,
        };
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error("Instagram user info fetch failed:", err);
      }
      break;
    }

    case "youtube": {
      const headers = { Authorization: `Bearer ${accessToken}` };
      try {
        const channelResponse = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers },
        );
        if (channelResponse.ok) {
          const channelData = await channelResponse.json();
          const channel = channelData.items?.[0];
          if (channel) {
            const thumb = channel.snippet?.thumbnails?.default?.url;
            const profileImageUrl = isValidProfileImageUrl(thumb)
              ? thumb
              : null;
            return {
              id: channel.id,
              username:
                channel.snippet?.title ||
                channel.snippet?.customUrl ||
                "YouTube User",
              profileImageUrl,
            };
          }
        }
        const userResponse = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers },
        );
        if (userResponse.ok) {
          const userData = await userResponse.json();
          const picture = userData.picture;
          const profileImageUrl = isValidProfileImageUrl(picture)
            ? picture
            : null;
          return {
            id: userData.id || `youtube-${Date.now()}`,
            username: userData.name || "YouTube User",
            profileImageUrl,
          };
        }
        console.error(
          "YouTube profile fetch failed: channels",
          channelResponse.status,
          "userinfo",
          userResponse.status,
        );
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error("YouTube user info fetch failed:", err);
      }
      break;
    }

    case "twitter_x": {
      try {
        const response = await fetch(
          "https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (response.ok) {
          const data = await response.json();
          if (data.data) {
            let profileImageUrl: string | null =
              data.data.profile_image_url || null;
            if (profileImageUrl && typeof profileImageUrl === "string") {
              profileImageUrl = profileImageUrl.replace(
                /_normal(\.[a-z]+)?$/i,
                "_400x400$1",
              ) as string;
              if (!isValidProfileImageUrl(profileImageUrl))
                profileImageUrl = null;
            }
            return {
              id: data.data.id || `twitter_x-${Date.now()}`,
              username: data.data.username || data.data.name || null,
              profileImageUrl,
            };
          }
        } else {
          const errorText = await response.text();
          console.error("X/Twitter userinfo error:", errorText);
        }
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error("X/Twitter user info fetch failed:", err);
      }
      break;
    }

    case "threads": {
      const response = await fetch(
        `https://graph.threads.net/me?fields=id,username,threads_profile_picture_url&access_token=${accessToken}`,
      );
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Threads Graph API userinfo error:", errorText);
        break;
      }
      const data = await response.json();
      let profileImageUrl: string | null = null;
      try {
        const raw = data.threads_profile_picture_url;
        if (isValidProfileImageUrl(raw)) profileImageUrl = raw;
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error("Threads threads_profile_picture_url parse failed:", err);
      }
      return {
        id: data.id || `threads-${Date.now()}`,
        username: data.username || null,
        profileImageUrl,
      };
    }

    case "pinterest": {
      try {
        const response = await fetch(
          "https://api.pinterest.com/v5/user_account",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const data = await response.json().catch(() => ({}));
        if (response.ok && (data.username || data.id)) {
          const raw = data.profile_image;
          const profileImageUrl = isValidProfileImageUrl(raw) ? raw : null;
          return {
            id: data.id || data.username,
            username: data.username || "Pinterest User",
            profileImageUrl,
          };
        }
        console.error("Pinterest user_account error:", response.status, data);
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error("Pinterest user info fetch failed:", err);
      }
      break;
    }

    case "tiktok":
      // Handled in resolveTikTokConnectUser before fetchPlatformUserInfo.
      break;

    // Add other platforms as needed
  }

  // Fallback
  return {
    id: `${platform}-${Date.now()}`,
    username: null,
    profileImageUrl: null,
  };
}
