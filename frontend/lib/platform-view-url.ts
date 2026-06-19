import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

/** True when a string looks like a TikTok @handle (not a display name). */
export function isLikelyTikTokHandle(value: string): boolean {
  const handle = value.replace(/^@/, "").trim();
  return handle.length > 0 && !/\s/.test(handle);
}

/** Parse @handle from a TikTok profile URL, e.g. https://www.tiktok.com/@abhishekbr1232 */
export function parseTikTokHandleFromProfileUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/^\/@([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Canonical TikTok profile URL for a handle. */
export function buildTikTokProfileUrl(handle: string): string {
  const clean = handle.replace(/^@/, "").trim();
  return `https://www.tiktok.com/@${encodeURIComponent(clean)}`;
}

/** Resolve a TikTok profile link from stored account data (never uses display name). */
export function resolveTikTokProfileUrl(input: {
  platformUsername?: string | null;
  platformMetadata?: Record<string, unknown> | null;
  platformPostUrl?: string | null;
}): string | null {
  const meta = input.platformMetadata;
  const storedProfileUrl =
    typeof meta?.profileUrl === "string" ? meta.profileUrl : null;
  if (storedProfileUrl) {
    const handle = parseTikTokHandleFromProfileUrl(storedProfileUrl);
    if (handle && isLikelyTikTokHandle(handle)) {
      return buildTikTokProfileUrl(handle);
    }
  }

  if (
    input.platformUsername &&
    isLikelyTikTokHandle(input.platformUsername)
  ) {
    return buildTikTokProfileUrl(input.platformUsername);
  }

  if (input.platformPostUrl?.includes("tiktok.com/@")) {
    const handle = parseTikTokHandleFromProfileUrl(input.platformPostUrl);
    if (handle && isLikelyTikTokHandle(handle)) {
      return buildTikTokProfileUrl(handle);
    }
  }

  return null;
}

/** Resolve @handle from TikTok user/info (never display_name). */
export function resolveTikTokHandleFromUser(user: {
  username?: unknown;
  profile_deep_link?: unknown;
}): string | null {
  if (
    typeof user.username === "string" &&
    isLikelyTikTokHandle(user.username)
  ) {
    return user.username.replace(/^@/, "").trim();
  }
  if (typeof user.profile_deep_link === "string") {
    const fromUrl = parseTikTokHandleFromProfileUrl(user.profile_deep_link);
    if (fromUrl && isLikelyTikTokHandle(fromUrl)) return fromUrl;
  }
  return null;
}

/** Fetch TikTok open_id, avatar, and @handle for OAuth connect. */
export async function fetchTikTokConnectAccount(accessToken: string): Promise<{
  id: string;
  username: string | null;
  profileImageUrl: string | null;
  platformMetadata?: Record<string, unknown>;
} | null> {
  const fieldSets = [
    "open_id,avatar_url,username,profile_deep_link",
    "open_id,avatar_url",
  ] as const;

  for (const fields of fieldSets) {
    try {
      const response = await fetchWithTimeout(
        `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeoutMs: 10_000,
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        data?: {
          user?: {
            open_id?: string;
            avatar_url?: string;
            username?: string;
            profile_deep_link?: string;
          };
        };
        error?: { code?: string; message?: string };
      };

      if (body.error?.code === "scope_not_authorized") {
        continue;
      }
      if (!response.ok || !body.data?.user) {
        continue;
      }

      const user = body.data.user;
      const openId =
        typeof user.open_id === "string" ? user.open_id.trim() : "";
      if (!openId) continue;

      const rawAvatar = user.avatar_url;
      const profileImageUrl =
        typeof rawAvatar === "string" &&
        (rawAvatar.startsWith("http://") || rawAvatar.startsWith("https://"))
          ? rawAvatar
          : null;
      const handle = resolveTikTokHandleFromUser(user);
      const profileUrl = handle ? buildTikTokProfileUrl(handle) : null;

      return {
        id: openId,
        username: handle,
        profileImageUrl,
        ...(profileUrl ? { platformMetadata: { profileUrl } } : {}),
      };
    } catch {
      // try next field set
    }
  }

  return null;
}

/** Fetch the creator's TikTok profile URL using their access token. */
export async function fetchTikTokProfileUrl(
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(
      "https://open.tiktokapis.com/v2/user/info/?fields=username,profile_deep_link",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeoutMs: 10_000,
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      data?: {
        user?: {
          username?: string;
          profile_deep_link?: string;
        };
      };
    };
    const user = data.data?.user;
    if (!user) return null;

    if (typeof user.profile_deep_link === "string") {
      const handle = parseTikTokHandleFromProfileUrl(user.profile_deep_link);
      if (handle && isLikelyTikTokHandle(handle)) {
        return buildTikTokProfileUrl(handle);
      }
    }
    if (
      typeof user.username === "string" &&
      isLikelyTikTokHandle(user.username)
    ) {
      return buildTikTokProfileUrl(user.username);
    }
    return null;
  } catch {
    return null;
  }
}

/** Resolve the "View on platform" link for a publication row. */
export function getPublicationViewUrl(pub: {
  platform: string;
  status: string | null;
  platformPostUrl: string | null;
  platformPostId: string | null;
  platformUsername?: string | null;
  platformMetadata?: Record<string, unknown> | null;
}): string | null {
  if (pub.status !== "published") return null;

  if (pub.platform === "tiktok") {
    return (
      resolveTikTokProfileUrl({
        platformUsername: pub.platformUsername,
        platformMetadata: pub.platformMetadata,
        platformPostUrl: pub.platformPostUrl,
      }) ?? null
    );
  }

  return pub.platformPostUrl;
}
