/** Shared metric formatting for analytics UI. */

import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { MetricMap } from "@/api/analytics";

const COMPACT_UNITS: readonly (readonly [number, string])[] = [
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "K"],
];

export function formatMetric(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  // Each unit takes over once the value would round to 1.0 of it, so
  // 999,960 reads "1.0M" (not "1000.0K") and billions read "3.7B".
  for (const [size, unit] of COMPACT_UNITS) {
    if (abs >= size * 0.99995) return `${(n / size).toFixed(1)}${unit}`;
  }
  return Math.round(n).toLocaleString();
}

export function engagementOf(m: MetricMap): number {
  return (
    (m.likes ?? 0) +
    (m.comments ?? 0) +
    (m.shares ?? 0) +
    (m.reposts ?? 0) +
    (m.quotes ?? 0) +
    (m.saves ?? 0) +
    (m.clicks ?? 0)
  );
}

export function viewsOf(m: MetricMap): number | undefined {
  if (m.views != null && Number.isFinite(m.views)) return m.views;
  if (m.impressions != null && Number.isFinite(m.impressions)) return m.impressions;
  return undefined;
}

export type MixSlice = { key: string; label: string; value: number };

/** Engagement composition for a single account (skips zeros). */
export function engagementMix(m: MetricMap): MixSlice[] {
  const slices: MixSlice[] = [
    { key: "likes", label: "Likes", value: m.likes ?? 0 },
    { key: "comments", label: "Comments", value: m.comments ?? 0 },
    {
      key: "shares",
      label: "Shares",
      value: (m.shares ?? 0) + (m.reposts ?? 0),
    },
    { key: "quotes", label: "Quotes", value: m.quotes ?? 0 },
    { key: "saves", label: "Saves", value: m.saves ?? 0 },
    { key: "clicks", label: "Clicks", value: m.clicks ?? 0 },
  ];
  return slices.filter((s) => s.value > 0);
}

/** Inclusive range label; keeps the start year when the window crosses New Year. */
export function formatRangeLabel(
  since: string,
  until: string,
  timeZone = "UTC",
): string {
  try {
    const sameYear =
      formatInTimeZone(since, timeZone, "yyyy") ===
      formatInTimeZone(until, timeZone, "yyyy");
    if (sameYear) {
      return `${formatInTimeZone(since, timeZone, "MMM d")} - ${formatInTimeZone(until, timeZone, "MMM d, yyyy")}`;
    }
    return `${formatInTimeZone(since, timeZone, "MMM d, yyyy")} - ${formatInTimeZone(until, timeZone, "MMM d, yyyy")}`;
  } catch {
    const a = new Date(since);
    const b = new Date(until);
    if (a.getFullYear() === b.getFullYear()) {
      return `${format(a, "MMM d")} - ${format(b, "MMM d, yyyy")}`;
    }
    return `${format(a, "MMM d, yyyy")} - ${format(b, "MMM d, yyyy")}`;
  }
}
