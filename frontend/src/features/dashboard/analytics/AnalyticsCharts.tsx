import { memo, useId, useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ChartBar, ChartLine } from "@/icons/phosphor";
import { cn } from "@/lib/utils";
import { formatMetric } from "./analytics-utils";
import { VIZ } from "./analytics-colors";
import { axisTick, chartDayTick } from "./chart-pipeline";
import { metricMeta, type MetricKey, type SeriesRow } from "./analytics-model";

const GRID = "var(--color-border, #e5e7eb)";
const MUTED = "var(--color-text-muted, #6b7280)";
const PREVIOUS = "var(--color-text-subtle, #9ca3af)";
const ACCENT = VIZ.emerald;
const COMPARE = VIZ.amber;

const CHART_MOTION = { duration: 320, easing: "ease-out" as const };

export type TrendChartView = "line" | "bar";
/** What the chart overlays on the active metric. */
export type TrendCompare = "previous" | "none" | MetricKey;

export function TrendChartViewToggle({
  value,
  onChange,
}: {
  value: TrendChartView;
  onChange: (next: TrendChartView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Chart type"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-bg-muted p-0.5"
    >
      {(
        [
          { id: "line" as const, label: "Line", Icon: ChartLine },
          { id: "bar" as const, label: "Bar", Icon: ChartBar },
        ] as const
      ).map(({ id, label, Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            aria-label={`${label} chart`}
            title={`${label} chart`}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-full transition-[color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-9 touch:w-10",
              selected
                ? "bg-bg-elevated text-text shadow-sm"
                : "text-text-muted hover:text-text",
            )}
          >
            <Icon size={14} weight={selected ? "fill" : "regular"} />
          </button>
        );
      })}
    </div>
  );
}

type ChartRow = {
  date: string;
  fullDate: string;
  /** Active metric; null on today's still-running day (drawn by `tail`). */
  cur: number | null;
  /** Dashed segment into today's partial day. */
  tail: number | null;
  /** Raw active value for the tooltip and bars. */
  value: number;
  prev: number | null;
  prevDate: string | null;
  other: number | null;
};

function dayDate(iso: string): Date | null {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildRows(
  rows: SeriesRow[],
  previous: SeriesRow[] | null,
  metric: MetricKey,
  compare: TrendCompare,
  ongoingToday: boolean,
): ChartRow[] {
  const last = rows.length - 1;
  const dashLast = ongoingToday && rows.length >= 2;
  return rows.map((r, i) => {
    const d = dayDate(r.date);
    const prevRow = compare === "previous" ? previous?.[i] : undefined;
    const pd = prevRow ? dayDate(prevRow.date) : null;
    const value = r[metric];
    return {
      date: r.date,
      fullDate: d ? format(d, "EEE, MMM d, yyyy") : r.date,
      cur: dashLast && i === last ? null : value,
      tail: dashLast && i >= last - 1 ? value : null,
      value,
      prev: prevRow ? prevRow[metric] : null,
      prevDate: pd ? format(pd, "MMM d") : null,
      other:
        compare !== "previous" && compare !== "none" ? r[compare] : null,
    };
  });
}

function TrendTooltip({
  active,
  payload,
  metric,
  compare,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  metric: MetricKey;
  compare: TrendCompare;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const otherKey = compare !== "previous" && compare !== "none" ? compare : null;
  return (
    <div className="rounded-xl border border-border/80 bg-bg-elevated/95 px-3 py-2 text-xs shadow-lg backdrop-blur-md">
      <p className="mb-1.5 font-medium text-text">{row.fullDate}</p>
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-text-muted">
          <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: ACCENT }} />
          <span>{metricMeta(metric).label}</span>
          <span className="ml-auto pl-4 font-medium tabular-nums text-text">
            {formatMetric(row.value)}
          </span>
        </p>
        {compare === "previous" && row.prev != null ? (
          <p className="flex items-center gap-2 text-text-muted">
            <span
              className="inline-block h-0 w-3 shrink-0 border-t-2 border-dashed"
              style={{ borderColor: PREVIOUS }}
            />
            <span>Previous{row.prevDate ? ` (${row.prevDate})` : ""}</span>
            <span className="ml-auto pl-4 font-medium tabular-nums text-text">
              {formatMetric(row.prev)}
            </span>
          </p>
        ) : null}
        {otherKey && row.other != null ? (
          <p className="flex items-center gap-2 text-text-muted">
            <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: COMPARE }} />
            <span>{metricMeta(otherKey).label}</span>
            <span className="ml-auto pl-4 font-medium tabular-nums text-text">
              {formatMetric(row.other)}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One chart for the active KPI tab. The previous period rides along as a
 * dashed grey line (aligned day by day); today's unfinished day is dashed.
 */
export const MetricTrendChart = memo(function MetricTrendChart({
  rows,
  previous,
  metric,
  compare,
  view,
  ongoingToday,
  className,
}: {
  rows: SeriesRow[];
  previous: SeriesRow[] | null;
  metric: MetricKey;
  compare: TrendCompare;
  view: TrendChartView;
  ongoingToday: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;
  const fillId = useId().replace(/:/g, "");
  const data = useMemo(
    () => buildRows(rows, previous, metric, compare, ongoingToday),
    [rows, previous, metric, compare, ongoingToday],
  );
  const dayCount = data.length;
  // Long ranges label months only; tick the 1st of each month so a month
  // never shows twice ("Nov Nov Dec Dec").
  const monthTicks = useMemo(
    () => (dayCount > 180 ? data.filter((r) => r.date.slice(8, 10) === "01").map((r) => r.date) : undefined),
    [data, dayCount],
  );
  const otherKey = compare !== "previous" && compare !== "none" ? compare : null;
  const showPrev = compare === "previous" && !!previous?.length;
  const lastIndex = data.length - 1;

  const label = `${metricMeta(metric).label} per day${
    showPrev ? ", with the previous period dashed" : ""
  }`;

  return (
    <div
      className={cn("h-56 w-full min-w-0 sm:h-72 [&_.recharts-surface]:outline-none", className)}
      role="img"
      aria-label={label}
    >
      <ResponsiveContainer width="100%" height="100%" debounce={120}>
        <ComposedChart data={data} margin={{ top: 8, right: otherKey ? 4 : 12, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.24} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={monthTicks}
            tickFormatter={(iso) => chartDayTick(String(iso), dayCount)}
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            tickMargin={8}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            allowDecimals={false}
            tickFormatter={(v) => axisTick(Number(v))}
          />
          {otherKey ? (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: MUTED, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              allowDecimals={false}
              tickFormatter={(v) => axisTick(Number(v))}
            />
          ) : null}
          <Tooltip
            content={<TrendTooltip metric={metric} compare={compare} />}
            cursor={
              view === "bar"
                ? { fill: "var(--color-bg-muted)", opacity: 0.4 }
                : { stroke: GRID, strokeWidth: 1 }
            }
            isAnimationActive={false}
          />
          {showPrev ? (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="prev"
              name="Previous period"
              stroke={PREVIOUS}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={animate}
              animationDuration={CHART_MOTION.duration}
              animationEasing={CHART_MOTION.easing}
            />
          ) : null}
          {/*
            Every series is a direct child of the chart, never inside a
            fragment: Recharts 2 finds its children with react-is 18, which
            doesn't recognise React 19 fragments. A fragment here silently
            dropped the area, so the chart drew only the (empty) previous
            period and a flat 0-4 axis while the totals said 7.4K views.
          */}
          {view === "line" ? (
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="cur"
              name={metricMeta(metric).label}
              stroke={ACCENT}
              strokeWidth={2}
              fill={`url(#${fillId})`}
              dot={false}
              activeDot={{ r: 4, fill: ACCENT, stroke: "var(--color-bg-elevated)", strokeWidth: 2 }}
              isAnimationActive={animate}
              animationDuration={CHART_MOTION.duration}
              animationEasing={CHART_MOTION.easing}
            />
          ) : null}
          {view === "line" ? (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="tail"
              name="Today so far"
              stroke={ACCENT}
              strokeWidth={2}
              strokeDasharray="3 3"
              dot={false}
              activeDot={{ r: 4, fill: ACCENT, stroke: "var(--color-bg-elevated)", strokeWidth: 2 }}
              legendType="none"
              isAnimationActive={false}
            />
          ) : null}
          {view === "bar" ? (
            <Bar
              yAxisId="left"
              dataKey="value"
              name={metricMeta(metric).label}
              fill={ACCENT}
              maxBarSize={18}
              radius={[4, 4, 0, 0]}
              isAnimationActive={animate}
              animationDuration={CHART_MOTION.duration}
              animationEasing={CHART_MOTION.easing}
            >
              {data.map((row, i) => (
                <Cell
                  key={row.date}
                  fillOpacity={ongoingToday && i === lastIndex ? 0.45 : 1}
                />
              ))}
            </Bar>
          ) : null}
          {otherKey ? (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="other"
              name={metricMeta(otherKey).label}
              stroke={COMPARE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: COMPARE, stroke: "var(--color-bg-elevated)", strokeWidth: 2 }}
              isAnimationActive={animate}
              animationDuration={CHART_MOTION.duration}
              animationEasing={CHART_MOTION.easing}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});

/** Legend under the chart: what each line means. */
export function TrendLegend({
  metric,
  compare,
  hasPrevious,
  ongoingToday,
  view,
}: {
  metric: MetricKey;
  compare: TrendCompare;
  hasPrevious: boolean;
  ongoingToday: boolean;
  view: TrendChartView;
}) {
  const otherKey = compare !== "previous" && compare !== "none" ? compare : null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={cn(view === "bar" ? "size-2 rounded-sm" : "h-0.5 w-4 rounded-full")}
          style={{ background: ACCENT }}
          aria-hidden
        />
        {metricMeta(metric).label}
      </span>
      {compare === "previous" && hasPrevious ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: PREVIOUS }}
            aria-hidden
          />
          Previous period
        </span>
      ) : null}
      {otherKey ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: COMPARE }} aria-hidden />
          {metricMeta(otherKey).label}
        </span>
      ) : null}
      {ongoingToday ? (
        <span className="text-text-subtle">
          {view === "bar" ? "Faded bar" : "Dashed end"} = today so far
        </span>
      ) : null}
    </div>
  );
}
