/** Shared lookback window for analytics + inbox. Mirrors X Analytics: 7D / 2W / 4W / 3M / 1Y + custom. */

export const WINDOW_PRESETS = ["7d", "14d", "28d", "90d", "365d"] as const;
export type WindowPreset = (typeof WINDOW_PRESETS)[number];
export type DateWindowRange = WindowPreset | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_MS: Record<WindowPreset, number> = {
  "7d": 7 * DAY_MS,
  "14d": 14 * DAY_MS,
  "28d": 28 * DAY_MS,
  "90d": 90 * DAY_MS,
  "365d": 365 * DAY_MS,
};

const MAX_CUSTOM_MS = PRESET_MS["365d"];

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

export function parseDateWindow(input: {
  range?: unknown;
  since?: unknown;
  until?: unknown;
}): { range: DateWindowRange; since: Date; until: Date } {
  const now = new Date();
  const raw = typeof input.range === "string" ? mapLegacyRange(input.range) : "7d";

  if (raw === "custom") {
    let until = parseDate(input.until) ?? now;
    if (until.getTime() > now.getTime()) until = now;
    let since = parseDate(input.since);
    if (!since || since >= until) {
      since = new Date(until.getTime() - PRESET_MS["7d"]);
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
    since: new Date(now.getTime() - PRESET_MS[preset]),
    until: now,
  };
}

/** Keep undated items; otherwise require timestamp inside [since, until]. */
export function inDateWindow(
  iso: string | null | undefined,
  since: Date,
  until: Date,
): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return t >= since.getTime() && t <= until.getTime();
}
