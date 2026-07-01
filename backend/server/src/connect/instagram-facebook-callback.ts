import { db } from "../db/index.js";
import { connectedAccounts, verification } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { env } from "../lib/env.js";
import { decrypt, encryptToken } from "../lib/encryption.js";
import { assertOAuthCallbackSession } from "../lib/oauth-callback-session.js";
import { sanitizeReturnToPath } from "../lib/safe-return-to.js";
import crypto from "crypto";
import { getConnectCallbackBaseUrl } from "../lib/app-url.js";
import { safeRedirect, rethrowRouteRedirect } from "../lib/redirect.js";
import { checkAccountLimits } from "../lib/plan-limits.js";
import { AppRequest } from "../lib/http/http.js";

export async function igFbCallback(
  req: AppRequest,
) {
  const url = new URL(req.url);
  const { searchParams } = url;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    return safeRedirect(
      `/dashboard/connections?error=oauth_failed&platform=instagram`,
      "/dashboard",
    );
  }

  if (!code || !state) {
    return safeRedirect(
      `/dashboard/connections?error=invalid_callback&platform=instagram`,
      "/dashboard",
    );
  }

  // Decrypt state to get userId
  let userId: string;
  let successRedirect = "/dashboard/connections";
  try {
    const decrypted = decrypt(state);
    userId = decrypted.userId;
    await assertOAuthCallbackSession(req, userId, "instagram-facebook");
    const returnTo = sanitizeReturnToPath(decrypted.returnTo);
    if (returnTo) {
      successRedirect = returnTo;
    }

    if (decrypted.platform !== "instagram-facebook") {
      return safeRedirect(
        `/dashboard/connections?error=state_mismatch&platform=instagram`,
        "/dashboard",
      );
    }
  } catch (err) {
    rethrowRouteRedirect(err);
    console.error("Failed to decrypt state:", err);
    return safeRedirect(
      `/dashboard/connections?error=invalid_state&platform=instagram`,
      "/dashboard",
    );
  }

  const clientId = env.FACEBOOK_CLIENT_ID;
  const clientSecret = env.FACEBOOK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return safeRedirect(
      `/dashboard/connections?error=credentials_not_configured&platform=instagram`,
      "/dashboard",
    );
  }

  const redirectUri = `${getConnectCallbackBaseUrl()}/api/connect/instagram-facebook/callback`;
  // Use latest API version (v21.0) to match OAuth dialog
  const tokenUrl = "https://graph.facebook.com/v21.0/oauth/access_token";

  try {
    // Exchange code for Facebook access token
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Facebook token exchange failed:", errorText);
      return safeRedirect(
        `/dashboard/connections?error=oauth_failed&platform=instagram`,
        "/dashboard",
      );
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;

    if (!accessToken) {
      console.error("No access token in response:", tokens);
      return safeRedirect(
        `/dashboard/connections?error=oauth_failed&platform=instagram`,
        "/dashboard",
      );
    }

    // Fetch user's Facebook Pages
    const pagesRes = await fetch(
      "https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!pagesRes.ok) {
      console.error("Facebook pages fetch failed:", await pagesRes.text());
      return safeRedirect(
        `/dashboard/connections?error=oauth_failed&platform=instagram`,
        "/dashboard",
      );
    }

    const pagesData = await pagesRes.json();
    const pages: { id: string; name: string; access_token: string }[] =
      pagesData.data || [];

    if (pages.length === 0) {
      return safeRedirect(
        `/dashboard/connections?error=no_facebook_pages&platform=instagram`,
        "/dashboard",
      );
    }

    // For each Page, check if it has a linked Instagram account
    const pagesWithInstagram: Array<{
      pageId: string;
      pageName: string;
      pageAccessToken: string;
      instagramAccountId: string;
      instagramUsername: string | null;
      instagramProfilePictureUrl: string | null;
    }> = [];

    for (const page of pages) {
      try {
        // Check if Page has Instagram account
        const pageDetailsRes = await fetch(
          `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account`,
          {
            headers: {
              Authorization: `Bearer ${page.access_token}`,
            },
          },
        );

        if (!pageDetailsRes.ok) {
          console.warn(`Failed to fetch Instagram for Page ${page.id}:`, await pageDetailsRes.text());
          continue;
        }

        const pageDetails = await pageDetailsRes.json();
        const instagramBusinessAccountId = pageDetails.instagram_business_account?.id;

        if (!instagramBusinessAccountId) {
          // Page doesn't have Instagram linked
          continue;
        }

        // Fetch Instagram account details (id, username, profile_picture_url via Facebook Graph)
        let instagramData: { id?: string; username?: string; profile_picture_url?: string };
        let instagramProfilePictureUrl: string | null = null;
        try {
          const instagramRes = await fetch(
            `https://graph.facebook.com/v18.0/${instagramBusinessAccountId}?fields=id,username,profile_picture_url`,
            {
              headers: {
                Authorization: `Bearer ${page.access_token}`,
              },
            },
          );

          if (!instagramRes.ok) {
            console.warn(`Failed to fetch Instagram details for ${instagramBusinessAccountId}:`, await instagramRes.text());
            continue;
          }

          instagramData = await instagramRes.json();
          console.log("Instagram FB user data:", JSON.stringify(instagramData, null, 2));
          try {
            const rawUrl = instagramData.profile_picture_url;
            // Store whatever URL is returned (may expire); AccountAvatar onError handles display. If URL is from cdninstagram.com or fbcdn.net, use referrerPolicy="no-referrer" on the img.
            if (typeof rawUrl === "string" && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))) {
              instagramProfilePictureUrl = rawUrl;
            }
          } catch (pfpErr) {
          rethrowRouteRedirect(pfpErr);
            console.error("Instagram FB profile_picture_url parse failed:", pfpErr);
          }
        } catch (err) {
          rethrowRouteRedirect(err);
          console.error(`Error fetching Instagram details for ${instagramBusinessAccountId}:`, err);
          continue;
        }

        pagesWithInstagram.push({
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
          instagramAccountId: instagramData.id ?? instagramBusinessAccountId,
          instagramUsername: instagramData.username || null,
          instagramProfilePictureUrl,
        });
      } catch (err) {
        rethrowRouteRedirect(err);
        console.error(`Error checking Instagram for Page ${page.id}:`, err);
        continue;
      }
    }

    if (pagesWithInstagram.length === 0) {
      return safeRedirect(
        `/dashboard/connections?error=no_instagram_linked&platform=instagram`,
        "/dashboard",
      );
    }

    // If only one Page with Instagram, save it directly
    if (pagesWithInstagram.length === 1) {
      const pageData = pagesWithInstagram[0];
      const accountId = crypto.randomUUID();

      // Check if account already connected
      const existing = await db.query.connectedAccounts.findFirst({
        where: and(
          eq(connectedAccounts.userId, userId),
          eq(connectedAccounts.platform, "instagram"),
          eq(connectedAccounts.platformUserId, pageData.instagramAccountId),
        ),
      });

      if (existing) {
        // Update existing (reconnect: set isActive so it shows in UI)
        await db
          .update(connectedAccounts)
          .set({
            encryptedAccessToken: encryptToken(pageData.pageAccessToken, existing.id),
            encryptedRefreshToken: null,
            tokenExpiresAt: null,
            platformUsername: pageData.instagramUsername,
            profileImageUrl: pageData.instagramProfilePictureUrl,
            platformMetadata: {
              facebookPageId: pageData.pageId,
              instagramBusinessAccountId: pageData.instagramAccountId,
              connectionMethod: "facebook-page",
            },
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(connectedAccounts.id, existing.id));

        return safeRedirect(successRedirect, successRedirect);
      }

      const igLimitCheck = await checkAccountLimits(userId, "instagram");
      if (!igLimitCheck.allowed) {
        return safeRedirect(
          `/dashboard/connections?error=limit_reached&message=${encodeURIComponent(igLimitCheck.reason ?? "You need an active plan to connect accounts and post content.")}`,
          "/dashboard/connections",
        );
      }

      // Insert new account
      await db.insert(connectedAccounts).values({
        id: accountId,
        userId,
        platform: "instagram",
        platformUserId: pageData.instagramAccountId,
        platformUsername: pageData.instagramUsername,
        profileImageUrl: pageData.instagramProfilePictureUrl,
        encryptedAccessToken: encryptToken(pageData.pageAccessToken, accountId),
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        isActive: true,
        platformMetadata: {
          facebookPageId: pageData.pageId,
          instagramBusinessAccountId: pageData.instagramAccountId,
          connectionMethod: "facebook-page",
        },
      });

      return safeRedirect(successRedirect, successRedirect);
    }

    // Multiple Pages with Instagram: store in verification and redirect to selection
    const stateId = crypto.randomBytes(16).toString("hex");
    const payload = JSON.stringify({
      userId,
      pages: pagesWithInstagram.map((p) => ({
        pageId: p.pageId,
        pageName: p.pageName,
        pageAccessToken: p.pageAccessToken,
        instagramAccountId: p.instagramAccountId,
        instagramUsername: p.instagramUsername,
        instagramProfilePictureUrl: p.instagramProfilePictureUrl,
      })),
    });

    await db.insert(verification).values({
      id: stateId,
      identifier: "instagram_facebook_pages",
      value: encryptToken(payload, stateId),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    return safeRedirect(
      `/dashboard/connections/instagram/select?token=${stateId}&returnTo=${encodeURIComponent(successRedirect)}`,
      successRedirect,
    );
  } catch (err) {
    rethrowRouteRedirect(err);
    console.error("Instagram-Facebook OAuth callback error:", err);
    return safeRedirect(
      `/dashboard/connections?error=oauth_failed&platform=instagram`,
      "/dashboard",
    );
  }
}
