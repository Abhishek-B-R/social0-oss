/**
 * Accept whatever a client sent for a timestamp — `Date`, ISO string, epoch
 * millis — and return a valid `Date`, or null. Both the dashboard and `/v1`
 * post services parse scheduling input, and both had this.
 */
export function coerceDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
