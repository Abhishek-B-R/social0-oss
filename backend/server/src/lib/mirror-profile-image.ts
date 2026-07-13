import crypto from "crypto";
import { isSafeOutboundUrl, safeFetch } from "@social0/shared";
import { isSafeResolvedOutboundUrl } from "./ssrf-resolve.js";
import {
  getR2PublicBaseUrl,
  isR2Configured,
  uploadToR2,
} from "./r2.js";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function looksLikeImageBytes(body: Buffer): boolean {
  if (body.length < 4) return false;
  if (body[0] === 0xff && body[1] === 0xd8) return true;
  if (body[0] === 0x89 && body[1] === 0x50) return true;
  if (body.subarray(0, 3).toString("ascii") === "GIF") return true;
  if (body.subarray(0, 4).toString("ascii") === "RIFF") return true;
  return false;
}

function resolveImageContentType(
  headerValue: string | null,
  body: Buffer,
): string | null {
  const contentType = headerValue?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (contentType.startsWith("image/")) return contentType;
  if (
    contentType === "" ||
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream"
  ) {
    if (looksLikeImageBytes(body)) return "image/jpeg";
  }
  return null;
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("avif")) return "avif";
  return "jpg";
}

/** Headers some CDNs require for a one-time avatar download at connect time. */
function fetchHeaders(url: string, platform?: string): Record<string, string> {
  const lower = url.toLowerCase();
  const isTikTokCdn =
    platform === "tiktok" ||
    lower.includes("tiktokcdn") ||
    lower.includes("byteimg.com") ||
    lower.includes("ibytedtos.com") ||
    lower.includes("muscdn.com");
  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };
  if (isTikTokCdn) {
    headers["User-Agent"] =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    headers.Referer = "https://www.tiktok.com/";
  }
  return headers;
}

/**
 * Download a remote platform avatar and store it on our R2. Returns the public
 * R2 URL, or null if there is no image / download or upload failed.
 * Never returns the original platform CDN URL.
 */
export async function mirrorProfileImageToR2(
  remoteUrl: string | null | undefined,
  opts: { userId: string; accountId: string; platform?: string },
): Promise<string | null> {
  const url = typeof remoteUrl === "string" ? remoteUrl.trim() : "";
  if (!url) return null;

  const r2Base = getR2PublicBaseUrl();
  if (r2Base && url.startsWith(r2Base)) return url;

  if (!isR2Configured()) {
    console.warn(
      "[mirror-profile-image] R2 not configured; skipping platform avatar",
    );
    return null;
  }

  const httpsOnly = process.env.NODE_ENV === "production";
  if (!isSafeOutboundUrl(url, { httpsOnly })) return null;
  if (!(await isSafeResolvedOutboundUrl(url, { httpsOnly }))) return null;

  try {
    const res = await safeFetch(url, {
      headers: fetchHeaders(url, opts.platform),
      httpsOnly,
    });
    if (!res?.ok) {
      console.warn(
        "[mirror-profile-image] download failed:",
        res?.status ?? "blocked",
        opts.platform,
      );
      return null;
    }

    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0 || body.length > MAX_AVATAR_BYTES) return null;

    const contentType = resolveImageContentType(
      res.headers.get("content-type"),
      body,
    );
    if (!contentType) return null;

    const ext = extensionForContentType(contentType);
    const key = `avatars/${opts.userId}/${opts.accountId}-${crypto.randomUUID()}.${ext}`;
    return await uploadToR2(key, body, contentType);
  } catch (e) {
    console.warn("[mirror-profile-image] failed:", e);
    return null;
  }
}
