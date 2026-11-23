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
  getR2ObjectByteRange,
  getR2ObjectBytes,
  getR2ObjectMetadata,
  isR2Configured,
} from "@/lib/r2";
import { isPublishWorkerRuntime } from "@/lib/twitter-media-upload-fetch";

// Lazy: sharp has native bindings and cannot load on Cloudflare Workers.
// Video/TikTok paths never need it; only image compress/process does.
async function getSharp() {
  const mod = await import("sharp");
  return mod.default;
}

/** Size recorded at upload confirm; null when the row has none (legacy rows). */
function knownSize(sizeBytes: number | null | undefined): number | null {
  return typeof sizeBytes === "number" && sizeBytes > 0 ? sizeBytes : null;
}

/** Fetch media by IDs; only return URLs that are on our allowlist (SSRF protection). */
export async function getMediaWithUrls(
  mediaIds: string[],
): Promise<{ url: string; mimeType: string; sizeBytes: number | null }[]> {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl) return [];
  const media = await db
    .select({
      url: mediaUploads.url,
      mimeType: mediaUploads.mimeType,
      sizeBytes: mediaUploads.sizeBytes,
    })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, mediaIds));
  return media
    .filter((m): m is typeof m & { url: string; mimeType: string } => {
      if (!m.url || !m.mimeType) return false;
      return isPublishableMediaUrl(m.url, allowed);
    })
    .map((m) => ({
      url: m.url,
      mimeType: m.mimeType,
      sizeBytes: knownSize(m.sizeBytes),
    }));
}

/** Fetch media by IDs with thumbnailUrl for videos (for Pinterest video pin cover). */
export async function getMediaWithUrlsAndThumbnail(
  mediaIds: string[],
): Promise<
  {
    url: string;
    mimeType: string;
    thumbnailUrl: string | null;
    sizeBytes: number | null;
  }[]
> {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl || !mediaIds.length) return [];
  const media = await db
    .select({
      url: mediaUploads.url,
      mimeType: mediaUploads.mimeType,
      thumbnailUrl: mediaUploads.thumbnailUrl,
      sizeBytes: mediaUploads.sizeBytes,
    })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, mediaIds));
  return media
    .filter((m): m is typeof m & { url: string; mimeType: string } => {
      if (!m.url || !m.mimeType) return false;
      if (!isPublishableMediaUrl(m.url, allowed)) return false;
      if (
        m.thumbnailUrl != null &&
        m.thumbnailUrl !== "" &&
        !isPublishableMediaUrl(m.thumbnailUrl, allowed)
      )
        return false;
      return true;
    })
    .map((m) => ({
      url: m.url,
      mimeType: m.mimeType,
      thumbnailUrl: m.thumbnailUrl ?? null,
      sizeBytes: knownSize(m.sizeBytes),
    }));
}

/** Fetch media by IDs in the same order as mediaIds; only allowlisted URLs. Used for collection/carousel. */
export async function getOrderedMediaWithUrls(
  mediaIds: string[],
): Promise<
  { id: string; url: string; mimeType: string; sizeBytes: number | null }[]
> {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl || !mediaIds.length) return [];
  const media = await db
    .select({
      id: mediaUploads.id,
      url: mediaUploads.url,
      mimeType: mediaUploads.mimeType,
      sizeBytes: mediaUploads.sizeBytes,
    })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, mediaIds));
  const filtered = media
    .filter((m): m is typeof m & { url: string; mimeType: string } => {
      if (!m.url || !m.mimeType) return false;
      return isPublishableMediaUrl(m.url, allowed);
    })
    .map((m) => ({
      id: m.id,
      url: m.url,
      mimeType: m.mimeType,
      sizeBytes: knownSize(m.sizeBytes),
    }));
  const order = new Map(mediaIds.map((id, i) => [id, i]));
  return filtered.sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
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
        // Hand back the SDK's own buffer when the view spans all of it: a
        // video is tens of MB, and a second copy here is what pushes a
        // publish past the worker's 128 MB isolate.
        if (
          bytes.byteOffset === 0 &&
          bytes.byteLength === bytes.buffer.byteLength &&
          bytes.buffer instanceof ArrayBuffer
        ) {
          return bytes.buffer;
        }
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

/**
 * Largest file a publisher may read whole into memory on the Cloudflare
 * publish worker. An isolate gets 128 MB, and a buffered upload holds two or
 * three copies of the file at its peak (the download, then the request body
 * built from it), so anything much bigger kills the isolate mid-job: the queue
 * retries the same out-of-memory crash into the DLQ and the publication sits in
 * `publishing` until the stale sweeper fails it. Uploads that read the file in
 * ranges (YouTube) have no such limit.
 */
export const PUBLISH_WORKER_MAX_BUFFERED_MEDIA_BYTES = 40 * 1024 * 1024;

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

/**
 * Error message when a file of `sizeBytes` is too big to buffer in this
 * runtime; null when it fits or the size is unknown. Only the publish worker
 * has the 128 MB ceiling: the API process buffers as before.
 */
export function bufferedMediaTooLargeError(
  sizeBytes: number | null,
  platformName: string,
): string | null {
  if (!isPublishWorkerRuntime()) return null;
  if (sizeBytes == null || sizeBytes <= PUBLISH_WORKER_MAX_BUFFERED_MEDIA_BYTES) {
    return null;
  }
  return `This video is ${formatMb(sizeBytes)} MB. ${platformName} uploads from the publish worker are limited to ${PUBLISH_WORKER_MAX_BUFFERED_MEDIA_BYTES / 1024 / 1024} MB. Compress the video and try again.`;
}

/**
 * Byte size of a stored upload without downloading it: the size recorded at
 * upload confirm when the caller has it, else an R2 HEAD, else an HTTP HEAD.
 * Null when none of those can tell. Never throws.
 */
export async function getMediaByteSize(
  url: string,
  recordedSize?: number | null,
): Promise<number | null> {
  if (typeof recordedSize === "number" && recordedSize > 0) return recordedSize;
  if (!isPublishableMediaUrl(url, getAllowedMediaOrigins())) return null;

  if (isR2Configured()) {
    const key = getOwnedUploadKey(url);
    if (key) {
      const meta = await getR2ObjectMetadata(key).catch(() => null);
      if (meta && meta.contentLength > 0) return meta.contentLength;
    }
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), MEDIA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length"));
    return Number.isFinite(length) && length > 0 ? length : null;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Read bytes `start`..`end` (inclusive) of a stored upload, so a large video
 * can be sent in chunks without holding the whole file. Same allowlist, R2
 * shortcut and retries as `fetchMediaBytes`.
 */
export async function fetchMediaByteRange(
  url: string,
  start: number,
  end: number,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  if (!isPublishableMediaUrl(url, getAllowedMediaOrigins())) {
    throw new Error("Media URL is not on the allowed storage origin");
  }
  const expected = end - start + 1;

  if (isR2Configured()) {
    const key = getOwnedUploadKey(url);
    if (key) {
      try {
        const bytes = await getR2ObjectByteRange(key, start, end);
        if (bytes.byteLength === expected) return new Uint8Array(bytes);
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
      const res = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: controller.signal,
      });
      if (res.status !== 206) {
        // A 200 here is the whole file: reading it would defeat the point.
        await res.body?.cancel().catch(() => undefined);
        throw new Error(
          res.ok
            ? "Media storage ignored the byte range request"
            : `HTTP ${res.status}`,
        );
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength !== expected) {
        throw new Error(
          `Media storage returned ${bytes.byteLength} bytes for a ${expected}-byte range`,
        );
      }
      return bytes;
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
