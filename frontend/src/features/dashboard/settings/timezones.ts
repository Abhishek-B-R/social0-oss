const FALLBACK_ZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function offsetMinutes(tz: string, now: Date): number {
  try {
    const part =
      new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "longOffset" })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = part.replace(/^GMT\s*/i, "").trim();
    if (!m) return 0;
    const sign = m.startsWith("-") ? -1 : 1;
    const [h, min] = m.replace(/^[+-]/, "").split(":").map((s) => parseInt(s ?? "0", 10));
    return sign * ((h || 0) * 60 + (min || 0));
  } catch {
    return 0;
  }
}

let cached: string[] | null = null;

/** Every IANA zone the browser knows, west to east, then A–Z. */
export function sortedTimeZones(): string[] {
  if (cached) return cached;
  const raw =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? (Intl as unknown as { supportedValuesOf(k: "timeZone"): string[] }).supportedValuesOf(
          "timeZone",
        )
      : FALLBACK_ZONES;
  const now = new Date();
  const offsets = new Map(raw.map((tz) => [tz, offsetMinutes(tz, now)]));
  cached = [...raw].sort(
    (a, b) => (offsets.get(a) ?? 0) - (offsets.get(b) ?? 0) || a.localeCompare(b),
  );
  return cached;
}

/** The browser's zone, or "" when unknown. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() ?? "";
  } catch {
    return "";
  }
}
