import { PLATFORM_OAUTH_CONFIG, Platform } from "@/lib/platforms";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/lib/env";
import { decrypt, encryptToken } from "@/lib/encryption";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { normalizeAppUrl } from "@/lib/url-utils";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: Platform }> },
) {
  const { platform } = await params;
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

  // Decrypt state to get userId (and code_verifier for X/Twitter PKCE)
  let userId: string;
  let codeVerifier: string | undefined;
  try {
    const decrypted = decrypt(state);
    userId = decrypted.userId;
    codeVerifier = decrypted.codeVerifier; // For X/Twitter PKCE
    if (decrypted.platform !== platform) {
      return redirect(
        `/dashboard?error=state_mismatch&platform=${platform}`,
      );
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

    // Handle Mastodon instance URL (decentralized platform)
    let tokenUrl = config.tokenUrl;
    if (platform === "mastodon" && env.MASTODON_INSTANCE_URL) {
      const instanceUrl = env.MASTODON_INSTANCE_URL.replace(/\/$/, ""); // Remove trailing slash
      tokenUrl = `${instanceUrl}/oauth/token`;
    }

    if (platform === "instagram" || platform === "threads") {
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

    case "mastodon":
      // Mastodon API - get account info
      try {
        const instanceUrl = env.MASTODON_INSTANCE_URL?.replace(/\/$/, "") || "https://mastodon.social";
        const response = await fetch(
          `${instanceUrl}/api/v1/accounts/verify_credentials`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (response.ok) {
          const data = await response.json();
          return {
            id: data.id || `mastodon-${Date.now()}`,
            username: data.username || data.acct || null,
            profileImageUrl: data.avatar || data.avatar_static || null,
          };
        } else {
          const errorText = await response.text();
          console.error("Mastodon userinfo error:", errorText);
        }
      } catch (err) {
        console.error("Mastodon user info fetch failed:", err);
      }
      break;

    case "bluesky":
      // Bluesky AT Protocol - get profile info
      try {
        const response = await fetch(
          "https://bsky.social/xrpc/com.atproto.identity.resolveHandle",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              handle: "me", // Resolve own handle
            }),
          },
        );
        if (response.ok) {
          const data = await response.json();
          // Then fetch profile
          const profileResponse = await fetch(
            `https://bsky.social/xrpc/com.atproto.repo.getRecord?repo=${data.did}&collection=app.bsky.actor.profile&rkey=self`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            return {
              id: data.did || `bluesky-${Date.now()}`,
              username: data.handle || null,
              profileImageUrl: profileData.value?.avatar?.ref || null,
            };
          }
          // Fallback to just DID/handle
          return {
            id: data.did || `bluesky-${Date.now()}`,
            username: data.handle || null,
            profileImageUrl: null,
          };
        } else {
          const errorText = await response.text();
          console.error("Bluesky userinfo error:", errorText);
        }
      } catch (err) {
        console.error("Bluesky user info fetch failed:", err);
      }
      break;

    case "peerlist":
      // Peerlist API - get user info
      // Note: Verify Peerlist API documentation for correct endpoint
      try {
        const response = await fetch(
          "https://peerlist.io/api/v1/me",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (response.ok) {
          const data = await response.json();
          return {
            id: data.id || data.user_id || `peerlist-${Date.now()}`,
            username: data.username || data.name || null,
            profileImageUrl: data.avatar || data.profile_image || null,
          };
        } else {
          const errorText = await response.text();
          console.error("Peerlist userinfo error:", errorText);
        }
      } catch (err) {
        console.error("Peerlist user info fetch failed:", err);
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
