/**
 * Platform-specific max file sizes (reference for publish-time warnings / account UI).
 * Client upload for videos uses CLIENT_MAX_VIDEO_UPLOAD_BYTES - not these.
 * Keys match platform ids (e.g. twitter_x, not twitter).
 */

/** Single upload cap for videos in composer, create forms, and bulk tools (matches presign). */
export const CLIENT_MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB
export const CLIENT_MAX_VIDEO_UPLOAD_LABEL = "500MB";

export const VIDEO_LIMITS: Record<string, number> = {
  twitter_x: 512 * 1024 * 1024, // 512MB (free tier)
  instagram: 1 * 1024 * 1024 * 1024, // 1GB API
  facebook: 10 * 1024 * 1024 * 1024,
  linkedin: 4 * 1024 * 1024 * 1024,
  tiktok: 72 * 1024 * 1024, // 72MB (Android worst case)
  pinterest: 2 * 1024 * 1024 * 1024,
  bluesky: 50 * 1024 * 1024,
  threads: 1 * 1024 * 1024 * 1024,
  youtube: 128 * 1024 * 1024 * 1024,
};

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  twitter_x: "X (Twitter)",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
  threads: "Threads",
  youtube: "YouTube",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export function getPlatformDisplayName(platformId: string): string {
  return PLATFORM_DISPLAY_NAMES[platformId] ?? platformId;
}

export type ValidateMediaResult =
  | { allowed: true; warning?: string }
  | { allowed: false; error: string };

/**
 * Validate file size before upload.
 * Images: never block (server compresses per platform).
 * Videos: enforce CLIENT_MAX_VIDEO_UPLOAD_BYTES only - platform limits apply at publish time.
 */
export function validateMediaFile(file: File): ValidateMediaResult {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    return { allowed: false, error: "Unsupported file type." };
  }

  if (isImage) {
    return { allowed: true };
  }

  if (file.size > CLIENT_MAX_VIDEO_UPLOAD_BYTES) {
    return {
      allowed: false,
      error: `Video too large. Max upload size is ${CLIENT_MAX_VIDEO_UPLOAD_LABEL}. Your file is ${formatBytes(file.size)}.`,
    };
  }

  return { allowed: true };
}

/**
 * Given existing attachments (e.g. from composer), return which account IDs
 * should be disabled because at least one attachment exceeds that platform's limit.
 * Only video size is considered; images are compressed server-side so we never disable for image size.
 */
export function getAccountsExceededByAttachments(
  accounts: { id: string; platform: string }[],
  attachments: { file: File }[],
): { accountIds: Set<string>; reasons: Record<string, string> } {
  const accountIds = new Set<string>();
  const reasons: Record<string, string> = {};
  if (attachments.length === 0) return { accountIds, reasons };

  const platformExceededLimit = new Map<string, number>();
  for (const { file } of attachments) {
    if (!file.type.startsWith("video/")) continue;
    for (const [platform, limit] of Object.entries(VIDEO_LIMITS)) {
      if (limit != null && file.size > limit) {
        const existing = platformExceededLimit.get(platform);
        if (existing == null || limit < existing)
          platformExceededLimit.set(platform, limit);
      }
    }
  }

  for (const acc of accounts) {
    const limit = platformExceededLimit.get(acc.platform);
    if (limit == null) continue;
    accountIds.add(acc.id);
    const name = getPlatformDisplayName(acc.platform);
    reasons[acc.id] =
      `Attachment exceeds ${name}'s size limit (max ${formatBytes(limit)})`;
  }
  return { accountIds, reasons };
}
