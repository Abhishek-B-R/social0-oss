/**
 * TikTok video ids are 64-bit integers. JSON.parse turns them into unsafe JS
 * numbers (precision loss / scientific notation), so View never gets a usable id.
 * Status fetch also often returns only `publish_id` until the post is public.
 */

export const TIKTOK_PUBLISH_ID_PREFIX = "ttpub:";

/** Quote integer literals with 16+ digits so they survive JSON.parse as strings. */
export function parseTikTokJson(text: string): unknown {
  const quoted = text.replace(
    /([:[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g,
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

/** How far a video's create_time may sit from our publish time and still match. */
export const TIKTOK_PUBLISH_MATCH_TOLERANCE_MS = 15 * 60 * 1000;

/**
 * `publish/status/fetch` error codes that mean the publish id itself is gone
 * (expired or never known). Only these justify matching by publish time: a
 * pending, private, or failed publish must keep its `ttpub:` id.
 */
export const TIKTOK_DEAD_PUBLISH_ID_CODES: ReadonlySet<string> = new Set([
  "invalid_publish_id",
]);

export type TikTokPublishMatchOptions = {
  toleranceMs?: number;
  /** Video ids already stored on another publication of the same account. */
  claimedVideoIds?: ReadonlySet<string>;
  /**
   * Publish times of the account's other publications that still have no
   * video id. A candidate near one of them could be theirs, so it is not ours.
   */
  rivalPublishedAt?: readonly Date[];
};

/**
 * Pick the one video whose `create_time` (unix seconds) sits within tolerance
 * of when we published. Used to backfill a publication whose short-lived
 * publish id can no longer be resolved. The match must be unambiguous: videos
 * already claimed by another publication are skipped, two unclaimed
 * candidates in the window return null, and so does a candidate that another
 * unresolved publication of the account could equally own. A wrong match is
 * persisted for good, so keeping the `ttpub:` id beats guessing. Returns the
 * id as a string so 64-bit ids survive (see parseTikTokJson).
 */
export function pickTikTokVideoByPublishTime(
  videos: Array<{ id?: unknown; create_time?: unknown }>,
  publishedAt: Date,
  options: TikTokPublishMatchOptions = {},
): string | null {
  const toleranceMs = options.toleranceMs ?? TIKTOK_PUBLISH_MATCH_TOLERANCE_MS;
  const target = publishedAt.getTime();
  if (!Number.isFinite(target)) return null;
  const candidates = new Map<string, number>();
  for (const v of videos) {
    const id = firstTikTokPublicVideoId(v.id);
    if (!id || options.claimedVideoIds?.has(id)) continue;
    const created =
      typeof v.create_time === "number" ? v.create_time : Number(v.create_time);
    if (!Number.isFinite(created)) continue;
    const createdMs = created * 1000;
    if (Math.abs(createdMs - target) > toleranceMs) continue;
    candidates.set(id, createdMs);
  }
  if (candidates.size !== 1) return null;
  const [[id, createdMs]] = [...candidates];
  const contested = (options.rivalPublishedAt ?? []).some((rival) => {
    const t = rival.getTime();
    return Number.isFinite(t) && Math.abs(createdMs - t) <= toleranceMs;
  });
  return contested ? null : id;
}
