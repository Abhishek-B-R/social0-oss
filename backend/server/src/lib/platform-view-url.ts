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

/**
 * TikTok public video URL. Prefer a real @handle; if unknown, use handle-free
 * `/@/video/{id}` which TikTok resolves by video id (same as m.tiktok.com/v/{id}).
 */
export function buildTikTokVideoUrl(
  handle: string | null | undefined,
  videoId: string,
): string {
  const clean = (handle ?? "").replace(/^@/, "").trim();
  if (clean) {
    return `https://www.tiktok.com/@${encodeURIComponent(clean)}/video/${videoId}`;
  }
  return `https://www.tiktok.com/@/video/${videoId}`;
}

/** Public TikTok video ids are long decimal integers (not `v_…` publish ids). */
export function isTikTokVideoId(id: string | null | undefined): boolean {
  return typeof id === "string" && /^\d{10,}$/.test(id);
}

/** True when URL is a concrete TikTok video (or photo) post, not just a profile. */
export function isTikTokPostPermalink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!/(^|\.)tiktok\.com$/i.test(u.hostname)) return false;
    // /@handle/video/id, /@/video/id (handle-free), /video/id, m.tiktok.com/v/id.html
    return (
      /^\/@[^/]*\/(video|photo)\/\d+/.test(u.pathname) ||
      /^\/video\/\d+/.test(u.pathname) ||
      /^\/v\/\d+/.test(u.pathname)
    );
  } catch {
    return false;
  }
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

/** Instagram usernames are handles, not numeric Graph API user ids. */
export function isLikelyInstagramHandle(value: string): boolean {
  const handle = value.replace(/^@/, "").trim();
  if (!handle || /^\d+$/.test(handle)) return false;
  return /^[a-zA-Z0-9._]+$/.test(handle);
}

/** Canonical Instagram profile URL from @handle. */
export function buildInstagramProfileUrl(handle: string): string {
  const clean = handle.replace(/^@/, "").trim();
  if (!clean) return "";
  return `https://www.instagram.com/${encodeURIComponent(clean)}/`;
}

export function resolveInstagramProfileUrl(input: {
  platformUsername?: string | null;
  platformUserId?: string | null;
}): string | null {
  if (
    input.platformUsername &&
    isLikelyInstagramHandle(input.platformUsername)
  ) {
    return buildInstagramProfileUrl(input.platformUsername);
  }
  return null;
}

/**
 * True when URL is a real IG media permalink (/p/ or /reel/), not a profile.
 * Graph media ids cannot be turned into these paths locally — use API `permalink`.
 */
export function isInstagramPostPermalink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return false;
    return /^\/(p|reel|reels|tv)\/[^/]+/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Resolve the "View on platform" link for a publication row. */
export function getPublicationViewUrl(pub: {
  platform: string;
  status: string | null;
  platformPostUrl: string | null;
  platformPostId: string | null;
  platformUserId?: string | null;
  platformUsername?: string | null;
  platformMetadata?: Record<string, unknown> | null;
}): string | null {
  if (pub.status !== "published") return null;

  if (pub.platform === "instagram") {
    if (isInstagramPostPermalink(pub.platformPostUrl)) {
      return pub.platformPostUrl;
    }
    return resolveInstagramProfileUrl({
      platformUsername: pub.platformUsername,
      platformUserId: pub.platformUserId,
    });
  }

  if (pub.platform === "tiktok") {
    if (isTikTokPostPermalink(pub.platformPostUrl)) {
      return pub.platformPostUrl;
    }

    // Public video id alone is enough — do not require @handle.
    if (pub.platformPostId && isTikTokVideoId(pub.platformPostId)) {
      const handle =
        (pub.platformUsername && isLikelyTikTokHandle(pub.platformUsername)
          ? pub.platformUsername.replace(/^@/, "")
          : null) ??
        (pub.platformPostUrl
          ? parseTikTokHandleFromProfileUrl(pub.platformPostUrl)
          : null) ??
        (typeof pub.platformMetadata?.profileUrl === "string"
          ? parseTikTokHandleFromProfileUrl(pub.platformMetadata.profileUrl)
          : null);
      return buildTikTokVideoUrl(
        handle && isLikelyTikTokHandle(handle) ? handle : null,
        pub.platformPostId,
      );
    }

    const profile = resolveTikTokProfileUrl({
      platformUsername: pub.platformUsername,
      platformMetadata: pub.platformMetadata,
      platformPostUrl: pub.platformPostUrl,
    });
    if (profile) return profile;

    // Keep stored messages / profile links; never treat bare homepage as a View target.
    if (
      pub.platformPostUrl &&
      /^https:\/\//i.test(pub.platformPostUrl) &&
      pub.platformPostUrl !== "https://www.tiktok.com" &&
      pub.platformPostUrl !== "https://www.tiktok.com/"
    ) {
      return pub.platformPostUrl;
    }

    return null;
  }

  return pub.platformPostUrl;
}
