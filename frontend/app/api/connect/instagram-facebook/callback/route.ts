import { db } from "@/db";
import { connectedAccounts, verification } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/lib/env";
import { decrypt, encryptToken } from "@/lib/encryption";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { normalizeAppUrl } from "@/lib/url-utils";
import { NextRequest } from "next/server";

/** Ensure we only ever redirect to a string URL. Passing an object (e.g. from state/callbackUrl) would 404. */
function safeRedirect(url: unknown, fallback: string): never {
  const s =
    typeof url === "string" && url.trim().length > 0 && (url.startsWith("/") || url.startsWith("http"))
      ? url.trim()
      : fallback;
  return redirect(s);
}

export async function GET(
  req: NextRequest,
) {
  const url = new URL(req.url);
  const { searchParams } = url;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    return safeRedirect(
      `/dashboard?error=oauth_failed&platform=instagram`,
      "/dashboard",
    );
  }

  if (!code || !state) {
    return safeRedirect(
      `/dashboard?error=invalid_callback&platform=instagram`,
      "/dashboard",
    );
  }

  // Decrypt state to get userId
  let userId: string;
  try {
    const decrypted = decrypt(state);
    userId = decrypted.userId;
    
    if (decrypted.platform !== "instagram-facebook") {
      return safeRedirect(
        `/dashboard?error=state_mismatch&platform=instagram`,
        "/dashboard",
      );
    }
  } catch (err) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") {
      throw err;
    }
    console.error("Failed to decrypt state:", err);
    return safeRedirect(
      `/dashboard?error=invalid_state&platform=instagram`,
      "/dashboard",
    );
  }

  const clientId = env.FACEBOOK_CLIENT_ID;
  const clientSecret = env.FACEBOOK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return safeRedirect(
      `/dashboard?error=credentials_not_configured&platform=instagram`,
      "/dashboard",
    );
  }

  const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
  const redirectUri = `${baseUrl}/api/connect/instagram-facebook/callback`;
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
        `/dashboard?error=oauth_failed&platform=instagram`,
        "/dashboard",
      );
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;

    if (!accessToken) {
      console.error("No access token in response:", tokens);
      return safeRedirect(
        `/dashboard?error=oauth_failed&platform=instagram`,
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
        `/dashboard?error=oauth_failed&platform=instagram`,
        "/dashboard",
      );
    }

    const pagesData = await pagesRes.json();
    const pages: { id: string; name: string; access_token: string }[] =
      pagesData.data || [];

    if (pages.length === 0) {
      return safeRedirect(
        `/dashboard?error=no_facebook_pages&platform=instagram`,
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
            if ((pfpErr as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
              throw pfpErr;
            }
            if (pfpErr instanceof Error && pfpErr.message === "NEXT_REDIRECT") {
              throw pfpErr;
            }
            console.error("Instagram FB profile_picture_url parse failed:", pfpErr);
          }
        } catch (err) {
          if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
            throw err;
          }
          if (err instanceof Error && err.message === "NEXT_REDIRECT") {
            throw err;
          }
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
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        if (err instanceof Error && err.message === "NEXT_REDIRECT") {
          throw err;
        }
        console.error(`Error checking Instagram for Page ${page.id}:`, err);
        continue;
      }
    }

    if (pagesWithInstagram.length === 0) {
      return safeRedirect(
        `/dashboard?error=no_instagram_linked&platform=instagram`,
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

        return safeRedirect(
          `/dashboard/connections?connected=instagram&updated=true`,
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

      return safeRedirect(
        `/dashboard/connections?connected=instagram`,
        "/dashboard/connections",
      );
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
      `/dashboard/connect/instagram-facebook/select?token=${stateId}`,
      "/dashboard/connections",
    );
  } catch (err) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") {
      throw err;
    }
    console.error("Instagram-Facebook OAuth callback error:", err);
    return safeRedirect(
      `/dashboard?error=oauth_failed&platform=instagram`,
      "/dashboard",
    );
  }
}
