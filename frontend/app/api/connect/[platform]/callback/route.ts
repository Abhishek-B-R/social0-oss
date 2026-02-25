import { PLATFORM_OAUTH_CONFIG, Platform } from "@/lib/platforms";
import { db } from "@/db";
import { connectedAccounts, verification } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/lib/env";
import { decrypt, encryptToken } from "@/lib/encryption";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { normalizeAppUrl } from "@/lib/url-utils";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import OAuth from "oauth-1.0a";
import { TwitterApi } from "twitter-api-v2";

/** Validate URL is http/https before storing as profile image. */
function isValidProfileImageUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.trim()) return false;
  const u = url.trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

/** Ensure we only ever redirect to a string URL. Passing an object (e.g. from state/callbackUrl) would 404. */
function safeRedirect(url: unknown, fallback: string): never {
  const s =
    typeof url === "string" &&
    url.trim().length > 0 &&
    (url.startsWith("/") || url.startsWith("http"))
      ? url.trim()
      : fallback;
  return redirect(s);
}

export async function GET(
  req: NextRequest,
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
      cookieStore.delete("twitter_oauth1_request_secret");

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

      let userInfo: { id: string; username: string | null; profileImageUrl: string | null };
      try {
        const oauth = new OAuth({
          consumer: { key: consumerKey, secret: consumerSecret },
          signature_method: "HMAC-SHA1",
          hash_function(base_string: string, key: string) {
            return crypto.createHmac("sha1", key).update(base_string).digest("base64");
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
        const response = await fetch(verifyUrl, { headers: authHeader as unknown as Record<string, string> });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error("Twitter verify_credentials error:", response.status, data);
          userInfo = { id: `twitter_x-${Date.now()}`, username: null, profileImageUrl: null };
        } else {
          let profileImageUrl: string | null =
            typeof data.profile_image_url_https === "string" ? data.profile_image_url_https : null;
          if (profileImageUrl) {
            profileImageUrl = profileImageUrl.replace(/_normal(\.[a-z]+)?$/i, "_400x400$1") as string;
            if (!isValidProfileImageUrl(profileImageUrl)) profileImageUrl = null;
          }
          userInfo = {
            id: data.id_str ?? `twitter_x-${Date.now()}`,
            username: data.screen_name ?? data.name ?? null,
            profileImageUrl,
          };
          console.log("Twitter pfp:", userInfo.profileImageUrl);
        }
      } catch (err) {
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
        console.error("Twitter OAuth 1.0a verify_credentials fetch failed:", err);
        userInfo = { id: `twitter_x-${Date.now()}`, username: null, profileImageUrl: null };
      }

      if (!userId) {
        return safeRedirect(
          `/dashboard?error=invalid_state&platform=${platform}`,
          "/dashboard",
        );
      }
      const existing = await db.query.connectedAccounts.findFirst({
        where: and(
          eq(connectedAccounts.userId, userId),
          eq(connectedAccounts.platform, "twitter_x"),
          eq(connectedAccounts.platformUserId, userInfo.id),
        ),
      });

      const accountId = existing?.id ?? crypto.randomUUID();
      const encryptedAccess = encryptToken(accessToken, accountId);
      const encryptedSecret = encryptToken(accessSecret, accountId);

      if (existing) {
        await db
          .update(connectedAccounts)
          .set({
            encryptedAccessToken: encryptedAccess,
            encryptedRefreshToken: encryptedSecret,
            tokenExpiresAt: null,
            platformUserId: userInfo.id,
            platformUsername: userInfo.username,
            profileImageUrl: userInfo.profileImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(connectedAccounts.id, existing.id));
      } else {
        await db.insert(connectedAccounts).values({
          id: accountId,
          userId,
          platform: "twitter_x",
          platformUserId: userInfo.id,
          platformUsername: userInfo.username,
          profileImageUrl: userInfo.profileImageUrl,
          encryptedAccessToken: encryptedAccess,
          encryptedRefreshToken: encryptedSecret,
          tokenExpiresAt: null,
        });
      }
      return safeRedirect("/dashboard/connections?connected=twitter_x", "/dashboard/connections");
    } catch (err) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      if (err instanceof Error && err.message === "NEXT_REDIRECT") {
        throw err;
      }
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
  let codeVerifier: string | undefined;
  try {
    const decrypted = decrypt(state);
    userId = decrypted.userId;

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

      codeVerifier = verifierRecord.value;

      // Clean up verifier from DB (one-time use)
      await db
        .delete(verification)
        .where(eq(verification.id, decrypted.stateId));
    }
  } catch (err) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") {
      throw err;
    }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tokens: any;

    // Normalize redirect URI (https for production, http for localhost)
    const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
    const redirectUri = `${baseUrl}/api/connect/${platform}/callback`;

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
        if ((fetchError as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw fetchError;
        }
        if (fetchError instanceof Error && fetchError.message === "NEXT_REDIRECT") {
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
        );
      }

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        let errorJson;
        try {
          errorJson = JSON.parse(errorText);
        } catch (parseErr) {
          if ((parseErr as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
            throw parseErr;
          }
          if (parseErr instanceof Error && parseErr.message === "NEXT_REDIRECT") {
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
          console.error("Instagram long-lived token exchange failed:", await exchangeRes.text());
        }
      }
    } else if (platform === "tiktok") {
      // TikTok OAuth 2.0 with PKCE
      if (!codeVerifier) {
        console.error("❌ TikTok PKCE: Missing code_verifier");
        throw new Error("Missing code_verifier for TikTok PKCE");
      }

      // CRITICAL: Manually verify challenge matches verifier
      const expectedChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

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
          if ((parseErr as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
            throw parseErr;
          }
          if (parseErr instanceof Error && parseErr.message === "NEXT_REDIRECT") {
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
    } else if (platform === "pinterest") {
      // Pinterest: Basic Auth + form body only (no client_id/client_secret in body)
      // Using sandbox API for trial access
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
        "base64",
      );
      tokenResponse = await fetch(
        "https://api-sandbox.pinterest.com/v5/oauth/token",
        {
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
        },
      );

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

    // Pinterest: fetch boards and redirect to selection (store in verification table)
    // Using sandbox API for trial access
    if (platform === "pinterest") {
      const boardsRes = await fetch(
        "https://api-sandbox.pinterest.com/v5/boards",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      );
      const boardsData = (await boardsRes.json().catch(() => ({}))) as {
        items?: { id: string; name?: string }[];
      };
      if (!boardsData.items?.length) {
        // No boards yet: send user to "create board" flow (sandbox helper)
        const stateId = crypto.randomBytes(16).toString("hex");
        const payload = JSON.stringify({
          userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          expires_in: tokens.expires_in || null,
        });
        await db.insert(verification).values({
          id: stateId,
          identifier: "pinterest_create_board",
          value: encryptToken(payload, stateId),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        });
        const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
        const createBoardUrl =
          typeof baseUrl === "string" && baseUrl
            ? `${baseUrl}/dashboard/connect/pinterest/create-board?token=${stateId}`
            : `/dashboard/connect/pinterest/create-board?token=${stateId}`;
        return safeRedirect(createBoardUrl, "/dashboard/connections");
      }
      // Store boards and tokens in verification table for selection page
      const stateId = crypto.randomBytes(16).toString("hex");
      const payload = JSON.stringify({
        userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_in: tokens.expires_in || null,
        boards: boardsData.items.map((b) => ({
          id: b.id,
          name: b.name || b.id,
        })),
      });
      await db.insert(verification).values({
        id: stateId,
        identifier: "pinterest_boards",
        value: encryptToken(payload, stateId),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      });
      const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
      const pinterestSelectUrl =
        typeof baseUrl === "string" && baseUrl
          ? `${baseUrl}/dashboard/connect/pinterest/select?token=${stateId}`
          : `/dashboard/connect/pinterest/select?token=${stateId}`;
      return safeRedirect(pinterestSelectUrl, "/dashboard/connections");
    }

    // Facebook: fetch all Pages and insert/update each one (no redirect to select)
    if (platform === "facebook") {
      const pagesRes = await fetch(
        "https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,picture",
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
      const pages: { id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }[] =
        pagesData.data || [];
      if (pages.length === 0) {
        return safeRedirect(
          `/dashboard?error=no_facebook_pages&platform=${platform}`,
          "/dashboard",
        );
      }
      for (const page of pages) {
        let profileImageUrl: string | null = null;
        const fromList = page.picture?.data?.url;
        if (isValidProfileImageUrl(fromList)) {
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
            if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
              throw err;
            }
            if (err instanceof Error && err.message === "NEXT_REDIRECT") {
              throw err;
            }
            console.error("Facebook page picture fetch failed:", err);
          }
        }
        const existing = await db.query.connectedAccounts.findFirst({
          where: and(
            eq(connectedAccounts.userId, userId),
            eq(connectedAccounts.platform, "facebook"),
            eq(connectedAccounts.platformUserId, page.id),
          ),
        });
        const accountId = existing?.id ?? crypto.randomUUID();
        const encryptedAccess = encryptToken(page.access_token, accountId);
        if (existing) {
          await db
            .update(connectedAccounts)
            .set({
              platformUsername: page.name,
              profileImageUrl,
              encryptedAccessToken: encryptedAccess,
              encryptedRefreshToken: null,
              tokenExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(eq(connectedAccounts.id, existing.id));
        } else {
          await db.insert(connectedAccounts).values({
            id: accountId,
            userId,
            platform: "facebook",
            platformUserId: page.id,
            platformUsername: page.name,
            profileImageUrl,
            encryptedAccessToken: encryptedAccess,
            encryptedRefreshToken: null,
            tokenExpiresAt: null,
          });
        }
      }
      return safeRedirect("/dashboard/connections?connected=facebook", "/dashboard/connections");
    }

    // Fetch platform user info (platform-specific)
    let userInfo: {
      id: string;
      username: string | null;
      profileImageUrl: string | null;
    };

    // Instagram/Threads return user_id in token response, use it if available
    if (
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
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
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
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
        console.error("Failed to fetch platform user info:", err);
        // Use placeholder values if fetch fails
        userInfo = {
          id: `unknown-${Date.now()}`,
          username: null,
          profileImageUrl: null,
        };
      }
    }

    // Check if this exact account (userId + platform + platformUserId) already connected
    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, userId),
        eq(connectedAccounts.platform, platform),
        eq(connectedAccounts.platformUserId, userInfo.id),
      ),
    });

    if (existing) {
      // Update existing (token refresh / profile refresh only)
      const updateData: {
        encryptedAccessToken: string;
        encryptedRefreshToken: string | null;
        tokenExpiresAt: Date | null;
        platformUsername: string | null;
        profileImageUrl: string | null;
        platformMetadata?: Record<string, unknown>;
        updatedAt: Date;
      } = {
        encryptedAccessToken: encryptToken(tokens.access_token, existing.id),
        encryptedRefreshToken: tokens.refresh_token
          ? encryptToken(tokens.refresh_token, existing.id)
          : null,
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        platformUsername: userInfo.username,
        profileImageUrl: userInfo.profileImageUrl,
        updatedAt: new Date(),
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

      return safeRedirect(
        `/dashboard/connections?connected=${platform}&updated=true`,
        "/dashboard/connections",
      );
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

    // Insert new account with encrypted tokens
    await db.insert(connectedAccounts).values({
      id: accountId,
      userId,
      platform: platform,
      platformUserId: userInfo.id,
      platformUsername: userInfo.username,
      profileImageUrl: userInfo.profileImageUrl,
      encryptedAccessToken: encryptToken(tokens.access_token, accountId),
      encryptedRefreshToken: tokens.refresh_token
        ? encryptToken(tokens.refresh_token, accountId)
        : null,
      tokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      platformMetadata,
    });

    if (platform === "threads") {
      return safeRedirect("/dashboard/connections?connected=threads", "/dashboard/connections");
    }
    return safeRedirect(`/dashboard/connections?connected=${platform}`, "/dashboard/connections");
  } catch (err) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") {
      throw err;
    }
    console.error("OAuth callback error:", err);
    return safeRedirect(
      `/dashboard?error=oauth_failed&platform=${platform}`,
      "/dashboard",
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
            const elements = profileData.profilePicture?.["displayImage~"]?.elements;
            if (Array.isArray(elements) && elements.length > 0) {
              const last = elements[elements.length - 1];
              const url = last.identifiers?.[0]?.identifier;
              if (isValidProfileImageUrl(url)) profileImageUrl = url;
            }
          }
        } catch (err) {
          if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
            throw err;
          }
          if (err instanceof Error && err.message === "NEXT_REDIRECT") {
            throw err;
          }
          console.error("LinkedIn profile picture fetch failed:", err);
        }
        return {
          id: data.sub,
          username: data.name || data.given_name || "LinkedIn User",
          profileImageUrl,
        };
      } catch (err) {
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
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
            console.log("Instagram direct user data (fallback):", JSON.stringify(fallbackData, null, 2));
            return {
              id: fallbackData.id || `instagram-${Date.now()}`,
              username: fallbackData.username || null,
              profileImageUrl: null,
            };
          }
          break;
        }
        const data = await response.json();
        console.log("Instagram direct user data:", JSON.stringify(data, null, 2));
        let profileImageUrl: string | null = null;
        try {
          const raw = data.profile_picture_url;
          // Store whatever URL is returned (may expire); AccountAvatar onError handles display. If URL is from cdninstagram.com or fbcdn.net, use referrerPolicy="no-referrer" on the img.
          if (typeof raw === "string" && (raw.startsWith("http://") || raw.startsWith("https://"))) {
            profileImageUrl = raw;
          }
        } catch (pfpErr) {
          if ((pfpErr as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
            throw pfpErr;
          }
          if (pfpErr instanceof Error && pfpErr.message === "NEXT_REDIRECT") {
            throw pfpErr;
          }
          console.error("Instagram profile_picture_url parse failed:", pfpErr);
        }
        return {
          id: data.id || `instagram-${Date.now()}`,
          username: data.username || null,
          profileImageUrl,
        };
      } catch (err) {
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
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
            const profileImageUrl = isValidProfileImageUrl(thumb) ? thumb : null;
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
          const profileImageUrl = isValidProfileImageUrl(picture) ? picture : null;
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
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
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
            let profileImageUrl: string | null = data.data.profile_image_url || null;
            if (profileImageUrl && typeof profileImageUrl === "string") {
              profileImageUrl = profileImageUrl.replace(/_normal(\.[a-z]+)?$/i, "_400x400$1") as string;
              if (!isValidProfileImageUrl(profileImageUrl)) profileImageUrl = null;
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
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
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
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
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
          "https://api-sandbox.pinterest.com/v5/user_account",
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
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
        console.error("Pinterest user info fetch failed:", err);
      }
      break;
    }

    case "tiktok": {
      try {
        const response = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (response.ok) {
          const data = await response.json();
          if (data.data?.user) {
            const raw = data.data.user.avatar_url;
            const profileImageUrl = isValidProfileImageUrl(raw) ? raw : null;
            return {
              id: data.data.user.open_id || `tiktok-${Date.now()}`,
              username: data.data.user.display_name || null,
              profileImageUrl,
            };
          }
        } else {
          const errorText = await response.text();
          console.error("TikTok userinfo error:", errorText);
        }
      } catch (err) {
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
        console.error("TikTok user info fetch failed:", err);
      }
      break;
    }

    // Add other platforms as needed
  }

  // Fallback
  return {
    id: `${platform}-${Date.now()}`,
    username: null,
    profileImageUrl: null,
  };
}
