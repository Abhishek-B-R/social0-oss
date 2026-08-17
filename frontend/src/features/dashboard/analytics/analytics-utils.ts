/** Shared metric formatting for analytics UI. */

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

export const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  bluesky: "Bluesky",
  youtube: "YouTube",
  pinterest: "Pinterest",
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter_x: "X",
  threads: "Threads",
};

export const RANGE_OPTIONS = [
  { value: "7d" as const, label: "Past week" },
  { value: "30d" as const, label: "Past month" },
  { value: "90d" as const, label: "Past 3 months" },
  { value: "365d" as const, label: "Past year" },
];
