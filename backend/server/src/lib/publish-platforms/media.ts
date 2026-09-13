/**
 * Media fetch/prepare helpers for platform publishers (SSRF-safe allowlisted URLs).
 */

import { db } from "@/db";
import { mediaUploads } from "@/db/schema";
import { inArray } from "drizzle-orm";
import {
  getAllowedMediaOrigins,
  isAllowedMediaUrl,
} from "@/lib/publish-validation";
import {
  getR2KeyFromUrl,
  getR2ObjectBytes,
  isR2Configured,
} from "@/lib/r2";

// Lazy: sharp has native bindings and cannot load on Cloudflare Workers.
// Video/TikTok paths never need it; only image compress/process does.
async function getSharp() {
  const mod = await import("sharp");
  return mod.default;
}

/** Fetch media by IDs; only return URLs that are on our allowlist (SSRF protection). */
export async function getMediaWithUrls(
  mediaIds: string[],
): Promise<{ url: string; mimeType: string }[]> {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl) return [];
  const media = await db
    .select({ url: mediaUploads.url, mimeType: mediaUploads.mimeType })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, mediaIds));
  return media.filter((m): m is { url: string; mimeType: string } => {
    if (!m.url || !m.mimeType) return false;
    return isPublishableMediaUrl(m.url, allowed);
  });
}

/** Fetch media by IDs with thumbnailUrl for videos (for Pinterest video pin cover). */
export async function getMediaWithUrlsAndThumbnail(
  mediaIds: string[],
): Promise<{ url: string; mimeType: string; thumbnailUrl: string | null }[]> {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl || !mediaIds.length) return [];
  const media = await db
    .select({
      url: mediaUploads.url,
      mimeType: mediaUploads.mimeType,
      thumbnailUrl: mediaUploads.thumbnailUrl,
    })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, mediaIds));
  return media.filter(
    (
      m,
    ): m is { url: string; mimeType: string; thumbnailUrl: string | null } => {
      if (!m.url || !m.mimeType) return false;
      if (!isPublishableMediaUrl(m.url, allowed)) return false;
      if (
        m.thumbnailUrl != null &&
        m.thumbnailUrl !== "" &&
        !isPublishableMediaUrl(m.thumbnailUrl, allowed)
      )
        return false;
      return true;
    },
  );
}

/** Fetch media by IDs in the same order as mediaIds; only allowlisted URLs. Used for collection/carousel. */
export async function getOrderedMediaWithUrls(
  mediaIds: string[],
): Promise<{ id: string; url: string; mimeType: string }[]> {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl || !mediaIds.length) return [];
  const media = await db
    .select({
      id: mediaUploads.id,
      url: mediaUploads.url,
      mimeType: mediaUploads.mimeType,
    })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, mediaIds));
  const filtered = media.filter(
    (m): m is { id: string; url: string; mimeType: string } => {
      if (!m.url || !m.mimeType) return false;
      return isPublishableMediaUrl(m.url, allowed);
    },
  );
  const order = new Map(mediaIds.map((id, i) => [id, i]));
  return filtered
    .slice()
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

const MEDIA_FETCH_TIMEOUT_MS = 60_000;
const MEDIA_FETCH_RETRIES = 2;

/** Platform image size limits (bytes) for server-side compression before upload. Keys match platform ids. */
const PLATFORM_IMAGE_LIMITS: Record<string, number> = {
  twitter_x: 5 * 1024 * 1024,
  instagram: 8 * 1024 * 1024,
  facebook: 30 * 1024 * 1024,
  linkedin: 8 * 1024 * 1024,
  tiktok: 8 * 1024 * 1024,
  pinterest: 20 * 1024 * 1024,
  bluesky: 1_000_000, // Bluesky API limit per image
  threads: 8 * 1024 * 1024,
  youtube: 2 * 1024 * 1024,
};

const DEFAULT_IMAGE_LIMIT = 8 * 1024 * 1024;

/** Resolve Social0 upload key from a stored media URL (R2 public base or /uploads/ path). */
function getOwnedUploadKey(url: string): string | null {
  const fromBase = getR2KeyFromUrl(url);
  if (fromBase) return fromBase;
  try {
    const path = new URL(url).pathname.replace(/^\//, "");
    if (/^uploads\/[^/]+\/.+/.test(path)) return path;
  } catch {
    // ignore invalid URL
  }
  return null;
}

function isPublishableMediaUrl(
  url: string,
  allowed: ReturnType<typeof getAllowedMediaOrigins>,
): boolean {
  if (isAllowedMediaUrl(url, allowed)) return true;
  // ponytail: publish worker may lack R2_PUBLIC_URL allowlist match but still has R2 creds
  if (isR2Configured() && getOwnedUploadKey(url)) return true;
  return false;
}

/**
 * Prepare image for platform API upload: return as-is if under platform limit,
 * else compress (and resize if needed) to fit. Use when uploading raw bytes to the API.
 */
export async function prepareImageForPlatform(
  imageBuffer: ArrayBuffer,
  platform: string,
  mimeType?: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const limit = PLATFORM_IMAGE_LIMITS[platform] ?? DEFAULT_IMAGE_LIMIT;
  const buf = Buffer.from(imageBuffer);

  if (buf.length <= limit) {
    return {
      buffer: buf,
      contentType: mimeType?.startsWith("image/") ? mimeType : "image/jpeg",
    };
  }

  const sharp = await getSharp();
  let quality = 85;
  let output = await sharp(buf).jpeg({ quality, mozjpeg: true }).toBuffer();

  while (output.length > limit && quality >= 30) {
    quality -= 10;
    output = await sharp(buf).jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  if (output.length > limit) {
    output = await sharp(buf)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
  }

  return { buffer: output, contentType: "image/jpeg" };
}

/**
 * Fetch media URL with long timeout and retries so scheduled publish can reach
 * our media server.
 *
 * The allowlist assertion is here rather than only at the callers: this is the
 * one place in the publish path that turns a stored URL into an outbound
 * request, so it has to hold the invariant the module name promises.
 */
export async function fetchMediaBytes(
  url: string,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<ArrayBuffer> {
  if (!isPublishableMediaUrl(url, getAllowedMediaOrigins())) {
    throw new Error("Media URL is not on the allowed storage origin");
  }

  if (isR2Configured()) {
    const key = getOwnedUploadKey(url);
    if (key) {
      try {
        const bytes = await getR2ObjectBytes(key);
        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
      } catch {
        // fall through to HTTP fetch
      }
    }
  }

  const timeoutMs = options.timeoutMs ?? MEDIA_FETCH_TIMEOUT_MS;
  const retries = options.retries ?? MEDIA_FETCH_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.arrayBuffer();
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    } finally {
      clearTimeout(id);
    }
  }
  throw lastError;
}
