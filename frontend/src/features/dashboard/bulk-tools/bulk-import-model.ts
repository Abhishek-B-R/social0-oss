import { patternFitsInDay } from "@/lib/bulk-schedule";
import { CONTENT_TYPES } from "@/lib/content-types";
import {
  CLIENT_MAX_VIDEO_UPLOAD_BYTES,
  VIDEO_LIMITS as VIDEO_SIZE_LIMITS,
  formatBytes,
} from "@/lib/media-limits";
import {
  getAccountsOverVideoLimit,
  getLimitForAccount,
} from "@/lib/platform-limits";
import { getTikTokVideoResolutionGuidance, isStandardAspectRatio } from "@/lib/video-aspect-ratio";
import type { AccountForForm } from "@/lib/accounts-for-form";

/*
 * Bulk import model: one row per uploaded file, plus the checks the review
 * step shows next to each row. Pure functions only (no React).
 */

export type BulkKind = "image" | "video";
/** "mixed" = images and videos in one import (default route). */
export type BulkImportScope = BulkKind | "mixed";
export type ImportMode = "schedule" | "queue" | "draft";

export const IMAGE_PLATFORMS: readonly string[] =
  CONTENT_TYPES.find((c) => c.id === "image")?.platforms ?? [];
export const VIDEO_PLATFORMS: readonly string[] =
  CONTENT_TYPES.find((c) => c.id === "video")?.platforms ?? [];

/** Caps carried over from the old Bulk Image / Bulk Video tools. */
export const LIMITS = {
  image: {
    maxCount: 50,
    maxFileBytes: 50 * 1024 * 1024,
    maxTotalBytes: 250 * 1024 * 1024,
    accept: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    label: "JPG, PNG, WEBP or GIF, up to 50MB each",
  },
  video: {
    maxCount: 40,
    maxFileBytes: CLIENT_MAX_VIDEO_UPLOAD_BYTES,
    maxTotalBytes: CLIENT_MAX_VIDEO_UPLOAD_BYTES,
    accept: ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"],
    label: "MP4, MOV, WEBM or AVI, up to 500MB in total",
  },
} as const;

export const CAPTION_MAX = 2200;
/** Sent for rows left without a caption (posts need non-empty content). */
export const EMPTY_CAPTION_FALLBACK = "No caption";
export const YOUTUBE_TITLE_MAX = 100;

export type BulkRow = {
  id: string;
  file: File;
  kind: BulkKind;
  /** Object URL of the file (revoke when the row goes away). */
  previewUrl: string;
  /** Small data-URL poster for videos ("" for images or when unavailable). */
  posterUrl: string;
  caption: string;
  youtubeTitle: string;
  scheduledAt: Date;
  /** Seconds, videos only (0 when unknown). */
  durationSec: number;
  width: number;
  height: number;
  /** Networks this row should not post to (row-level "Skip TikTok"). */
  skippedPlatforms: string[];
  /** Set after a successful upload so a retry doesn't upload again. */
  mediaId?: string;
  status: "ready" | "importing" | "imported" | "failed";
  /** Last import error for this row. */
  importError?: string;
  postId?: string;
};

export type IssueFix =
  | { type: "skip"; platform: string; label: string }
  | { type: "caption" }
  | { type: "title" }
  | { type: "time" }
  | { type: "remove" };

export type RowIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  fixes: IssueFix[];
};

export type ValidationContext = {
  selectedAccounts: AccountForForm[];
  mode: ImportMode;
  now: number;
};

export function kindOfFile(file: File): BulkKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export function supportedPlatformsFor(kind: BulkKind): readonly string[] {
  return kind === "image" ? IMAGE_PLATFORMS : VIDEO_PLATFORMS;
}

export function networkName(platform: string): string {
  switch (platform) {
    case "twitter_x":
      return "X";
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube";
    case "linkedin":
      return "LinkedIn";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "pinterest":
      return "Pinterest";
    case "threads":
      return "Threads";
    case "bluesky":
      return "Bluesky";
    default:
      return platform;
  }
}

/** Accounts this row will post to: selected, supported for its kind, not skipped. */
export function accountsForRow(
  row: Pick<BulkRow, "kind" | "skippedPlatforms">,
  selected: AccountForForm[],
): AccountForForm[] {
  const supported = supportedPlatformsFor(row.kind);
  return selected.filter(
    (a) => supported.includes(a.platform) && !row.skippedPlatforms.includes(a.platform),
  );
}

function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Rows scheduled closer than this to "now" are flagged: the upload takes time. */
const MIN_LEAD_MS = 2 * 60 * 1000;

/** Errors block a row from importing; warnings don't. */
export function getRowIssues(row: BulkRow, ctx: ValidationContext): RowIssue[] {
  const issues: RowIssue[] = [];
  const targets = accountsForRow(row, ctx.selectedAccounts);
  const targetPlatforms = [...new Set(targets.map((a) => a.platform))];
  const skip = (platform: string): IssueFix => ({
    type: "skip",
    platform,
    label: `Skip ${networkName(platform)}`,
  });

  if (targets.length === 0) {
    issues.push({
      severity: "error",
      code: "no-accounts",
      message:
        ctx.selectedAccounts.length === 0
          ? "Pick at least one account to post to."
          : `None of the selected accounts can post ${row.kind === "image" ? "images" : "this video"}.`,
      fixes: [{ type: "remove" }],
    });
  }

  const caption = row.caption.trim();
  if (!caption) {
    // Media-only posts are fine: the row imports with EMPTY_CAPTION_FALLBACK.
    issues.push({
      severity: "warning",
      code: "caption-missing",
      message: `No caption. It will post as "${EMPTY_CAPTION_FALLBACK}".`,
      fixes: [{ type: "caption" }],
    });
  } else {
    // Per-network caption limits (X premium accounts get 25,000).
    const over = new Map<string, number>();
    for (const a of targets) {
      const limit = getLimitForAccount(a);
      if (caption.length > limit) {
        const prev = over.get(a.platform);
        if (prev == null || limit < prev) over.set(a.platform, limit);
      }
    }
    for (const [platform, limit] of over) {
      issues.push({
        severity: "error",
        code: `caption-too-long-${platform}`,
        message: `Caption is too long for ${networkName(platform)} (${caption.length.toLocaleString()} of ${limit.toLocaleString()} characters).`,
        fixes: [{ type: "caption" }, skip(platform)],
      });
    }
  }

  if (row.kind === "video") {
    if (targetPlatforms.includes("youtube") && !row.youtubeTitle.trim()) {
      issues.push({
        severity: "error",
        code: "youtube-title",
        message: "YouTube needs a title.",
        fixes: [{ type: "title" }, skip("youtube")],
      });
    }
    if (row.durationSec > 0) {
      const { warnings, softWarnings } = getAccountsOverVideoLimit(targets, row.durationSec);
      for (const w of warnings) {
        issues.push({
          severity: "error",
          code: `duration-${w.platform}`,
          message: `Too long for ${networkName(w.platform)} (${fmtDuration(row.durationSec)}, max ${fmtDuration(w.limitSeconds)}).`,
          fixes: [skip(w.platform)],
        });
      }
      for (const w of softWarnings) {
        issues.push({
          severity: "warning",
          code: `duration-soft-${w.platform}`,
          message: w.message,
          fixes: [skip(w.platform)],
        });
      }
    }
    for (const platform of targetPlatforms) {
      const limit = VIDEO_SIZE_LIMITS[platform];
      if (limit != null && row.file.size > limit) {
        issues.push({
          severity: "warning",
          code: `size-${platform}`,
          message: `Larger than ${networkName(platform)}'s ${formatBytes(limit)} limit, so it may be rejected.`,
          fixes: [skip(platform)],
        });
      }
    }
    if (row.width > 0 && row.height > 0) {
      if (!isStandardAspectRatio(row.width / row.height)) {
        issues.push({
          severity: "warning",
          code: "aspect",
          message:
            "Not a standard ratio. Some networks may reject this video.",
          fixes: [],
        });
      }
      if (
        targetPlatforms.includes("tiktok") &&
        getTikTokVideoResolutionGuidance(row.width, row.height)
      ) {
        issues.push({
          severity: "warning",
          code: "tiktok-resolution",
          message: "TikTok needs a vertical 9:16 video at 720×1280 or higher.",
          fixes: [skip("tiktok")],
        });
      }
    }
  }

  if (ctx.mode === "schedule") {
    const t = row.scheduledAt.getTime();
    if (Number.isNaN(t)) {
      issues.push({
        severity: "error",
        code: "time-invalid",
        message: "Pick a date and time.",
        fixes: [{ type: "time" }],
      });
    } else if (t < ctx.now + MIN_LEAD_MS) {
      issues.push({
        severity: "error",
        code: "time-past",
        message: "This time has already passed.",
        fixes: [{ type: "time" }],
      });
    } else if (t > ctx.now + ONE_YEAR_MS) {
      issues.push({
        severity: "error",
        code: "time-far",
        message: "Schedule within the next year.",
        fixes: [{ type: "time" }],
      });
    }
  }

  return issues;
}

export function hasErrors(issues: RowIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

// ---------------------------------------------------------------------------
// Schedule pattern (start date/time, posts per day, gap)
// ---------------------------------------------------------------------------

export type SchedulePattern = {
  /** yyyy-MM-dd, local time */
  startDate: string;
  /** HH:mm, local time */
  startTime: string;
  perDay: number;
  gapHours: number;
};

export const PER_DAY_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1);
export const GAP_HOURS_OPTIONS = [0.5, 1, 2, 3, 4, 6, 8, 12, 24] as const;

/**
 * Keep `gapHours` when a day's posts still start before the next day's first
 * one; otherwise the widest option that fits (0.5h always fits 24 per day).
 */
export function fitGapHours(perDay: number, gapHours: number): number {
  if (patternFitsInDay(perDay, gapHours)) return gapHours;
  const fitting = GAP_HOURS_OPTIONS.filter((h) => patternFitsInDay(perDay, h));
  return fitting[fitting.length - 1] ?? GAP_HOURS_OPTIONS[0];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Starts a little ahead of now so the first post isn't already in the past. */
export function defaultPattern(now = new Date()): SchedulePattern {
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  return {
    startDate: toDateInput(start),
    startTime: toTimeInput(start),
    perDay: 1,
    gapHours: 2,
  };
}

/** One post per day ignores the gap (the old tools did the same). */
export function effectiveGap(p: SchedulePattern): number {
  return p.perDay === 1 ? 24 : p.gapHours;
}

/** min/max for date inputs: today … one year out (the API's window). */
export function scheduleDateBounds(): { min: string; max: string } {
  const now = new Date();
  return {
    min: toDateInput(now),
    max: toDateInput(new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)),
  };
}

/** Combine a yyyy-MM-dd and HH:mm (local) into a Date. */
export function combineDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  if (!y || !m || !d || h == null || min == null || Number.isNaN(h) || Number.isNaN(min)) {
    return new Date(Number.NaN);
  }
  return new Date(y, m - 1, d, h, min, 0, 0);
}
