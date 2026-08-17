export const WINDOW_PRESETS = ["7d", "14d", "28d", "90d", "365d"] as const;
export type WindowPreset = (typeof WINDOW_PRESETS)[number];
export type DateWindowRange = WindowPreset | "custom";

export const WINDOW_PRESET_OPTIONS: Array<{ value: WindowPreset; label: string }> = [
  { value: "7d", label: "7D" },
  { value: "14d", label: "2W" },
  { value: "28d", label: "4W" },
  { value: "90d", label: "3M" },
  { value: "365d", label: "1Y" },
];

export type DateWindow = {
  range: DateWindowRange;
  since?: string;
  until?: string;
};

export function defaultDateWindow(): DateWindow {
  return { range: "7d" };
}

export function windowQueryParams(w: DateWindow): DateWindow {
  if (w.range === "custom") {
    return { range: "custom", since: w.since, until: w.until };
  }
  return { range: w.range };
}

export const WINDOW_EMPTY_LABEL: Record<WindowPreset, string> = {
  "7d": "the last 7 days",
  "14d": "the last 2 weeks",
  "28d": "the last 4 weeks",
  "90d": "the last 3 months",
  "365d": "the last year",
};
