/** Shared metric formatting for analytics UI. */

import { format } from "date-fns";
import type { MetricMap } from "@/api/analytics";

export function formatMetric(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
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

export function viewsOf(m: MetricMap): number {
  return m.views ?? m.impressions ?? 0;
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
export function formatRangeLabel(since: string, until: string): string {
  const a = new Date(since);
  const b = new Date(until);
  if (a.getFullYear() === b.getFullYear()) {
    return `${format(a, "MMM d")} – ${format(b, "MMM d, yyyy")}`;
  }
  return `${format(a, "MMM d, yyyy")} – ${format(b, "MMM d, yyyy")}`;
}
