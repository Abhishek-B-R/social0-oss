import { format } from "date-fns";

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

/** Date-fns pattern for "medium" style date (e.g. "Dec 25, 2025") for pickers. Uses locale-neutral month name. */
export function getMediumDatePattern(
  dateFormat: DateFormatKey | string | null | undefined,
): string {
  const key = normalizeDateFormat(dateFormat ?? undefined);
  switch (key) {
    case "dd/MM/yyyy":
      return "dd MMM yyyy";
    case "MM/dd/yyyy":
      return "MMM dd, yyyy";
    case "yyyy-MM-dd":
      return "yyyy MMM dd";
    default:
      return "dd MMM yyyy";
  }
}

/** Format for "MMM d, yyyy 'at' HH:mm" style used in schedule picker; date part follows user preference. */
export function formatDateTimeAt(
  date: Date,
  options: {
    dateFormat?: DateFormatKey | string | null;
    use24HourTimeFormat?: boolean;
    timezone?: string | null;
  },
): string {
  const key = normalizeDateFormat(options.dateFormat ?? undefined);
  if (
    options.timezone &&
    options.timezone.trim() &&
    options.timezone.trim() !== "UTC"
  ) {
    try {
      const dateStr = formatDateInZone(date, options.timezone.trim(), key);
      const timeParts = new Intl.DateTimeFormat("en-US", {
        timeZone: options.timezone.trim(),
        hour: "2-digit",
        minute: "2-digit",
        hour12: !options.use24HourTimeFormat,
      }).formatToParts(date);
      const hour = timeParts.find((p) => p.type === "hour")?.value ?? "";
      const minute = timeParts.find((p) => p.type === "minute")?.value ?? "";
      const dayPeriod =
        timeParts.find((p) => p.type === "dayPeriod")?.value ?? "";
      const timeStr = options.use24HourTimeFormat
        ? `${hour}:${minute}`
        : `${hour}:${minute} ${dayPeriod}`;
      return `${dateStr} at ${timeStr}`;
    } catch {
      // fallback below
    }
  }
  const timePart = options.use24HourTimeFormat ? "HH:mm" : "h:mm a";
  const datePart = format(date, key);
  return `${datePart} at ${format(date, timePart)}`;
}
