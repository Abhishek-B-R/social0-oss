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

type TikTokUserInfoBody = {
  data?: {
    user?: {
      open_id?: string;
      union_id?: string;
      avatar_url?: string;
      display_name?: string;
      username?: string;
      profile_deep_link?: string;
    };
  };
  error?: { code?: string; message?: string };
};

async function fetchTikTokUserInfoFields(
  accessToken: string,
  fields: string,
): Promise<TikTokUserInfoBody | null> {
  try {
    const response = await fetchWithTimeout(
      `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeoutMs: 10_000,
      },
    );
    return (await response.json().catch(() => ({}))) as TikTokUserInfoBody;
  } catch {
    return null;
  }
}

/** Fetch TikTok open_id, avatar, display name, and optional @handle for OAuth connect. */
export async function fetchTikTokConnectAccount(accessToken: string): Promise<{
  id: string;
  username: string | null;
  profileImageUrl: string | null;
  platformMetadata?: Record<string, unknown>;
} | null> {
  // Basic-scope fields first — requesting profile fields in the same call causes
  // scope_not_authorized when user.info.profile is not granted (common default).
  const basicBody = await fetchTikTokUserInfoFields(
    accessToken,
    "open_id,union_id,avatar_url,display_name",
  );
  const basicUser = basicBody?.data?.user;
  const openId =
    typeof basicUser?.open_id === "string" ? basicUser.open_id.trim() : "";
  if (!openId) {
    if (basicBody?.error) {
      console.error(
        "TikTok userinfo error:",
        basicBody.error.code ?? "unknown",
        basicBody.error,
      );
    }
    return null;
  }

  const rawAvatar = basicUser?.avatar_url;
  const profileImageUrl =
    typeof rawAvatar === "string" &&
    (rawAvatar.startsWith("http://") || rawAvatar.startsWith("https://"))
      ? rawAvatar
      : null;
  const displayName =
    typeof basicUser?.display_name === "string"
      ? basicUser.display_name.trim() || null
      : null;

  // Best-effort @handle when user.info.profile is approved on the TikTok app.
  let handle: string | null = null;
  const profileBody = await fetchTikTokUserInfoFields(
    accessToken,
    "username,profile_deep_link",
  );
  if (profileBody?.error?.code !== "scope_not_authorized") {
    const profileUser = profileBody?.data?.user;
    if (profileUser) {
      handle = resolveTikTokHandleFromUser(profileUser);
    }
  }

  const profileUrl = handle ? buildTikTokProfileUrl(handle) : null;
  const platformMetadata: Record<string, unknown> = {};
  if (displayName) platformMetadata.displayName = displayName;
  if (profileUrl) platformMetadata.profileUrl = profileUrl;

  return {
    id: openId,
    username: handle,
    profileImageUrl,
    ...(Object.keys(platformMetadata).length > 0 ? { platformMetadata } : {}),
  };
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
      error?: { code?: string };
    };
    if (data.error?.code === "scope_not_authorized") return null;
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
