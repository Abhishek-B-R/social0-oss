/**
 * Validation and security for cross-posting.
 * - Content length limits per platform
 * - Safe media URL allowlist (SSRF protection)
 * - Input sanitization
 */

const CONTENT_LIMITS: Record<string, { max: number; name: string }> = {
  facebook: { max: 63_206, name: "Facebook" },
  bluesky: { max: 3000, name: "Bluesky" },
  hashnode: { max: 100_000, name: "Hashnode" },
  youtube: { max: 5000, name: "YouTube Shorts" },
  pinterest: { max: 500, name: "Pinterest" }, // description
  instagram: { max: 2_200, name: "Instagram" }, // caption
  tiktok: { max: 2_200, name: "TikTok" },
  threads: { max: 500, name: "Threads" },
  devto: { max: 100_000, name: "Dev.to" },
  linkedin: { max: 3000, name: "LinkedIn" },
  twitter_x: { max: 280, name: "X (Twitter)" },
};

const MAX_TITLE_LENGTH = 200;
const MAX_MEDIA_IDS = 20;

/** Validate content length for a platform. Returns error message or null. */
export function validateContentLength(
  platform: string,
  content: string | null | undefined,
): string | null {
  const trimmed = (content ?? "").trim();
  const limit = CONTENT_LIMITS[platform];
  if (!limit || limit.max === 0) return null;
  if (trimmed.length > limit.max) {
    return `${limit.name}: content must be ${limit.max} characters or less (got ${trimmed.length}).`;
  }
  return null;
}

/** Validate title length (for articles). */
export function validateTitleLength(title: string): string | null {
  if (title.length > MAX_TITLE_LENGTH) {
    return `Title must be ${MAX_TITLE_LENGTH} characters or less.`;
  }
  return null;
}

/** Validate mediaIds array size to prevent abuse. */
export function validateMediaCount(mediaIds: string[] | null | undefined): string | null {
  if (!mediaIds?.length) return null;
  if (mediaIds.length > MAX_MEDIA_IDS) {
    return `Maximum ${MAX_MEDIA_IDS} media items per post.`;
  }
  return null;
}

/** UUID v4 format (no secrets, just shape). */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidPostId(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Allowlist for media URLs to prevent SSRF.
 * Only URLs from our app or configured R2/public storage are allowed.
 */
export function isAllowedMediaUrl(
  url: string,
  allowedOrigins: { appUrl: string; r2PublicUrl?: string | null },
): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const appOrigin = new URL(allowedOrigins.appUrl).origin;
    if (u.origin === appOrigin) return true;
    if (allowedOrigins.r2PublicUrl) {
      const r2Origin = new URL(allowedOrigins.r2PublicUrl).origin;
      if (u.origin === r2Origin) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Truncate text to a max length with optional ellipsis. */
export function truncate(text: string, maxLen: number, ellipsis = "..."): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - ellipsis.length) + ellipsis;
}

/** Get allowed origins for media URLs from env (SSRF allowlist). */
export function getAllowedMediaOrigins(): { appUrl: string; r2PublicUrl?: string | null } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const r2PublicUrl = process.env.R2_PUBLIC_URL ?? null;
  return { appUrl, r2PublicUrl };
}
