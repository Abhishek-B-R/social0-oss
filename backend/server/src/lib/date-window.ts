/** Shared lookback window for analytics + inbox. Mirrors X Analytics: 7D / 2W / 4W / 3M / 1Y + custom. */

import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const WINDOW_PRESETS = ["7d", "14d", "28d", "90d", "365d"] as const;
export type WindowPreset = (typeof WINDOW_PRESETS)[number];
export type DateWindowRange = WindowPreset | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Inclusive calendar-day counts (today + N-1 prior days). */
const PRESET_DAYS: Record<WindowPreset, number> = {
  "7d": 7,
  "14d": 14,
  "28d": 28,
  "90d": 90,
  "365d": 365,
};

const MAX_CUSTOM_MS = PRESET_DAYS["365d"] * DAY_MS;

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapLegacyRange(raw: string): string {
  if (raw === "1d") return "7d";
  if (raw === "30d") return "28d";
  return raw;
}

function validTz(timeZone: string | undefined): string {
  const tz = timeZone?.trim();
  if (!tz) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** UTC instant for calendar midnight of `date` in `timeZone`. */
export function startOfZonedDay(date: Date, timeZone: string): Date {
  const tz = validTz(timeZone);
  const z = toZonedTime(date, tz);
  return fromZonedTime(
    new Date(z.getFullYear(), z.getMonth(), z.getDate(), 0, 0, 0, 0),
    tz,
  );
}

/** Calendar-day arithmetic in `timeZone` (DST-safe; never uses server-local time). */
export function addZonedCalendarDays(date: Date, days: number, timeZone: string): Date {
  const tz = validTz(timeZone);
  const z = toZonedTime(date, tz);
  return fromZonedTime(
    new Date(z.getFullYear(), z.getMonth(), z.getDate() + days, 0, 0, 0, 0),
    tz,
  );
}

/** YYYY-MM-DD in the given IANA zone. */
export function calendarDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: validTz(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parseDateWindow(
  input: {
    range?: unknown;
    since?: unknown;
    until?: unknown;
  },
  timeZone = "UTC",
): { range: DateWindowRange; since: Date; until: Date } {
  const tz = validTz(timeZone);
  const now = new Date();
  const raw = typeof input.range === "string" ? mapLegacyRange(input.range) : "7d";

  if (raw === "custom") {
    let until = parseDate(input.until) ?? now;
    if (until.getTime() > now.getTime()) until = now;
    let since = parseDate(input.since);
    // Custom ISO is already zoned from the client - do not startOfDay again.
    if (!since || since >= until) {
      since = addZonedCalendarDays(until, -(PRESET_DAYS["7d"] - 1), tz);
    }
    if (until.getTime() - since.getTime() > MAX_CUSTOM_MS) {
      since = new Date(until.getTime() - MAX_CUSTOM_MS);
    }
    return { range: "custom", since, until };
  }

  const preset: WindowPreset = (WINDOW_PRESETS as readonly string[]).includes(raw)
    ? (raw as WindowPreset)
    : "7d";
  return {
    range: preset,
    since: addZonedCalendarDays(now, -(PRESET_DAYS[preset] - 1), tz),
    until: now,
  };
}

/** Keep undated items by default (comments); pass keepUndated:false for DM list rows. */
export function inDateWindow(
  iso: string | null | undefined,
  since: Date,
  until: Date,
  opts?: { keepUndated?: boolean },
): boolean {
  const keepUndated = opts?.keepUndated !== false;
  if (!iso) return keepUndated;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return keepUndated;
  return t >= since.getTime() && t <= until.getTime();
}
