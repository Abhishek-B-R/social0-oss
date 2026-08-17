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
  { value: "7d" as const, label: "7 days" },
  { value: "30d" as const, label: "30 days" },
  { value: "90d" as const, label: "90 days" },
  { value: "365d" as const, label: "12 months" },
];
