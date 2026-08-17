import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatMetric } from "./analytics-utils";

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

function axisTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 1000) return formatMetric(v);
  return String(Math.round(v));
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-text">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-text-muted">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          {p.name}:{" "}
          <span className="font-medium text-text">
            {formatMetric(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export function EngagementTrendChart({ data }: { data: SeriesPoint[] }) {
  const chartData = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  if (chartData.length === 0) {
    return (
      <EmptyChart message="No published posts with metrics in this range yet." />
    );
  }
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={
              chartData.length > 60
                ? Math.ceil(chartData.length / 6)
                : chartData.length > 14
                  ? Math.ceil(chartData.length / 7)
                  : 0
            }
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            allowDecimals={false}
            tickFormatter={(v) => axisTick(Number(v))}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="views"
            name="Views"
            stroke={BLUE}
            fill="url(#viewsFill)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="engagement"
            name="Engagement"
            stroke={ACCENT}
            fill="url(#engFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

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
    return <EmptyChart message="Connect accounts and publish to see platform breakdown." />;
  }
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            allowDecimals={false}
            tickFormatter={(v) => axisTick(Number(v))}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="views" name="Views" fill={BLUE} radius={[4, 4, 0, 0]} />
          <Bar dataKey="likes" name="Likes" fill={ROSE} radius={[4, 4, 0, 0]} />
          <Bar
            dataKey="comments"
            name="Comments"
            fill={AMBER}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="shares"
            name="Shares"
            fill={VIOLET}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
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
