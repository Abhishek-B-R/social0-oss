import { format } from "date-fns";
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

const GRID = "var(--color-border, #e5e7eb)";
const MUTED = "var(--color-text-muted, #6b7280)";
const ACCENT = "var(--color-accent, #10b981)";
const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const ROSE = "#f43f5e";
const VIOLET = "#8b5cf6";

type SeriesPoint = {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
};

function dayDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function axisTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 1000) return formatMetric(v);
  return String(Math.round(v));
}

function tickLabel(iso: string, days: number): string {
  const d = dayDate(iso);
  if (days > 180) return format(d, "MMM");
  return format(d, "MMM d");
}

function ChartTooltip({
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
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-text">{heading}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-text-muted">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          {p.name}:{" "}
          <span className="font-medium tabular-nums text-text">
            {formatMetric(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export function EngagementTrendChart({ data }: { data: SeriesPoint[] }) {
  const days = data.length;
  const chartData = data.map((d) => ({
    ...d,
    tick: tickLabel(d.date, days),
    fullDate: format(dayDate(d.date), "MMM d, yyyy"),
  }));
  if (chartData.length === 0) {
    return (
      <EmptyChart message="No published posts with metrics in this range yet." />
    );
  }
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
        >
          <defs>
            <linearGradient id="engFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BLUE} stopOpacity={0.3} />
              <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="tick"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={20}
            tickMargin={8}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            allowDecimals={false}
            tickFormatter={(v) => axisTick(Number(v))}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Area
            type="monotone"
            dataKey="views"
            name="Views"
            stroke={BLUE}
            fill="url(#viewsFill)"
            strokeWidth={2}
            dot={<ValueDot fill={BLUE} dataKey="views" />}
            activeDot={{ r: 4 }}
          />
          <Area
            type="monotone"
            dataKey="engagement"
            name="Engagement"
            stroke={ACCENT}
            fill="url(#engFill)"
            strokeWidth={2}
            dot={<ValueDot fill={ACCENT} dataKey="engagement" />}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ValueDot({
  cx,
  cy,
  payload,
  fill,
  dataKey,
}: {
  cx?: number;
  cy?: number;
  payload?: Record<string, number>;
  fill: string;
  dataKey: "views" | "engagement";
}) {
  if (cx == null || cy == null || !payload) return null;
  if (!(payload[dataKey] > 0)) return null;
  return <circle cx={cx} cy={cy} r={3} fill={fill} stroke="none" />;
}

const BAR_SERIES = [
  { key: "views", name: "Views", fill: BLUE },
  { key: "likes", name: "Likes", fill: ROSE },
  { key: "comments", name: "Comments", fill: AMBER },
  { key: "shares", name: "Shares", fill: VIOLET },
] as const;

export function PlatformBreakdownChart({
  data,
}: {
  data: Array<{
    platform: string;
    label: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
  }>;
}) {
  if (data.length === 0) {
    return (
      <EmptyChart message="No Social0 posts in this range to break down by platform." />
    );
  }
  const series = BAR_SERIES.filter((s) => data.some((d) => d[s.key] > 0));
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          barGap={3}
          barCategoryGap="28%"
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            allowDecimals={false}
            tickFormatter={(v) => axisTick(Number(v))}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "var(--color-bg-muted, #f3f4f6)", opacity: 0.45 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.fill}
              maxBarSize={36}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const MIX_COLORS: Record<string, string> = {
  likes: ROSE,
  comments: AMBER,
  shares: VIOLET,
  quotes: BLUE,
  saves: ACCENT,
  clicks: "#06b6d4",
};

export function EngagementMixChart({ data }: { data: MixSlice[] }) {
  if (data.length === 0) {
    return (
      <EmptyChart message="No likes, comments, or shares on Social0 posts in this range yet." />
    );
  }
  const total = data.reduce((acc, s) => acc + s.value, 0);
  return (
    <div className="flex h-64 w-full items-center gap-4 sm:h-72">
      <div className="h-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="80%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((s) => (
                <Cell
                  key={s.key}
                  fill={MIX_COLORS[s.key] ?? ACCENT}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-36 shrink-0 space-y-2 text-xs sm:w-40">
        {data.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.key} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-text-muted">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: MIX_COLORS[s.key] ?? ACCENT }}
                />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="tabular-nums font-medium text-text">
                {formatMetric(s.value)}
                <span className="ml-1 text-text-muted">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-bg-muted/40 px-6 text-center text-sm text-text-muted sm:h-72">
      {message}
    </div>
  );
}
