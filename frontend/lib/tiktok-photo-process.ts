/**
 * Process images for TikTok photo posts: download from R2, resize with sharp,
 * convert to JPEG, re-upload to R2 with -tiktok-processed suffix.
 * Resize: scale up if shortest side < 640px (to 640); scale down if any side > 4096px.
 * Output: JPEG quality 85. TikTok also requires min 360x360, max 20MB, aspect 1:3–3:1.
 */

import sharp from "sharp";
import {
  isR2Configured,
  uploadToR2,
  getR2KeyFromUrl,
  getR2PublicBaseUrl,
} from "@/lib/r2";

const MIN_SIDE_TIKTOK = 360;
const TARGET_MIN_SIDE = 640; // scale up if shorter side under this
const MAX_SIDE = 4096;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const JPEG_QUALITY = 85;
const MIN_ASPECT = 1 / 3; // 1:3
const MAX_ASPECT = 3; // 3:1

export class TikTokImageError extends Error {
  constructor(
    message: string,
    public readonly code: "min_dimensions" | "aspect_ratio" | "download" | "process" | "upload",
  ) {
    super(message);
    this.name = "TikTokImageError";
  }
}

/**
 * Derive the R2 object key for the processed image (original key + -tiktok-processed suffix).
 * If URL is not from our R2, returns a new key under uploads/tiktok-processed/.
 */
function getProcessedKey(originalUrl: string): string {
  const key = getR2KeyFromUrl(originalUrl);
  if (key) {
    return key.replace(/(\.[^.]+)$/, "-tiktok-processed$1");
  }
  return `uploads/tiktok-processed/${crypto.randomUUID()}.jpg`;
}

/**
 * Process a single image for TikTok: download from R2 URL, resize (scale up if shortest side < 640px to 640; scale down if any side > 4096px), convert to JPEG quality 85, re-upload to R2 with -tiktok-processed suffix.
 * Returns the public URL of the processed image.
 */
export async function processImageForTikTok(
  imageUrl: string,
  _mimeType: string,
): Promise<string> {
  if (!isR2Configured()) {
    throw new TikTokImageError(
      "Media storage (R2) is not configured. Cannot process images for TikTok.",
      "upload",
    );
  }

  const res = await fetch(imageUrl, { method: "GET" });
  if (!res.ok) {
    throw new TikTokImageError(
      `Failed to download image: HTTP ${res.status}`,
      "download",
    );
  }

  const inputBuffer = Buffer.from(await res.arrayBuffer());
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  let width = metadata.width ?? 0;
  let height = metadata.height ?? 0;

  if (width < MIN_SIDE_TIKTOK || height < MIN_SIDE_TIKTOK) {
    throw new TikTokImageError(
      `TikTok requires images to be at least ${MIN_SIDE_TIKTOK}x${MIN_SIDE_TIKTOK}px. This image is ${width}x${height}px.`,
      "min_dimensions",
    );
  }

  const aspect = width / height;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) {
    throw new TikTokImageError(
      `TikTok requires aspect ratio between 1:3 and 3:1. This image is ${width}x${height} (ratio ${aspect.toFixed(2)}).`,
      "aspect_ratio",
    );
  }

  // Resize: if shortest side < 640px, scale up so shortest side = 640; if any side > 4096px, scale down
  const minSide = Math.min(width, height);
  const maxSide = Math.max(width, height);
  let scale = 1;

  if (minSide < TARGET_MIN_SIDE) {
    scale = TARGET_MIN_SIDE / minSide;
  }
  if (maxSide * scale > MAX_SIDE) {
    scale = Math.min(scale, MAX_SIDE / maxSide);
  }

  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  let workBuffer: Buffer;
  if (scale !== 1) {
    workBuffer = await image
      .resize(targetWidth, targetHeight, { fit: "inside" })
      .toBuffer();
  } else {
    workBuffer = inputBuffer;
  }

  // Convert to JPEG quality 85
  const contentType = "image/jpeg";
  let outputBuffer = await sharp(workBuffer)
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  // TikTok max 20MB per image: if still over, resize down and re-encode
  if (outputBuffer.length > MAX_FILE_BYTES) {
    const scaleDown = Math.sqrt(MAX_FILE_BYTES / outputBuffer.length);
    const newW = Math.max(MIN_SIDE_TIKTOK, Math.round(targetWidth * scaleDown));
    const newH = Math.max(MIN_SIDE_TIKTOK, Math.round(targetHeight * scaleDown));
    outputBuffer = await sharp(workBuffer)
      .resize(newW, newH, { fit: "inside" })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    if (outputBuffer.length > MAX_FILE_BYTES) {
      throw new TikTokImageError(
        "Image could not be compressed under 20MB while meeting TikTok size requirements.",
        "process",
      );
    }
  }

  const finalMeta = await sharp(outputBuffer).metadata();
  const finalWidth = finalMeta.width ?? 0;
  const finalHeight = finalMeta.height ?? 0;
  const finalSizeBytes = outputBuffer.length;
  console.log("[TikTok photo process] Final image before R2 upload:", {
    width: finalWidth,
    height: finalHeight,
    sizeBytes: finalSizeBytes,
  });

  const newKey = getProcessedKey(imageUrl);
  const base = getR2PublicBaseUrl();
  if (!base) {
    throw new TikTokImageError("R2 is not configured.", "upload");
  }

  const processedUrl = await uploadToR2(newKey, outputBuffer, contentType);
  return processedUrl;
}
