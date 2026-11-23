/**
 * Natural-language schedule parser.
 *
 * Strategy (once-and-for-all):
 * - Explicit ISO / wall-clock strings → deterministic path (preserve Z/offsets)
 * - Everything else → chrono-node, but ONLY if it consumes the whole input
 *   (partial matches like "Aug 32 2026 9am" → "9am" are rejected)
 * - Slash dates refused (MM/DD vs DD/MM is locale-ambiguous)
 * - Always reject past times
 *
 * Competitors (Postiz / Postbridge) require ISO only; we keep NL as a UX feature
 * but refuse to guess when the phrase is ambiguous.
 */
import * as chrono from "chrono-node";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a local Date as wall-clock ISO without UTC conversion. */
export function formatLocalWallClock(date: Date, timezone = "default"): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const base = `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
  return timezone === "default" ? `${base}+default` : base;
}

function assertFuture(date: Date, input: string): void {
  if (date.getTime() <= Date.now()) {
    throw new Error(`Scheduled time must be in the future: "${input}"`);
  }
}

function parseFail(input: string): never {
  throw new Error(`Unable to parse time: "${input}"\n${formatScheduleHelp()}`);
}

function buildCalendarDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  input: string,
): Date {
  if (minutes > 59 || hours > 23 || hours < 0 || minutes < 0) {
    throw new Error(`Invalid clock time in: "${input}"`);
  }
  const target = new Date(year, month, day, hours, minutes, 0, 0);
  if (
    target.getFullYear() !== year ||
    target.getMonth() !== month ||
    target.getDate() !== day
  ) {
    throw new Error(`Invalid calendar date in: "${input}"`);
  }
  return target;
}

/** Strict ISO / `YYYY-MM-DD[ HH:mm]` — no chrono guessing. */
function parseExplicitIso(raw: string, trimmed: string): { date: Date; passthrough?: string } | null {
  // Date-only → that day at 9:00 local
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    return { date: buildCalendarDate(y, m - 1, d, 9, 0, raw) };
  }

  // YYYY-MM-DD HH:mm[:ss]
  const space = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (space) {
    return {
      date: buildCalendarDate(
        Number(space[1]),
        Number(space[2]) - 1,
        Number(space[3]),
        Number(space[4]),
        Number(space[5]),
        raw,
      ),
    };
  }

  // Full ISO with T (optional Z / offset / +default)
  const isoT = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})t(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(z|[+-]\d{2}:?\d{2}|\+default)?$/i,
  );
  if (isoT) {
    const date = buildCalendarDate(
      Number(isoT[1]),
      Number(isoT[2]) - 1,
      Number(isoT[3]),
      Number(isoT[4]),
      Number(isoT[5]),
      raw,
    );
    if (isoT[7]) return { date, passthrough: raw };
    return { date };
  }

  return null;
}

/**
 * chrono must consume the entire phrase. Partial hits are the silent-wrong-date class
 * (e.g. "Aug 32 2026 9am" matching only "9am").
 */
function parseWithChrono(raw: string, trimmed: string): Date {
  const results = chrono.parse(trimmed, new Date(), { forwardDate: true });
  if (results.length === 0) parseFail(raw);

  const hit = results[0]!;
  if (hit.index !== 0) parseFail(raw);

  const consumed = hit.text.trim();
  const remainder = trimmed.slice(consumed.length).replace(/^[,\s]+/, "").trim();
  if (remainder.length > 0) parseFail(raw);

  // If chrono only matched a time fragment inside a longer garbage string, index/remainder
  // already catch it. Still validate the Date components when year/month/day were implied.
  return hit.start.date();
}

export function parseNaturalTime(input: string, timezone = "default"): string {
  const raw = input.trim();
  if (!raw) parseFail(input);
  const trimmed = raw.toLowerCase();

  // Locale-ambiguous — force ISO or month name (same stance as refusing to guess)
  if (/\d{1,2}\/\d{1,2}(\/\d{2,4})?/.test(trimmed)) {
    throw new Error(
      `Ambiguous date format: "${input}". Use ISO (2026-08-10 09:00) or a month name (Aug 10 2026 9am).\n${formatScheduleHelp()}`,
    );
  }

  if (trimmed === "now") {
    return formatLocalWallClock(new Date(), timezone);
  }

  const explicit = parseExplicitIso(raw, trimmed);
  if (explicit) {
    assertFuture(explicit.date, input);
    if (explicit.passthrough) return explicit.passthrough;
    return formatLocalWallClock(explicit.date, timezone);
  }

  const date = parseWithChrono(raw, trimmed);
  assertFuture(date, input);
  return formatLocalWallClock(date, timezone);
}

export function formatScheduleHelp(): string {
  return [
    "Examples:",
    "  today 8pm",
    "  tomorrow",
    "  tomorrow 9am",
    "  monday 9am",
    "  next monday 9am",
    "  next week",
    "  noon",
    "  Aug 8 2026 9:00am",
    "  August 8th 2026 9am",
    "  in 2 hours",
    "  in 1 week",
    "  in 2 days at 3pm",
    "  2026-08-10 14:00",
    "  2026-08-10T14:00:00Z",
  ].join("\n");
}
