import { memo, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { CaretDown, ChartBar, ChartLine } from "@/icons/phosphor";
import { cn } from "@/lib/utils";
import { formatMetric, type MixSlice } from "./analytics-utils";
import { MIX_COLORS, VIZ } from "./analytics-colors";
import {
  axisTick,
  buildMixChartModel,
  buildPlatformChartModel,
  buildTrendChartModel,
  chartDayTick,
  type PlatformChartRow,
  type TrendPoint,
} from "./chart-pipeline";

const GRID = "var(--color-border, #e5e7eb)";
const MUTED = "var(--color-text-muted, #6b7280)";
const ACCENT = VIZ.emerald;

const CHART_MOTION = { duration: 320, easing: "ease-out" as const };

const ChartTooltip = memo(function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: { fullDate?: string };
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const heading = payload[0]?.payload?.fullDate ?? label;
  return (
    <div className="rounded-xl border border-border/80 bg-bg-elevated/95 px-3 py-2 text-xs shadow-lg backdrop-blur-md">
      <p className="mb-1.5 font-medium tracking-tight text-text">{heading}</p>
      <div className="space-y-1">
        {payload.map((p) => (
          <p key={p.name} className="flex items-center gap-2 text-text-muted">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="min-w-0 truncate">{p.name}</span>
            <span className="ml-auto font-medium tabular-nums text-text">
              {p.value == null ? "-" : formatMetric(p.value)}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
});

function ChartShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-64 w-full min-w-0 sm:h-72 [&_.recharts-surface]:outline-none">
      {children}
    </div>
  );
}

export type TrendChartView = "line" | "bar";

export function TrendChartViewToggle({
  value,
  onChange,
}: {
  value: TrendChartView;
  onChange: (next: TrendChartView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Chart type"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-bg-muted p-1"
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
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97]",
              selected
                ? "bg-bg-elevated text-text shadow-sm"
                : "text-text-muted hover:text-text",
            )}
          >
            <Icon size={14} weight={selected ? "fill" : "regular"} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export const EngagementTrendChart = memo(function EngagementTrendChart({
  data,
  view = "line",
}: {
  data: TrendPoint[];
  view?: TrendChartView;
}) {
  const reduceMotion = useReducedMotion();
  const model = useMemo(() => buildTrendChartModel(data), [data]);
  const animate = !reduceMotion;
  const fillId = useId().replace(/:/g, "");
  const [leftMetric, setLeftMetric] = useState<"views" | "likes" | "comments" | "shares">("views");
  const [rightMetric, setRightMetric] = useState<"engagement" | "likes" | "comments" | "shares">("engagement");

  if (model.rows.length === 0) {
    return (
      <EmptyChart message="No published posts with metrics in this range yet." />
    );
  }

  const leftMeta = METRIC_OPTIONS.find((m) => m.key === leftMetric)!;
  const rightMeta = METRIC_OPTIONS.find((m) => m.key === rightMetric)!;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <MetricPicker
          value={leftMetric}
          color={ACCENT}
          options={LEFT_METRIC_OPTIONS}
          onChange={setLeftMetric}
          ariaLabel="Primary metric"
        />
        <span className="text-xs text-text-subtle" aria-hidden>
          vs
        </span>
        <MetricPicker
          value={rightMetric}
          color={VIZ.amber}
          options={RIGHT_METRIC_OPTIONS}
          onChange={setRightMetric}
          ariaLabel="Compare metric"
        />
      </div>
      <ChartShell>
        <ResponsiveContainer width="100%" height="100%" debounce={120}>
          {view === "line" ? (
            <ComposedChart
              data={model.rows}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            >
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(iso) => chartDayTick(String(iso), model.dayCount)}
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
                tickMargin={8}
              />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
                allowDecimals={false}
                tickFormatter={(v) => axisTick(Number(v))}
              />
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
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: GRID, strokeWidth: 1 }}
                isAnimationActive={false}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey={leftMetric}
                name={leftMeta.label}
                stroke={ACCENT}
                strokeWidth={2}
                fill={`url(#${fillId})`}
                dot={false}
                activeDot={{ r: 4, fill: ACCENT, stroke: "var(--color-bg-elevated)", strokeWidth: 2 }}
                isAnimationActive={animate}
                animationDuration={CHART_MOTION.duration}
                animationEasing={CHART_MOTION.easing}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey={rightMetric}
                name={rightMeta.label}
                stroke={VIZ.amber}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: VIZ.amber, stroke: "var(--color-bg-elevated)", strokeWidth: 2 }}
                isAnimationActive={animate}
                animationDuration={CHART_MOTION.duration}
                animationEasing={CHART_MOTION.easing}
              />
            </ComposedChart>
          ) : (
            <BarChart
              data={model.rows}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              barGap={2}
              barCategoryGap="28%"
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(iso) => chartDayTick(String(iso), model.dayCount)}
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
                tickMargin={8}
              />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
                allowDecimals={false}
                tickFormatter={(v) => axisTick(Number(v))}
              />
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
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "var(--color-bg-muted)", opacity: 0.35 }}
                isAnimationActive={false}
              />
              <Bar
                yAxisId="left"
                dataKey={leftMetric}
                name={leftMeta.label}
                fill={ACCENT}
                maxBarSize={18}
                radius={[4, 4, 0, 0]}
                isAnimationActive={animate}
                animationDuration={CHART_MOTION.duration}
                animationEasing={CHART_MOTION.easing}
              />
              <Bar
                yAxisId="right"
                dataKey={rightMetric}
                name={rightMeta.label}
                fill={VIZ.amber}
                maxBarSize={18}
                radius={[4, 4, 0, 0]}
                isAnimationActive={animate}
                animationDuration={CHART_MOTION.duration}
                animationEasing={CHART_MOTION.easing}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </ChartShell>
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(view === "bar" ? "h-2 w-2 rounded-sm" : "h-0.5 w-4 rounded-full", "bg-accent")}
            aria-hidden
          />
          {leftMeta.label}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              view === "bar" ? "h-2 w-2 rounded-sm" : "h-0.5 w-4 rounded-full",
            )}
            style={{ background: VIZ.amber }}
            aria-hidden
          />
          {rightMeta.label}
        </span>
      </div>
    </div>
  );
});

const LEFT_METRIC_OPTIONS = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
] as const;

const RIGHT_METRIC_OPTIONS = [
  { key: "engagement", label: "Engagements" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
] as const;

const METRIC_OPTIONS = [
  ...LEFT_METRIC_OPTIONS,
  { key: "engagement", label: "Engagements" },
] as const;

function MetricPicker<T extends string>({
  value,
  color,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  color: string;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.key === value)!;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-muted px-2.5 py-1.5 text-xs font-medium text-text transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-elevated active:scale-[0.97]",
          open && "bg-bg-elevated shadow-sm",
        )}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        {selected.label}
        <CaretDown
          size={12}
          weight="bold"
          className={cn("text-text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute top-full left-0 z-30 mt-1.5 min-w-[9.5rem] rounded-xl border border-border bg-bg-elevated p-1 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="option"
              aria-selected={value === o.key}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                value === o.key
                  ? "bg-bg-muted font-medium text-text"
                  : "text-text-muted hover:bg-bg-muted/70 hover:text-text",
              )}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: value === o.key ? color : "var(--color-border)" }}
                aria-hidden
              />
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const PlatformBreakdownChart = memo(function PlatformBreakdownChart({
  data,
}: {
  data: PlatformChartRow[];
}) {
  const reduceMotion = useReducedMotion();
  const model = useMemo(() => buildPlatformChartModel(data), [data]);
  const animate = !reduceMotion;

  if (model.rows.length === 0) {
    return (
      <EmptyChart message="No Social0 posts in this range to break down by platform." />
    );
  }

  return (
    <ChartShell>
      <ResponsiveContainer width="100%" height="100%" debounce={120}>
        <BarChart
          data={model.rows}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          barGap={4}
          barCategoryGap="24%"
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            interval={0}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            allowDecimals={false}
            tickFormatter={(v) => axisTick(Number(v))}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "var(--color-bg-muted, #f3f4f6)", opacity: 0.35 }}
            isAnimationActive={false}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
            iconType="circle"
            iconSize={8}
          />
          {model.activeSeries.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.fill}
              maxBarSize={32}
              radius={[6, 6, 0, 0]}
              isAnimationActive={animate}
              animationDuration={CHART_MOTION.duration}
              animationEasing={CHART_MOTION.easing}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
});

export const EngagementMixChart = memo(function EngagementMixChart({
  data,
}: {
  data: MixSlice[];
}) {
  const reduceMotion = useReducedMotion();
  const model = useMemo(() => buildMixChartModel(data), [data]);
  const animate = !reduceMotion;

  if (model.slices.length === 0) {
    return (
      <EmptyChart message="No likes, comments, or shares on Social0 posts in this range yet." />
    );
  }

  return (
    <div className="flex h-64 w-full min-w-0 items-center gap-4 sm:h-72">
      <div className="h-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" debounce={120}>
          <PieChart>
            <Pie
              data={model.slices}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="56%"
              outerRadius="78%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={animate}
              animationDuration={CHART_MOTION.duration}
              animationEasing={CHART_MOTION.easing}
            >
              {model.slices.map((s) => (
                <Cell key={s.key} fill={MIX_COLORS[s.key] ?? ACCENT} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} isAnimationActive={false} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-36 shrink-0 space-y-2.5 text-xs sm:w-40">
        {model.slices.map((s) => {
          const pct =
            model.total > 0 ? Math.round((s.value / model.total) * 100) : 0;
          return (
            <li key={s.key} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-text-muted">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: MIX_COLORS[s.key] ?? ACCENT }}
                />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="shrink-0 tabular-nums font-medium text-text">
                {formatMetric(s.value)}
                <span className="ml-1 font-normal text-text-muted">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-bg-muted/30 px-6 text-center text-sm text-text-muted sm:h-72">
      {message}
    </div>
  );
}
