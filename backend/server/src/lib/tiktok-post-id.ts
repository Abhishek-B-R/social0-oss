/**
 * TikTok video ids are 64-bit integers. JSON.parse turns them into unsafe JS
 * numbers (precision loss / scientific notation), so View never gets a usable id.
 * Status fetch also often returns only `publish_id` until the post is public.
 */

export const TIKTOK_PUBLISH_ID_PREFIX = "ttpub:";

/** Quote integer literals with 16+ digits so they survive JSON.parse as strings. */
export function parseTikTokJson(text: string): unknown {
  const quoted = text.replace(
    /([:\[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g,
    '$1"$2"',
  );
  return JSON.parse(quoted);
}

export function isTikTokVideoId(id: string | null | undefined): boolean {
  return typeof id === "string" && /^\d{10,}$/.test(id);
}

export function tiktokPublishIdFromStored(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  if (stored.startsWith(TIKTOK_PUBLISH_ID_PREFIX)) {
    return stored.slice(TIKTOK_PUBLISH_ID_PREFIX.length) || null;
  }
  if (stored.startsWith("v_")) return stored;
  return null;
}

export function firstTikTokPublicVideoId(raw: unknown): string | null {
  if (raw == null) return null;
  if (
    typeof raw === "string" ||
    typeof raw === "number" ||
    typeof raw === "bigint"
  ) {
    // Numbers may already be corrupted — only accept clean digit strings.
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || !Number.isSafeInteger(raw)) return null;
      const s = String(Math.trunc(raw));
      return isTikTokVideoId(s) ? s : null;
    }
    const s = String(raw).trim();
    return isTikTokVideoId(s) ? s : null;
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return firstTikTokPublicVideoId(raw[0]);
}

/** Prefer the public video id; otherwise keep the publish_id so we can resolve later. */
export function storedTikTokPostId(opts: {
  publishId: string;
  publicIds?: unknown;
}): string {
  const videoId = firstTikTokPublicVideoId(opts.publicIds);
  if (videoId) return videoId;
  return `${TIKTOK_PUBLISH_ID_PREFIX}${opts.publishId}`;
}

export function isTikTokApiOk(
  data: { error?: { code?: string } } | null | undefined,
  httpOk: boolean,
): boolean {
  if (!httpOk) return false;
  const code = data?.error?.code;
  return !code || code === "ok";
}
