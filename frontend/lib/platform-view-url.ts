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

/** Fetch the creator's TikTok profile URL using their access token. */
export async function fetchTikTokProfileUrl(
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=username,profile_deep_link,display_name",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      data?: {
        user?: {
          username?: string;
          profile_deep_link?: string;
          display_name?: string;
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
