import type { Platform } from "@/lib/platforms";
import { env } from "@/lib/env";

/**
 * Revoke the OAuth access token on the platform (best effort).
 * Used when disconnecting an account so the platform drops the grant.
 * Never throws — log and continue so we still hard-delete the account locally.
 */
export async function revokeTokenOnPlatform(
  platform: Platform,
  accessToken: string,
): Promise<void> {
  if (!accessToken?.trim()) return;

  try {
    switch (platform) {
      case "linkedin": {
        const clientId = env.LINKEDIN_CLIENT_ID;
        const clientSecret = env.LINKEDIN_CLIENT_SECRET;
        if (!clientId || !clientSecret) return;
        const res = await fetch("https://www.linkedin.com/oauth/v2/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            token: accessToken,
          }).toString(),
        });
        if (!res.ok) {
          console.warn("[revoke] LinkedIn revoke failed:", res.status);
        }
        return;
      }
      case "youtube": {
        const res = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: accessToken }).toString(),
        });
        if (!res.ok) {
          console.warn("[revoke] Google revoke failed:", res.status);
        }
        return;
      }
      case "instagram":
      case "facebook":
      case "threads":
        // Meta: no standard revoke for app-scoped tokens; deleting locally is sufficient.
        return;
      case "pinterest":
      case "tiktok":
      case "twitter_x":
      case "bluesky":
        // No revoke endpoint or BYOK; deleting locally is sufficient.
        return;
      default:
        return;
    }
  } catch (err) {
    console.warn("[revoke] Token revoke error for", platform, err);
  }
}
