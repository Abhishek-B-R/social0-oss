import { memo, useMemo, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import { formatMetric, type MixSlice } from "./analytics-utils";
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
const ACCENT = "var(--color-accent, #10b981)";
const BLUE = "#3b82f6";

const MIX_COLORS: Record<string, string> = {
  likes: "#f43f5e",
  comments: "#f59e0b",
  shares: "#8b5cf6",
  quotes: BLUE,
  saves: ACCENT,
  clicks: "#06b6d4",
};

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

export const EngagementTrendChart = memo(function EngagementTrendChart({
  data,
}: {
  data: TrendPoint[];
}) {
  const reduceMotion = useReducedMotion();
  const model = useMemo(() => buildTrendChartModel(data), [data]);
  const animate = !reduceMotion;

  if (model.rows.length === 0) {
    return (
      <EmptyChart message="No published posts with metrics in this range yet." />
    );
  }

  return (
    <ChartShell>
      <ResponsiveContainer width="100%" height="100%" debounce={120}>
        <AreaChart
          data={model.rows}
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
        >
          <defs>
            <linearGradient id="engFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.32} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BLUE} stopOpacity={0.28} />
              <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
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
            minTickGap={24}
            tickMargin={8}
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
            cursor={{ stroke: MUTED, strokeDasharray: "3 3", strokeOpacity: 0.6 }}
            isAnimationActive={false}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
            iconType="circle"
            iconSize={8}
          />
          <Area
            type="monotone"
            dataKey="views"
            name="Views"
            stroke={BLUE}
            fill="url(#viewsFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={animate}
            animationDuration={CHART_MOTION.duration}
            animationEasing={CHART_MOTION.easing}
          />
          <Area
            type="monotone"
            dataKey="engagement"
            name="Engagement"
            stroke={ACCENT}
            fill="url(#engFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={animate}
            animationDuration={CHART_MOTION.duration}
            animationEasing={CHART_MOTION.easing}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartShell>
  );
});

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
