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
import { VIZ } from "./analytics-colors";

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
  { key: "views", name: "Views", fill: VIZ.emerald },
  { key: "likes", name: "Likes", fill: VIZ.rose },
  { key: "comments", name: "Comments", fill: VIZ.blue },
  { key: "shares", name: "Shares", fill: VIZ.amber },
] as const satisfies PlatformChartModel["activeSeries"];

function dayDate(iso: string): Date | null {
  const bare = iso.slice(0, 10);
  const d = new Date(`${bare}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function chartDayTick(iso: string, days: number): string {
  const d = dayDate(iso);
  if (!d) return "";
  if (days > 180) return format(d, "MMM");
  return format(d, "MMM d");
}

export function axisTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 1000) return formatMetric(v);
  return String(Math.round(v));
}

/** Nice Y-axis ceiling from raw values (readable tick steps). */
export function niceAxisMax(values: number[]): number {
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  if (max <= 0) return 4;
  const padded = max * 1.05;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  const step =
    ([1, 1.5, 2, 2.5, 5, 10] as const).find((s) => normalized <= s) ?? 10;
  return step * magnitude;
}

/** Stage: normalize_trend */
export function buildTrendChartModel(data: TrendPoint[]): TrendChartModel {
  const dayCount = data.length;
  const rows = data.flatMap((d) => {
    const parsed = dayDate(d.date);
    if (!parsed) return [];
    return [
      {
        ...d,
        tick: chartDayTick(d.date, dayCount),
        fullDate: format(parsed, "MMM d, yyyy"),
      },
    ];
  });
  return { rows, dayCount };
}

/** Stage: normalize_platform */
export function buildPlatformChartModel(
  rows: PlatformChartRow[],
): PlatformChartModel {
  const activeRows = rows.filter(
    (row) =>
      row.views > 0 || row.likes > 0 || row.comments > 0 || row.shares > 0,
  );
  const activeSeries = PLATFORM_SERIES.filter((s) =>
    activeRows.some((row) => row[s.key] > 0),
  );
  return { rows: activeRows, activeSeries };
}

/** Stage: normalize_mix */
export function buildMixChartModel(slices: MixSlice[]): MixChartModel {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  return { slices, total };
}
