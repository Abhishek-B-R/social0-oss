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

type TikTokUserInfoResponse = {
  data?: {
    user?: {
      open_id?: string;
      avatar_url?: string;
      display_name?: string;
      username?: string;
      profile_deep_link?: string;
    };
  };
  error?: { code?: string; message?: string };
};

async function fetchTikTokUserFields(
  accessToken: string,
  fields: string,
): Promise<{ ok: boolean; status: number; user: TikTokUserInfoResponse["data"] extends infer D ? D extends { user?: infer U } ? U : undefined : undefined; raw: TikTokUserInfoResponse }> {
  const response = await fetchWithTimeout(
    `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeoutMs: 10_000,
    },
  );
  const raw = (await response.json().catch(() => ({}))) as TikTokUserInfoResponse;
  return {
    ok: response.ok && !!raw.data?.user,
    status: response.status,
    user: raw.data?.user,
    raw,
  };
}

/** Load TikTok profile data during OAuth connect (scoped to user.info.basic). */
export async function fetchTikTokConnectUserInfo(
  accessToken: string,
  fallbackOpenId?: string | null,
): Promise<{
  id: string;
  username: string | null;
  profileImageUrl: string | null;
  platformMetadata?: Record<string, unknown>;
} | null> {
  try {
    const basic = await fetchTikTokUserFields(
      accessToken,
      "open_id,union_id,avatar_url,display_name",
    );
    if (!basic.ok || !basic.user) {
      console.error(
        "TikTok userinfo (basic) error:",
        basic.status,
        basic.raw,
      );
      if (fallbackOpenId) {
        return {
          id: fallbackOpenId,
          username: null,
          profileImageUrl: null,
        };
      }
      return null;
    }

    const user = basic.user;
    const openId =
      typeof user.open_id === "string" && user.open_id.trim()
        ? user.open_id.trim()
        : fallbackOpenId?.trim() || null;
    if (!openId) return null;

    const rawAvatar = user.avatar_url;
    const profileImageUrl =
      typeof rawAvatar === "string" &&
      (rawAvatar.startsWith("http://") || rawAvatar.startsWith("https://"))
        ? rawAvatar
        : null;
    const displayName =
      typeof user.display_name === "string" && user.display_name.trim()
        ? user.display_name.trim()
        : null;

    let handle: string | null = null;
    let profileUrl: string | null = null;

    const profile = await fetchTikTokUserFields(
      accessToken,
      "username,profile_deep_link",
    );
    if (profile.ok && profile.user) {
      const profileUser = profile.user;
      if (
        typeof profileUser.username === "string" &&
        isLikelyTikTokHandle(profileUser.username)
      ) {
        handle = profileUser.username.replace(/^@/, "").trim();
      } else if (typeof profileUser.profile_deep_link === "string") {
        handle = parseTikTokHandleFromProfileUrl(profileUser.profile_deep_link);
      }
      profileUrl = handle
        ? buildTikTokProfileUrl(handle)
        : typeof profileUser.profile_deep_link === "string"
          ? profileUser.profile_deep_link
          : null;
    }

    return {
      id: openId,
      username: handle,
      profileImageUrl,
      platformMetadata: {
        ...(displayName ? { displayName } : {}),
        ...(profileUrl ? { profileUrl } : {}),
      },
    };
  } catch (err) {
    console.error("TikTok connect userinfo fetch failed:", err);
    if (fallbackOpenId) {
      return {
        id: fallbackOpenId,
        username: null,
        profileImageUrl: null,
      };
    }
    return null;
  }
}

/** Fetch the creator's TikTok profile URL using their access token. */
export async function fetchTikTokProfileUrl(
  accessToken: string,
): Promise<string | null> {
  try {
    const profile = await fetchTikTokUserFields(
      accessToken,
      "username,profile_deep_link",
    );
    if (!profile.ok || !profile.user) return null;
    const user = profile.user;

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
