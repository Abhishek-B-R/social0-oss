/**
 * TikTok video ids are 64-bit integers. JSON.parse turns them into unsafe JS
 * numbers (precision loss / scientific notation), so View never gets a usable id.
 */

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
