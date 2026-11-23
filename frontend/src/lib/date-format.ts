import { format, formatDistanceToNowStrict } from "date-fns";

/** Stored value in user_settings.date_format (date-fns pattern). */
export type DateFormatKey = "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";

export const DATE_FORMAT_OPTIONS: { value: DateFormatKey; label: string }[] = [
  { value: "dd/MM/yyyy", label: "DD/MM/YYYY (e.g. 25/12/2025)" },
  { value: "MM/dd/yyyy", label: "MM/DD/YYYY (e.g. 12/25/2025)" },
  { value: "yyyy-MM-dd", label: "YYYY-MM-DD (e.g. 2025-12-25)" },
];

const DEFAULT_DATE_FORMAT: DateFormatKey = "dd/MM/yyyy";

/** Human-readable IANA timezone for UI (e.g. "Asia/Kolkata (GMT+5:30)"). */
export function formatTimezoneLabel(tz: string | null | undefined): string {
  const t = typeof tz === "string" ? tz.trim() : "";
  if (!t) return "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: t,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value;
    if (offsetPart) return `${t} (${offsetPart})`;
  } catch {
    // invalid tz
  }
  return t;
}

export function normalizeDateFormat(
  value: string | null | undefined,
): DateFormatKey {
  if (
    value === "dd/MM/yyyy" ||
    value === "MM/dd/yyyy" ||
    value === "yyyy-MM-dd"
  ) {
    return value;
  }
  return DEFAULT_DATE_FORMAT;
}

/** Format date in a given IANA timezone (e.g. "America/New_York") using Intl. */
function formatDateInZone(
  date: Date,
  timezone: string,
  dateFormat: DateFormatKey,
): string {
  const key = normalizeDateFormat(dateFormat);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  if (key === "dd/MM/yyyy") return `${d}/${m}/${y}`;
  if (key === "MM/dd/yyyy") return `${m}/${d}/${y}`;
  return `${y}-${m}-${d}`;
}

/** Format date and time in a given IANA timezone using Intl. */
function formatDateTimeInZone(
  date: Date,
  timezone: string,
  options: {
    dateFormat: DateFormatKey;
    use24HourTimeFormat?: boolean;
  },
): string {
  const dateStr = formatDateInZone(date, timezone, options.dateFormat);
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: !options.use24HourTimeFormat,
  }).formatToParts(date);
  const hour = timeParts.find((p) => p.type === "hour")?.value ?? "";
  const minute = timeParts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = timeParts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const timeStr =
    options.use24HourTimeFormat ? `${hour}:${minute}` : `${hour}:${minute} ${dayPeriod}`;
  return `${dateStr} ${timeStr}`;
}

/** Format date only using the user's date format preference. Pass timezone to show in user's region. */
export function formatDate(
  date: Date,
  dateFormat: DateFormatKey | string | null | undefined,
  timezone?: string | null,
): string {
  const pattern = normalizeDateFormat(dateFormat ?? undefined);
  if (timezone && timezone.trim() && timezone !== "UTC") {
    try {
      return formatDateInZone(date, timezone.trim(), pattern);
    } catch {
      return format(date, pattern);
    }
  }
  return format(date, pattern);
}

/** Format date and time using user's date format and 24h preference. Pass timezone to show in user's region. */
export function formatDateTime(
  date: Date,
  options: {
    dateFormat?: DateFormatKey | string | null;
    use24HourTimeFormat?: boolean;
    timezone?: string | null;
  },
): string {
  const pattern = normalizeDateFormat(options.dateFormat ?? undefined);
  const timePattern = options.use24HourTimeFormat ? "HH:mm" : "h:mm a";
  if (
    options.timezone &&
    options.timezone.trim() &&
    options.timezone.trim() !== "UTC"
  ) {
    try {
      return formatDateTimeInZone(date, options.timezone.trim(), {
        dateFormat: pattern,
        use24HourTimeFormat: options.use24HourTimeFormat,
      });
    } catch {
      return format(date, `${pattern} ${timePattern}`);
    }
  }
  return format(date, `${pattern} ${timePattern}`);
}

export type RelativeTimeOptions = {
  /** Returned for a missing or unparseable timestamp. Default "". */
  fallback?: string;
  /**
   * Narrow form for dense list rows: "now", "5m", "3h", "4d", "2mo", "1y".
   * No "ago" / "in" suffix. Default false.
   */
  compact?: boolean;
};

const COMPACT_UNIT: Record<string, string> = {
  second: "s",
  seconds: "s",
  minute: "m",
  minutes: "m",
  hour: "h",
  hours: "h",
  day: "d",
  days: "d",
  month: "mo",
  months: "mo",
  year: "y",
  years: "y",
};

/**
 * The one relative timestamp used across the dashboard, so the same moment
 * reads the same on every page: "just now", "5 minutes ago", "in 3 hours".
 * Timestamps within a few seconds in the future (clock skew) also read
 * "just now". Use `formatDateTime` for an absolute tooltip next to it.
 */
export function relativeTime(
  value: string | number | Date | null | undefined,
  options: RelativeTimeOptions = {},
): string {
  const { fallback = "", compact = false } = options;
  if (value == null || value === "") return fallback;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  if (Number.isNaN(t)) return fallback;
  const ageMs = Date.now() - t;
  if (ageMs > -5_000 && ageMs < 45_000) return compact ? "now" : "just now";
  if (!compact) return formatDistanceToNowStrict(d, { addSuffix: true });
  const [n, unit] = formatDistanceToNowStrict(d).split(" ");
  return `${n}${COMPACT_UNIT[unit ?? ""] ?? ""}`;
}
