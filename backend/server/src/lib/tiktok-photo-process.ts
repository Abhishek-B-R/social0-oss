/**
 * Process images for TikTok photo posts: download from R2, resize with sharp,
 * convert to JPEG, re-upload to R2 with -tiktok-processed suffix.
 * TikTok photo/carousel API accepts ratios 9:16, 1:1, and 4:5 (not 16:9).
 * We always output **1080×1920 (9:16)** with the source image centered on a
 * dark gray letterbox — safest single output for the API.
 * Unique key per attempt so TikTok does not serve cached stale images.
 */

import sharp from "sharp";
import {
  isR2Configured,
  uploadToR2,
  getR2KeyFromUrl,
  getR2PublicBaseUrl,
} from "@/lib/r2";

const TIKTOK_PHOTO_W = 1080;
const TIKTOK_PHOTO_H = 1920;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const JPEG_QUALITY = 90;
const MIN_ASPECT = 1 / 3; // 1:3
const MAX_ASPECT = 3; // 3:1

/** Dark gray letterbox so black-on-black sources remain visible (not #000). */
const CANVAS_BG = { r: 17, g: 17, b: 17 } as const; // #111111

export class TikTokImageError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "min_dimensions"
      | "aspect_ratio"
      | "download"
      | "process"
      | "upload",
  ) {
    super(message);
    this.name = "TikTokImageError";
  }
}

/**
 * Derive a unique R2 object key for the processed image (original key + -tiktok- + cache buster).
 * Unique per processing attempt so TikTok fetches fresh images instead of cached ones.
 * Always .jpeg since we always output JPEG.
 */
function getProcessedKey(originalUrl: string): string {
  const key = getR2KeyFromUrl(originalUrl);
  const cacheBust = Date.now().toString(36);
  if (key) {
    const baseKey = key.replace(/(\.[^.]+)$/, "-tiktok");
    return `${baseKey}-${cacheBust}.jpeg`;
  }
  return `uploads/tiktok-processed/${crypto.randomUUID()}-${cacheBust}.jpeg`;
}

/**
 * Process a single image for TikTok: download from R2, produce exactly 1080×1920
 * (source centered on dark gray), convert to JPEG, re-upload to R2 with
 * a unique key per attempt. Returns the public URL.
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
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const aspectRatio = width / height;
  if (aspectRatio > MAX_ASPECT || aspectRatio < MIN_ASPECT) {
    throw new TikTokImageError(
      `TikTok requires aspect ratio between 1:3 and 3:1. This image is ${width}x${height} (ratio ${aspectRatio.toFixed(2)}).`,
      "aspect_ratio",
    );
  }

  // Foreground — source scaled to fit inside 1080×1920 (preserve aspect, allow upscale)
  const fgBuffer = await sharp(inputBuffer)
    .resize(TIKTOK_PHOTO_W, TIKTOK_PHOTO_H, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .toBuffer();

  const fgMeta = await sharp(fgBuffer).metadata();
  const fgW = fgMeta.width ?? TIKTOK_PHOTO_W;
  const fgH = fgMeta.height ?? TIKTOK_PHOTO_H;
  const offsetX = Math.round((TIKTOK_PHOTO_W - fgW) / 2);
  const offsetY = Math.round((TIKTOK_PHOTO_H - fgH) / 2);

  // 1080×1920 canvas, composite foreground centered
  const baseCanvas = await sharp({
    create: {
      width: TIKTOK_PHOTO_W,
      height: TIKTOK_PHOTO_H,
      channels: 3,
      background: { ...CANVAS_BG },
    },
  })
    .jpeg()
    .toBuffer();

  let outputBuffer = await sharp(baseCanvas)
    .composite([
      { input: fgBuffer, left: offsetX, top: offsetY },
    ])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  // 20MB check: re-encode at lower quality if over
  if (outputBuffer.length > MAX_FILE_BYTES) {
    outputBuffer = await sharp(baseCanvas)
      .composite([{ input: fgBuffer, left: offsetX, top: offsetY }])
      .jpeg({ quality: 70 })
      .toBuffer();
    if (outputBuffer.length > MAX_FILE_BYTES) {
      throw new TikTokImageError(
        "Image could not be compressed under 20MB while meeting TikTok size requirements.",
        "process",
      );
    }
  }

  const contentType = "image/jpeg";
  const newKey = getProcessedKey(imageUrl);
  const base = getR2PublicBaseUrl();
  if (!base) {
    throw new TikTokImageError("R2 is not configured.", "upload");
  }

  const processedUrl = await uploadToR2(newKey, outputBuffer, contentType);
  console.log(
    `[TikTok photo process] Original: ${width}x${height}, Output: ${TIKTOK_PHOTO_W}x${TIKTOK_PHOTO_H}, Size: ${outputBuffer.length} bytes, URL: ${processedUrl}`,
  );
  return processedUrl;
}
