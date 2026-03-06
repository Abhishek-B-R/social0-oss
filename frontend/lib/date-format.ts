import { format } from "date-fns";

/** Stored value in user_settings.date_format (date-fns pattern). */
export type DateFormatKey = "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";

export const DATE_FORMAT_OPTIONS: { value: DateFormatKey; label: string }[] = [
  { value: "dd/MM/yyyy", label: "DD/MM/YYYY (e.g. 25/12/2025)" },
  { value: "MM/dd/yyyy", label: "MM/DD/YYYY (e.g. 12/25/2025)" },
  { value: "yyyy-MM-dd", label: "YYYY-MM-DD (e.g. 2025-12-25)" },
];

const DEFAULT_DATE_FORMAT: DateFormatKey = "dd/MM/yyyy";

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

/** Format date only using the user's date format preference. */
export function formatDate(
  date: Date,
  dateFormat: DateFormatKey | string | null | undefined,
): string {
  const pattern = normalizeDateFormat(dateFormat ?? undefined);
  return format(date, pattern);
}

/** Format date and time using user's date format and 24h preference. */
export function formatDateTime(
  date: Date,
  options: {
    dateFormat?: DateFormatKey | string | null;
    use24HourTimeFormat?: boolean;
  },
): string {
  const pattern = normalizeDateFormat(options.dateFormat ?? undefined);
  const timePattern = options.use24HourTimeFormat ? "HH:mm" : "h:mm a";
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
  },
): string {
  const key = normalizeDateFormat(options.dateFormat ?? undefined);
  const timePart = options.use24HourTimeFormat ? "HH:mm" : "h:mm a";
  const datePart = format(date, key);
  return `${datePart} at ${format(date, timePart)}`;
}
