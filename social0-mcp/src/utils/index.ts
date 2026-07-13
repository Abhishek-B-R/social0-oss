import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { guessMimeType } from "./logger.js";

export { guessMimeType, isUuid, sleep, formatToolError, logVerbose } from "./logger.js";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const URL_FETCH_TIMEOUT_MS = 60_000;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export type ResolvedMediaFile = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
  source: "file_path" | "url" | "data";
};

function maxBytesForMime(mimeType: string): number {
  return mimeType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

function assertSupportedMime(mimeType: string, label: string): void {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error(
      `Unsupported type "${mimeType}" for ${label}. Supported: jpg, png, gif, webp, mp4, mov, webm`,
    );
  }
}

function assertSize(buffer: Buffer, mimeType: string): void {
  const max = maxBytesForMime(mimeType);
  if (buffer.byteLength > max) {
    throw new Error(
      `File too large (${Math.round(buffer.byteLength / (1024 * 1024))}MB). Max ${
        mimeType.startsWith("video/") ? "500MB" : "50MB"
      }.`,
    );
  }
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const name = basename(pathname);
    if (name && name.includes(".")) return name;
  } catch {
    // fall through
  }
  return "download.bin";
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") {
    return true;
  }
  if (host === "::1") return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const parts = ipv4.slice(1).map((p) => Number(p));
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  return false;
}

export async function readLocalFile(filePath: string): Promise<ResolvedMediaFile> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  const mimeType = guessMimeType(filePath);
  if (!mimeType) {
    throw new Error(
      `Unsupported file type for "${basename(filePath)}". Supported: jpg, png, gif, webp, mp4, mov, webm`,
    );
  }

  const buffer = await readFile(filePath);
  assertSize(buffer, mimeType);
  return {
    buffer,
    filename: basename(filePath),
    mimeType,
    size: buffer.byteLength,
    source: "file_path",
  };
}

export async function readMediaFromUrl(
  url: string,
  options?: { filename?: string; mimeType?: string },
): Promise<ResolvedMediaFile> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported.");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("URL host is not allowed (localhost / private network).");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "image/*,video/*,*/*" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out downloading media URL (60s).");
    }
    throw new Error(
      `Failed to download URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status} for ${url}`);
  }

  const filename = options?.filename?.trim() || filenameFromUrl(url);
  const headerType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  const mimeType =
    options?.mimeType?.trim() ||
    guessMimeType(filename) ||
    (headerType && ALLOWED_MIME.has(headerType) ? headerType : null);

  if (!mimeType) {
    throw new Error(
      `Could not determine media type for URL. Pass filename (e.g. photo.png) or mime_type.`,
    );
  }
  assertSupportedMime(mimeType, "url");

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytesForMime(mimeType)) {
    throw new Error(
      `Remote file too large (Content-Length ${contentLength}). Max ${
        mimeType.startsWith("video/") ? "500MB" : "50MB"
      }.`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  assertSize(buffer, mimeType);

  const safeName =
    filename.includes(".") && guessMimeType(filename)
      ? filename
      : mimeType.startsWith("video/")
        ? "video.mp4"
        : "image.png";

  return {
    buffer,
    filename: basename(safeName),
    mimeType,
    size: buffer.byteLength,
    source: "url",
  };
}

export function readMediaFromBase64(input: {
  data: string;
  filename?: string;
  mimeType?: string;
}): ResolvedMediaFile {
  let raw = input.data.trim();
  let mimeFromDataUrl: string | undefined;
  const dataUrl = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(raw);
  if (dataUrl) {
    mimeFromDataUrl = dataUrl[1]?.trim().toLowerCase() || undefined;
    raw = dataUrl[3] ?? "";
  }

  raw = raw.replace(/\s+/g, "");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    throw new Error("Invalid base64 data.");
  }
  if (buffer.byteLength === 0) {
    throw new Error("Decoded base64 payload is empty.");
  }

  const filename = input.filename?.trim() || "upload.bin";
  const mimeType =
    input.mimeType?.trim() ||
    mimeFromDataUrl ||
    guessMimeType(filename) ||
    null;

  if (!mimeType) {
    throw new Error(
      "Could not determine media type for base64 data. Pass filename with extension or mime_type.",
    );
  }
  assertSupportedMime(mimeType, "data");
  assertSize(buffer, mimeType);

  const safeName =
    filename.includes(".") && guessMimeType(filename)
      ? filename
      : mimeType.startsWith("video/")
        ? "video.mp4"
        : "image.png";

  return {
    buffer,
    filename: basename(safeName),
    mimeType,
    size: buffer.byteLength,
    source: "data",
  };
}

export async function resolveUploadMediaInput(input: {
  file_path?: string;
  url?: string;
  data?: string;
  filename?: string;
  mime_type?: string;
}): Promise<ResolvedMediaFile> {
  if (input.file_path) {
    return readLocalFile(input.file_path);
  }
  if (input.url) {
    return readMediaFromUrl(input.url, {
      ...(input.filename ? { filename: input.filename } : {}),
      ...(input.mime_type ? { mimeType: input.mime_type } : {}),
    });
  }
  if (input.data) {
    return readMediaFromBase64({
      data: input.data,
      ...(input.filename ? { filename: input.filename } : {}),
      ...(input.mime_type ? { mimeType: input.mime_type } : {}),
    });
  }
  throw new Error("Provide exactly one of: file_path, url, or data.");
}

export function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}
