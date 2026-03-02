/**
 * Allowed video aspect ratios (width/height) for social platforms.
 * Validated at file-select time in the browser.
 */
const ALLOWED_RATIOS = [16 / 9, 9 / 16, 4 / 3, 3 / 4, 1 / 1];
const TOLERANCE = 0.05;

export type VideoAspectResult = {
  valid: boolean;
  width: number;
  height: number;
  ratio: number;
};

/**
 * Validate video aspect ratio using the browser's video element (client-only).
 * Returns dimensions and whether the ratio is allowed (16:9, 9:16, 4:3, 3:4, 1:1).
 */
export function validateVideoAspectRatio(file: File): Promise<VideoAspectResult> {
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
      const valid = ALLOWED_RATIOS.some(
        (r) => Math.abs(ratio - r) < TOLERANCE,
      );
      cleanup();
      resolve({ valid, width, height, ratio });
    };
    video.onerror = () => {
      cleanup();
      resolve({ valid: false, width: 0, height: 0, ratio: 0 });
    };
    video.src = URL.createObjectURL(file);
  });
}

/** Format ratio for error message, e.g. "2.4:1" or "1:1.8" */
export function formatAspectRatioLabel(ratio: number): string {
  if (ratio <= 0 || !Number.isFinite(ratio)) return "unknown";
  if (ratio >= 1) return `${ratio.toFixed(1)}:1`;
  return `1:${(1 / ratio).toFixed(1)}`;
}

/** Optional short descriptor for invalid ratio (e.g. "ultrawide landscape") */
export function getAspectRatioDescriptor(ratio: number): string {
  if (ratio <= 0 || !Number.isFinite(ratio)) return "";
  if (ratio > 2) return " (ultrawide landscape)";
  if (ratio >= 1 && ratio < 1.5) return " (landscape)";
  if (ratio < 0.5) return " (ultrawide portrait)";
  if (ratio < 1) return " (portrait)";
  return "";
}

export const ASPECT_RATIO_MESSAGE =
  "Video must be 16:9, 9:16, 4:3, 3:4, or 1:1.";
