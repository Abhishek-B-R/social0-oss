/**
 * Client-side video dimensions / aspect ratio helpers.
 * We do not block uploads by ratio — show guidance only (see getAspectRatioGuidance).
 */

/** ~5% relative tolerance when matching standard ratios */
const REL_TOL = 0.05;

export type VideoAspectMeasurement = {
  width: number;
  height: number;
  /** width / height */
  ratio: number;
};

function matchesStandardRatio(ratio: number, w: number, h: number): boolean {
  if (w <= 0 || h <= 0) return false;
  const target = w / h;
  if (!Number.isFinite(ratio) || !Number.isFinite(target)) return false;
  return Math.abs(ratio - target) / target <= REL_TOL;
}

/** TikTok API commonly expects 9:16, 1:1, or 16:9 (width/height). */
export function isTikTokAcceptedAspectRatio(ratio: number): boolean {
  return (
    matchesStandardRatio(ratio, 9, 16) ||
    matchesStandardRatio(ratio, 16, 9) ||
    matchesStandardRatio(ratio, 1, 1)
  );
}

export type AspectRatioKind =
  | "9:16"
  | "16:9"
  | "1:1"
  | "4:5"
  | "2:3"
  | "other";

/** Classify by first match (priority order). */
export function classifyAspectRatioKind(ratio: number): AspectRatioKind {
  if (matchesStandardRatio(ratio, 9, 16)) return "9:16";
  if (matchesStandardRatio(ratio, 16, 9)) return "16:9";
  if (matchesStandardRatio(ratio, 1, 1)) return "1:1";
  if (matchesStandardRatio(ratio, 4, 5)) return "4:5";
  if (matchesStandardRatio(ratio, 2, 3)) return "2:3";
  return "other";
}

export type AspectGuidanceVariant = "success" | "info" | "tiktok";

export type AspectRatioGuidance = {
  variant: AspectGuidanceVariant;
  message: string;
};

/**
 * User-facing copy for ratio guidance. TikTok gets a stronger warning when
 * selected and ratio is outside 9:16 / 16:9 / 1:1.
 */
export function getAspectRatioGuidance(
  ratio: number,
  opts?: { tiktokSelected?: boolean },
): AspectRatioGuidance {
  if (opts?.tiktokSelected && !isTikTokAcceptedAspectRatio(ratio)) {
    return {
      variant: "tiktok",
      message:
        "TikTok may reject this video. Recommended: 9:16 (vertical), 16:9, or 1:1.",
    };
  }

  const kind = classifyAspectRatioKind(ratio);
  switch (kind) {
    case "9:16":
      return {
        variant: "success",
        message: "Optimized for all platforms.",
      };
    case "16:9":
      return {
        variant: "info",
        message:
          "Best for YouTube, LinkedIn, Twitter. Other platforms will add black bars.",
      };
    case "1:1":
      return {
        variant: "info",
        message:
          "Works on all platforms. TikTok and Instagram will add black bars.",
      };
    case "4:5":
      return {
        variant: "info",
        message:
          "Great for Instagram feed. Other platforms may crop or pad.",
      };
    case "2:3":
      return {
        variant: "info",
        message: "Ideal for Pinterest. Other platforms may crop or pad.",
      };
    default:
      return {
        variant: "info",
        message:
          "Non-standard ratio. Most platforms will auto-crop or add black bars. For best results, use 9:16 (vertical) or 16:9 (horizontal).",
      };
  }
}

/**
 * Read video dimensions from a File (browser only).
 */
export function measureVideoAspectRatio(
  file: File,
): Promise<VideoAspectMeasurement> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => {
      if (video.src) URL.revokeObjectURL(video.src);
    };
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const ratio = height > 0 ? width / height : 0;
      cleanup();
      resolve({ width, height, ratio });
    };
    video.onerror = () => {
      cleanup();
      resolve({ width: 0, height: 0, ratio: 0 });
    };
    video.src = URL.createObjectURL(file);
  });
}

/** @deprecated Use measureVideoAspectRatio — we no longer block on ratio */
export function validateVideoAspectRatio(
  file: File,
): Promise<VideoAspectMeasurement & { valid: true }> {
  return measureVideoAspectRatio(file).then((m) => ({ ...m, valid: true as const }));
}

/** Format ratio for debug copy, e.g. "1.8:1" or "1:1.8" */
export function formatAspectRatioLabel(ratio: number): string {
  if (ratio <= 0 || !Number.isFinite(ratio)) return "unknown";
  if (ratio >= 1) return `${ratio.toFixed(1)}:1`;
  return `1:${(1 / ratio).toFixed(1)}`;
}

/** Optional short descriptor (e.g. ultrawide) */
export function getAspectRatioDescriptor(ratio: number): string {
  if (ratio <= 0 || !Number.isFinite(ratio)) return "";
  if (ratio > 2) return " (ultrawide landscape)";
  if (ratio >= 1 && ratio < 1.5) return " (landscape)";
  if (ratio < 0.5) return " (ultrawide portrait)";
  if (ratio < 1) return " (portrait)";
  return "";
}

/** @deprecated Prefer getAspectRatioGuidance */
export const ASPECT_RATIO_MESSAGE =
  "Video aspect ratio: use 9:16 or 16:9 for best results across platforms.";
