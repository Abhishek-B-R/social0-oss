/**
 * Client-side video dimensions / aspect ratio helpers.
 * We do not block uploads by ratio — optional warning for non-standard ratios only.
 */

/** ~5% relative tolerance when matching standard ratios */
const REL_TOL = 0.05;

/** Standard ratios (width : height), e.g. 9:16 → w=9, h=16 */
const STANDARD_RATIO_PAIRS: readonly [number, number][] = [
  [9, 16],
  [16, 9],
  [1, 1],
  [4, 5],
  [2, 3],
  [3, 4],
  [4, 3],
];

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

/** True if ratio matches any common platform-safe ratio (~5% tolerance). */
export function isStandardAspectRatio(ratio: number): boolean {
  if (ratio <= 0 || !Number.isFinite(ratio)) return false;
  return STANDARD_RATIO_PAIRS.some(([w, h]) => matchesStandardRatio(ratio, w, h));
}

/** Non-standard ratio warning shown in the UI (single copy). */
export type AspectRatioGuidance = {
  level: "warn";
  message: string;
};

const NON_STANDARD_MESSAGE =
  "Not a standard ratio — some platforms may reject this video resulting in post failure.";

/** Use for consolidated UI (e.g. composer) when multiple videos share the same warning — show once. */
export const NON_STANDARD_VIDEO_ASPECT_GUIDANCE: AspectRatioGuidance = {
  level: "warn",
  message: NON_STANDARD_MESSAGE,
};

/**
 * Returns `null` for standard ratios (no banner). Otherwise one warning object.
 */
export function getAspectRatioGuidance(ratio: number): AspectRatioGuidance | null {
  if (isStandardAspectRatio(ratio)) return null;
  return NON_STANDARD_VIDEO_ASPECT_GUIDANCE;
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
  return measureVideoAspectRatio(file).then((m) => ({
    ...m,
    valid: true as const,
  }));
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

/** @deprecated Non-blocking guidance only; see getAspectRatioGuidance */
export const ASPECT_RATIO_MESSAGE =
  "Video aspect ratio: use a standard ratio for best results across platforms.";
