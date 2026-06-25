import { getValidToken } from "./token-refresh.js";

type AccountForAvatar = {
  id: string;
  platform: string;
  platformUserId: string;
  profileImageUrl: string | null;
  platformMetadata: Record<string, unknown> | null;
};

function isHttpUrl(url: unknown): url is string {
  return (
    typeof url === "string" &&
    (url.startsWith("http://") || url.startsWith("https://"))
  );
}

/** Whether the browser should load this avatar via our proxy (Meta CDNs block hotlinking). */
export function shouldProxyAccountAvatar(
  platform: string | undefined,
  profileImageUrl: string | null | undefined,
): boolean {
  if (platform === "facebook" || platform === "instagram") return true;
  const u = profileImageUrl?.toLowerCase() ?? "";
  return (
    u.includes("fbcdn.net") ||
    u.includes("cdninstagram.com") ||
    u.includes("instagram.") ||
    u.includes("facebook.com")
  );
}

/** Resolve a fresh remote avatar URL using the platform access token. */
export async function fetchRemoteAvatarUrl(
  account: AccountForAvatar,
): Promise<string | null> {
  let accessToken: string;
  try {
    accessToken = await getValidToken(account.id, account.platform);
  } catch {
    return account.profileImageUrl;
  }

  const metadata = account.platformMetadata ?? {};

  if (account.platform === "facebook") {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${account.platformUserId}/picture?type=large&redirect=false`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          data?: { url?: string; is_silhouette?: boolean };
        };
        const url = data.data?.url;
        if (isHttpUrl(url) && !data.data?.is_silhouette) return url;
      }
    } catch (e) {
      console.warn("[account-avatar] Facebook picture fetch failed:", e);
    }
  }

  if (account.platform === "instagram") {
    const connectionMethod = metadata.connectionMethod;
    try {
      if (connectionMethod === "facebook-page") {
        const igId =
          (typeof metadata.instagramBusinessAccountId === "string"
            ? metadata.instagramBusinessAccountId
            : null) ?? account.platformUserId;
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${igId}?fields=profile_picture_url`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) {
          const data = (await res.json()) as { profile_picture_url?: string };
          if (isHttpUrl(data.profile_picture_url)) return data.profile_picture_url;
        }
      } else {
        const res = await fetch(
          `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${encodeURIComponent(accessToken)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { profile_picture_url?: string };
          if (isHttpUrl(data.profile_picture_url)) return data.profile_picture_url;
        }
      }
    } catch (e) {
      console.warn("[account-avatar] Instagram picture fetch failed:", e);
    }
  }

  return account.profileImageUrl;
}

export async function fetchAvatarBytes(
  remoteUrl: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(remoteUrl, { redirect: "follow" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0) return null;
    return { body, contentType };
  } catch (e) {
    console.warn("[account-avatar] image download failed:", e);
    return null;
  }
}
