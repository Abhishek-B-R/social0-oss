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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform: platformParam } = await params;
  
  // Validate platform is a valid Platform type (including BYOK platforms)
  const validPlatforms: Platform[] = ["linkedin", "instagram", "youtube", "pinterest", "tiktok", "twitter_x", "threads", "bluesky", "facebook"];
  if (!validPlatforms.includes(platformParam as Platform)) {
    return redirect(`/dashboard?error=invalid_platform&platform=${platformParam}`);
  }
  
  const platform = platformParam as Platform;
  
  // Check if platform uses OAuth (not BYOK)
  if (!PLATFORM_OAUTH_CONFIG[platform]) {
    return redirect(
      `/dashboard?error=platform_not_configured&platform=${platform}`,
    );
  }
  const url = new URL(req.url);
  
  // Instagram appends #_ to redirect URI - strip it
  if (url.hash === "#_") {
    url.hash = "";
  }
  
  const { searchParams } = url;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    return redirect(
      `/dashboard?error=oauth_failed&platform=${platform}`,
    );
  }

  if (!code || !state) {
    return redirect(
      `/dashboard?error=invalid_callback&platform=${platform}`,
    );
  }

  // Decrypt state to get userId (and stateId for TikTok PKCE verifier lookup)
  let userId: string;
  let codeVerifier: string | undefined;
  try {
    const decrypted = decrypt(state);
    userId = decrypted.userId;
    
    if (decrypted.platform !== platform) {
      return redirect(
        `/dashboard?error=state_mismatch&platform=${platform}`,
      );
    }

    // TikTok: Retrieve verifier from DB using stateId
    if (platform === "tiktok" && decrypted.stateId) {
      const verifierRecord = await db.query.verification.findFirst({
        where: eq(verification.id, decrypted.stateId),
      });

      if (!verifierRecord || new Date(verifierRecord.expiresAt) < new Date()) {
        console.error("❌ TikTok PKCE: Verifier not found or expired", {
          stateId: decrypted.stateId,
          found: !!verifierRecord,
          expired: verifierRecord ? new Date(verifierRecord.expiresAt) < new Date() : true,
        });
        return redirect(
          `/dashboard?error=verifier_expired&platform=${platform}`,
        );
      }

      codeVerifier = verifierRecord.value;
      
      // CRITICAL DEBUG LOGGING
      console.log("🔍 TikTok PKCE Callback Debug:", {
        stateId: decrypted.stateId,
        verifierLength: codeVerifier.length,
        verifierPreview: codeVerifier.substring(0, 20) + "...",
      });

      // Clean up verifier from DB (one-time use)
      await db.delete(verification).where(eq(verification.id, decrypted.stateId));
    }

    // X (Twitter): Retrieve code_verifier from cookie
    if (platform === "twitter_x") {
      const cookieStore = await cookies();
      const verifierCookie = cookieStore.get("twitter_code_verifier");
      
      if (!verifierCookie?.value) {
        console.error("❌ X PKCE: Missing code_verifier cookie");
        return redirect(
          `/dashboard?error=verifier_missing&platform=${platform}`,
        );
      }

      codeVerifier = verifierCookie.value;
      
      console.log("🔍 X PKCE Callback Debug:", {
        verifierLength: codeVerifier.length,
        verifierPreview: codeVerifier.substring(0, 20) + "...",
      });

      // Delete cookie after use (one-time use)
      cookieStore.delete("twitter_code_verifier");
    }
  } catch (err) {
    console.error("Failed to decrypt state:", err);
    return redirect(
      `/dashboard?error=invalid_state&platform=${platform}`,
    );
  }

  const config = PLATFORM_OAUTH_CONFIG[platform];
  if (!config) {
    return redirect(
      `/dashboard?error=platform_not_configured&platform=${platform}`,
    );
  }

  // Get client ID and secret from env
  const clientId = env[config.clientIdEnv as keyof typeof env] as string;
  const clientSecret = env[
    config.clientSecretEnv as keyof typeof env
  ] as string;

  if (!clientId || !clientSecret) {
    return redirect(
      `/dashboard?error=credentials_not_configured&platform=${platform}`,
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

    if (platform === "instagram" || platform === "threads" || platform === "facebook") {
      // Instagram and Threads use Meta Graph API (same format)
      tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(`${platform} token exchange failed:`, errorText);
        throw new Error("Token exchange failed");
      }

      tokens = await tokenResponse.json();
      // Meta Graph API returns: { access_token, token_type, expires_in }
      // Normalize to standard format
      if (tokens.access_token && !tokens.refresh_token) {
        // Tokens expire in 1 hour (3600 seconds) initially
        tokens.expires_in = tokens.expires_in || 3600;
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
      
      console.log("🔍 TikTok Token Exchange Debug:", {
        verifierLength: codeVerifier.length,
        verifierPreview: codeVerifier.substring(0, 20) + "...",
        expectedChallengePreview: expectedChallenge.substring(0, 20) + "...",
        codeLength: code?.length,
        redirectUri,
      });

      const tokenRequestBody = new URLSearchParams({
        client_key: clientId, // TikTok uses client_key instead of client_id
        client_secret: clientSecret,
        code: code!,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: codeVerifier, // Required for PKCE
      });

      console.log("🔍 TikTok Token Request Body:", {
        client_key: clientId.substring(0, 10) + "...",
        hasCode: !!code,
        hasVerifier: !!codeVerifier,
        bodyLength: tokenRequestBody.toString().length,
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
        } catch {
          errorJson = { raw: errorText };
        }
        
        console.error("❌ TikTok token exchange failed:", {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorJson,
          rawError: errorText,
        });
        
        throw new Error(`TikTok token exchange failed: ${errorJson.error_description || errorJson.error || errorText}`);
      }

      tokens = await tokenResponse.json();
      console.log("✅ TikTok token exchange successful:", {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });
    } else if (platform === "twitter_x") {
      // X (Twitter) OAuth 2.0 with PKCE
      if (!codeVerifier) {
        console.error("❌ X PKCE: Missing code_verifier");
        throw new Error("Missing code_verifier for X PKCE");
      }

      // X requires Basic Auth header with client_id:client_secret
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const tokenRequestBody = new URLSearchParams({
        grant_type: "authorization_code",
        code: code!,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier, // Required for PKCE
      });

      console.log("🔍 X Token Exchange Debug:", {
        verifierLength: codeVerifier.length,
        hasCode: !!code,
        redirectUri,
      });

      tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: tokenRequestBody,
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        let errorJson;
        try {
          errorJson = JSON.parse(errorText);
        } catch {
          errorJson = { raw: errorText };
        }
        
        console.error("❌ X token exchange failed:", {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorJson,
          rawError: errorText,
        });
        
        throw new Error(`X token exchange failed: ${errorJson.error_description || errorJson.error || errorText}`);
      }

      tokens = await tokenResponse.json();
      console.log("✅ X token exchange successful:", {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
        tokenType: tokens.token_type,
      });
    } else {
      // Standard OAuth 2.0 flow (LinkedIn, YouTube, Mastodon, Bluesky, Peerlist)
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
        const errorText = await tokenResponse.text();
        console.error("Token exchange failed:", errorText);
        throw new Error("Token exchange failed");
      }

      tokens = await tokenResponse.json();
    }

    // Facebook: fetch Pages and either save one or redirect to page selection
    if (platform === "facebook") {
      const pagesRes = await fetch(
        "https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token",
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        },
      );
      if (!pagesRes.ok) {
        console.error("Facebook pages fetch failed:", await pagesRes.text());
        return redirect(
          `/dashboard?error=oauth_failed&platform=${platform}`,
        );
      }
      const pagesData = await pagesRes.json();
      const pages: { id: string; name: string; access_token: string }[] =
        pagesData.data || [];
      if (pages.length === 0) {
        return redirect(
          `/dashboard?error=no_facebook_pages&platform=${platform}`,
        );
      }
      if (pages.length === 1) {
        const page = pages[0];
        const accountId = crypto.randomUUID();
        await db.insert(connectedAccounts).values({
          id: accountId,
          userId,
          platform: "facebook",
          platformUserId: page.id,
          platformUsername: page.name,
          profileImageUrl: null,
          encryptedAccessToken: encryptToken(page.access_token, accountId),
          encryptedRefreshToken: null,
          tokenExpiresAt: null,
        });
        return redirect(`/dashboard?connected=facebook`);
      }
      // Multiple pages: store in verification and redirect to select
      const stateId = crypto.randomBytes(16).toString("hex");
      const payload = JSON.stringify({
        userId,
        pages: pages.map((p) => ({ id: p.id, name: p.name, access_token: p.access_token })),
      });
      await db.insert(verification).values({
        id: stateId,
        identifier: "facebook_pages",
        value: encryptToken(payload, stateId),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
      return redirect(`${baseUrl}/dashboard/connect/facebook/select?token=${stateId}`);
    }

    // Check if account already connected
    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, userId),
        eq(connectedAccounts.platform, platform),
      ),
    });

    // Fetch platform user info (platform-specific)
    let userInfo: {
      id: string;
      username: string | null;
      profileImageUrl: string | null;
    };

    // Instagram/Threads return user_id in token response, use it if available
    if ((platform === "instagram" || platform === "threads") && tokens.user_id) {
      try {
        userInfo = await fetchPlatformUserInfo(platform, tokens.access_token);
        // Use user_id from token response as fallback
        if (!userInfo.id || userInfo.id.startsWith(`${platform}-`)) {
          userInfo.id = tokens.user_id;
        }
      } catch (err) {
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
        console.error("Failed to fetch platform user info:", err);
        // Use placeholder values if fetch fails
        userInfo = {
          id: `unknown-${Date.now()}`,
          username: null,
          profileImageUrl: null,
        };
      }
    }

    if (existing) {
      // Update existing
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken: encryptToken(
            tokens.access_token,
            existing.id,
          ),
          encryptedRefreshToken: tokens.refresh_token
            ? encryptToken(tokens.refresh_token, existing.id)
            : null,
          tokenExpiresAt: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : null,
          platformUserId: userInfo.id,
          platformUsername: userInfo.username,
          profileImageUrl: userInfo.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));

      return redirect(`/dashboard?connected=${platform}&updated=true`);
    }

    // Generate UUID for account ID (needed for encryption)
    const accountId = crypto.randomUUID();

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
    });

    return redirect(`/dashboard?connected=${platform}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return redirect(
      `/dashboard?error=oauth_failed&platform=${platform}`,
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
    case "linkedin":
      // LinkedIn OpenID Connect userinfo endpoint
      try {
        const response = await fetch(
          "https://api.linkedin.com/v2/userinfo",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (response.ok) {
          const data = await response.json();
          return {
            id: data.sub || `linkedin-${Date.now()}`,
            username: data.name || data.given_name || null,
            profileImageUrl: data.picture || null,
          };
        } else {
          const errorText = await response.text();
          console.error("LinkedIn userinfo error:", errorText);
        }
      } catch (err) {
        console.error("LinkedIn user info fetch failed:", err);
      }
      break;

    case "instagram":
      // Instagram Graph API - get user info
      try {
        const response = await fetch(
          `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${accessToken}`,
        );
        if (response.ok) {
          const data = await response.json();
          return {
            id: data.id || `instagram-${Date.now()}`,
            username: data.username || null,
            profileImageUrl: null, // Instagram Graph API doesn't provide profile image in basic query
          };
        } else {
          const errorText = await response.text();
          console.error("Instagram Graph API userinfo error:", errorText);
        }
      } catch (err) {
        console.error("Instagram user info fetch failed:", err);
      }
      break;

    case "youtube":
      // YouTube Data API v3 - get channel info
      try {
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&access_token=${accessToken}`,
        );
        if (response.ok) {
          const data = await response.json();
          if (data.items && data.items.length > 0) {
            const channel = data.items[0];
            return {
              id: channel.id || `youtube-${Date.now()}`,
              username: channel.snippet?.title || channel.snippet?.customUrl || null,
              profileImageUrl: channel.snippet?.thumbnails?.default?.url || null,
            };
          }
        } else {
          const errorText = await response.text();
          console.error("YouTube userinfo error:", errorText);
        }
      } catch (err) {
        console.error("YouTube user info fetch failed:", err);
      }
      break;

    case "twitter_x":
      // X (Twitter) API v2 - get user info
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
            return {
              id: data.data.id || `twitter_x-${Date.now()}`,
              username: data.data.username || data.data.name || null,
              profileImageUrl: data.data.profile_image_url || null,
            };
          }
        } else {
          const errorText = await response.text();
          console.error("X/Twitter userinfo error:", errorText);
        }
      } catch (err) {
        console.error("X/Twitter user info fetch failed:", err);
      }
      break;

    case "threads":
      // Threads Graph API - get user info
      try {
        const response = await fetch(
          `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${accessToken}`,
        );
        if (response.ok) {
          const data = await response.json();
          return {
            id: data.id || `threads-${Date.now()}`,
            username: data.username || null,
            profileImageUrl: null, // Threads API doesn't provide profile image in basic query
          };
        } else {
          const errorText = await response.text();
          console.error("Threads Graph API userinfo error:", errorText);
        }
      } catch (err) {
        console.error("Threads user info fetch failed:", err);
      }
      break;

    case "pinterest":
      // Pinterest API v5 - get user info
      try {
        const response = await fetch(
          "https://api.pinterest.com/v5/user_account",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (response.ok) {
          const data = await response.json();
          return {
            id: data.id || data.username || `pinterest-${Date.now()}`,
            username: data.username || null,
            profileImageUrl: data.profile_image || null,
          };
        } else {
          const errorText = await response.text();
          console.error("Pinterest userinfo error:", errorText);
        }
      } catch (err) {
        console.error("Pinterest user info fetch failed:", err);
      }
      break;

    case "tiktok":
      // TikTok API v2 - get user info
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
          if (data.data && data.data.user) {
            return {
              id: data.data.user.open_id || `tiktok-${Date.now()}`,
              username: data.data.user.display_name || null,
              profileImageUrl: data.data.user.avatar_url || null,
            };
          }
        } else {
          const errorText = await response.text();
          console.error("TikTok userinfo error:", errorText);
        }
      } catch (err) {
        console.error("TikTok user info fetch failed:", err);
      }
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
