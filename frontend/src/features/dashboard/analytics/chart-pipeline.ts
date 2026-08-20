/**
 * Chart data pipeline (graph-skills pattern).
 *
 * retrieve_series -> normalize_trend -> trend_model
 * retrieve_platform -> normalize_platform -> platform_model
 * retrieve_mix -> normalize_mix -> mix_model
 *
 * Each stage is a pure function with a named output so chart components
 * only render; they never re-derive ticks, labels, or active series.
 */

import { format } from "date-fns";
import { formatMetric, type MixSlice } from "./analytics-utils";

export type TrendPoint = {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
};

export type TrendChartRow = TrendPoint & {
  tick: string;
  fullDate: string;
};

export type TrendChartModel = {
  rows: TrendChartRow[];
  dayCount: number;
};

export type PlatformChartRow = {
  platform: string;
  label: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

export type PlatformSeriesKey = "views" | "likes" | "comments" | "shares";

export type PlatformChartModel = {
  rows: PlatformChartRow[];
  activeSeries: ReadonlyArray<{
    key: PlatformSeriesKey;
    name: string;
    fill: string;
  }>;
};

export type MixChartModel = {
  slices: MixSlice[];
  total: number;
};

const PLATFORM_SERIES = [
  { key: "views", name: "Views", fill: "var(--chart-blue, #3b82f6)" },
  { key: "likes", name: "Likes", fill: "var(--chart-rose, #f43f5e)" },
  { key: "comments", name: "Comments", fill: "var(--chart-amber, #f59e0b)" },
  { key: "shares", name: "Shares", fill: "var(--chart-violet, #8b5cf6)" },
] as const satisfies PlatformChartModel["activeSeries"];

function dayDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function chartDayTick(iso: string, days: number): string {
  const d = dayDate(iso);
  if (days > 180) return format(d, "MMM");
  return format(d, "MMM d");
}

export function axisTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 1000) return formatMetric(v);
  return String(Math.round(v));
}

/** Stage: normalize_trend */
export function buildTrendChartModel(data: TrendPoint[]): TrendChartModel {
  const dayCount = data.length;
  const rows = data.map((d) => ({
    ...d,
    tick: chartDayTick(d.date, dayCount),
    fullDate: format(dayDate(d.date), "MMM d, yyyy"),
  }));
  return { rows, dayCount };
}

/** Stage: normalize_platform */
export function buildPlatformChartModel(
  rows: PlatformChartRow[],
): PlatformChartModel {
  const activeSeries = PLATFORM_SERIES.filter((s) =>
    rows.some((row) => row[s.key] > 0),
  );
  return { rows, activeSeries };
}

/** Stage: normalize_mix */
export function buildMixChartModel(slices: MixSlice[]): MixChartModel {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  return { slices, total };
}
