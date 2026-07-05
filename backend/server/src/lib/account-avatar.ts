import { isSafeOutboundUrl, safeFetch } from "@social0/shared";
import { isSafeResolvedOutboundUrl } from "./ssrf-resolve.js";
import { getValidToken } from "./token-refresh.js";
import { fetchTikTokConnectProfile } from "./tiktok-connect.js";

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

function isAvatarCdnUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("fbcdn.net") ||
    lower.includes("cdninstagram.com") ||
    lower.includes("instagram.") ||
    lower.includes("facebook.com") ||
    lower.includes("fbsbx.com") ||
    lower.includes("tiktokcdn") ||
    lower.includes("byteimg.com") ||
    lower.includes("ibytedtos.com") ||
    lower.includes("muscdn.com")
  );
}

function isProxiedCdnUrl(url: string): boolean {
  return isAvatarCdnUrl(url);
}

function looksLikeImageBytes(body: Buffer): boolean {
  if (body.length < 4) return false;
  if (body[0] === 0xff && body[1] === 0xd8) return true;
  if (body[0] === 0x89 && body[1] === 0x50) return true;
  if (body.subarray(0, 3).toString("ascii") === "GIF") return true;
  if (body.subarray(0, 4).toString("ascii") === "RIFF") return true;
  return false;
}

function resolveAvatarContentType(
  headerValue: string | null,
  body: Buffer,
): string | null {
  const contentType = headerValue?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (contentType.startsWith("image/")) return contentType;
  if (
    contentType === "" ||
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream"
  ) {
    if (looksLikeImageBytes(body)) return "image/jpeg";
  }
  return null;
}

function avatarCdnHeaders(platform: string | undefined, url: string): Record<string, string> {
  const lower = url.toLowerCase();
  const isTikTokCdn =
    platform === "tiktok" ||
    lower.includes("tiktokcdn") ||
    lower.includes("byteimg.com") ||
    lower.includes("ibytedtos.com") ||
    lower.includes("muscdn.com");
  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };
  if (isTikTokCdn) {
    headers["User-Agent"] =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    headers.Referer = "https://www.tiktok.com/";
  }
  return headers;
}

/** Fetch avatar bytes from a known CDN with SSRF-safe redirect handling. */
async function fetchAvatarCdnResponse(
  remoteUrl: string,
  platform: string | undefined,
): Promise<Response | null> {
  const httpsOnly = process.env.NODE_ENV === "production";
  if (!isSafeOutboundUrl(remoteUrl, { httpsOnly })) return null;
  if (!(await isSafeResolvedOutboundUrl(remoteUrl, { httpsOnly }))) return null;
  if (!isAvatarCdnUrl(remoteUrl)) return null;

  const headers = avatarCdnHeaders(platform, remoteUrl);

  return safeFetch(remoteUrl, { headers, httpsOnly });
}

/** Whether the browser should load this avatar via our proxy. */
export function shouldProxyAccountAvatar(
  platform: string | undefined,
  profileImageUrl: string | null | undefined,
): boolean {
  if (platform === "facebook" || platform === "instagram" || platform === "tiktok") {
    return true;
  }
  const u = profileImageUrl?.toLowerCase() ?? "";
  return isProxiedCdnUrl(u);
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

  if (account.platform === "tiktok") {
    try {
      const profile = await fetchTikTokConnectProfile(accessToken);
      if (isHttpUrl(profile?.profileImageUrl)) {
        return profile.profileImageUrl;
      }
    } catch (e) {
      console.warn("[account-avatar] TikTok picture fetch failed:", e);
    }
  }

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
          "https://graph.instagram.com/me?fields=profile_picture_url",
          { headers: { Authorization: `Bearer ${accessToken}` } },
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
  platform?: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const res = await fetchAvatarCdnResponse(remoteUrl, platform);
    if (!res?.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0) return null;
    const contentType = resolveAvatarContentType(
      res.headers.get("content-type"),
      body,
    );
    if (!contentType) return null;
    return { body, contentType };
  } catch (e) {
    console.warn("[account-avatar] image download failed:", e);
    return null;
  }
}
