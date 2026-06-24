/**
 * Validation and security for cross-posting.
 * - Content length limits per platform
 * - Safe media URL allowlist (SSRF protection)
 * - Input sanitization
 */

import { isValidUUID } from "./validation.js";

const CONTENT_LIMITS: Record<string, { max: number; name: string }> = {
  facebook: { max: 63_206, name: "Facebook" },
  bluesky: { max: 3000, name: "Bluesky" },
  youtube: { max: 5000, name: "YouTube Shorts" },
  pinterest: { max: 500, name: "Pinterest" }, // description
  instagram: { max: 2_200, name: "Instagram" }, // caption
  tiktok: { max: 2_200, name: "TikTok" },
  threads: { max: 500, name: "Threads" },
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
  // Twitter/X: Premium users can post up to 25k chars. Skip validation; let API surface errors.
  if (platform === "twitter_x") return null;

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

export type CollectionMediaValidation = {
  valid: boolean;
  warning: string | null;
};

/** Validate collection/mixed media count per platform. Returns warning only; does not fail publish. */
export function validateCollectionMedia(
  mediaIds: string[] | null | undefined,
  platform: string,
): CollectionMediaValidation {
  const count = mediaIds?.length ?? 0;
  if (count === 0) return { valid: true, warning: null };

  switch (platform) {
    case "twitter_x":
    case "bluesky":
      if (count > 4) {
        return {
          valid: true,
          warning:
            "X (Twitter) and Bluesky support max 4 attachments — only the first 4 will be published.",
        };
      }
      return { valid: true, warning: null };
    case "instagram":
    case "threads":
      if (count > 10) {
        return {
          valid: true,
          warning: `${platform === "instagram" ? "Instagram" : "Threads"} supports max 10 carousel items — only the first 10 will be published.`,
        };
      }
      return { valid: true, warning: null };
    default:
      return { valid: true, warning: null };
  }
}

/** Post IDs are UUIDs. Re-export for callers that need post-id semantics. */
export function isValidPostId(id: string): boolean {
  return isValidUUID(id);
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
