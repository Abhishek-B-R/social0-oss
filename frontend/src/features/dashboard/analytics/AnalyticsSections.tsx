import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  NetworkIcon,
  RowActions,
  Skeleton,
  Tabs,
} from "@/components/app";
import type { AnalyticsOverview, MetricMap } from "@/api/analytics";
import { cn } from "@/lib/utils";
import { MIX_COLORS, VIZ } from "./analytics-colors";
import { engagementMix, engagementOf, formatMetric, viewsOf } from "./analytics-utils";
import {
  breakdownBy,
  breakdownValue,
  deltaOf,
  engagementRate,
  formatPct,
  formatRate,
  handleOf,
  metricMeta,
  metricValue,
  METRICS,
  type Highlight,
  type KpiTotals,
  type MetricKey,
} from "./analytics-model";

// ---------------------------------------------------------------------------
// KPI tiles that double as chart tabs. Coverage caveats (sampled / partial)
// live in one note under the row (`CoverageNote` on the page), not on tiles.

export function KpiTabs({
  totals,
  previous,
  previousState,
  active,
  onActiveChange,
  previousWords,
  loading,
  panelId,
}: {
  totals: KpiTotals | null;
  previous: KpiTotals | null;
  previousState: "loading" | "ready" | "error" | "off";
  active: MetricKey;
  onActiveChange: (key: MetricKey) => void;
  previousWords: string;
  loading: boolean;
  panelId: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const idx = METRICS.findIndex((m) => m.key === active);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % METRICS.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + METRICS.length) % METRICS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = METRICS.length - 1;
    const target = METRICS[next];
    if (!target) return;
    e.preventDefault();
    onActiveChange(target.key);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-metric="${target.key}"]`)
      ?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Metric"
      onKeyDown={onKeyDown}
      className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-3 xl:grid-cols-6"
    >
      {METRICS.map((m) => {
        const selected = m.key === active;
        const value = totals?.[m.key];
        const prev = previous?.[m.key];
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            id={`${panelId}-tab-${m.key}`}
            data-metric={m.key}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onActiveChange(m.key)}
            className={cn(
              "relative flex min-w-0 flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
              selected ? "bg-bg-elevated" : "bg-bg-subtle hover:bg-bg-elevated",
            )}
          >
            {selected ? (
              <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" aria-hidden />
            ) : null}
            <span
              className={cn(
                "text-xs font-medium",
                selected ? "text-text" : "text-text-muted",
              )}
            >
              {m.label}
            </span>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-16" />
            ) : (
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-text">
                {formatMetric(value)}
              </span>
            )}
            <DeltaLine
              loading={loading || previousState === "loading"}
              state={previousState}
              value={value}
              previous={prev}
              previousWords={previousWords}
            />
          </button>
        );
      })}
    </div>
  );
}

function DeltaLine({
  loading,
  state,
  value,
  previous,
  previousWords,
}: {
  loading: boolean;
  state: "loading" | "ready" | "error" | "off";
  value: number | undefined;
  previous: number | undefined;
  previousWords: string;
}) {
  if (state === "off") return <span className="h-4" aria-hidden />;
  if (loading) return <Skeleton className="mt-0.5 h-3.5 w-20" />;
  if (state === "error") {
    return <span className="text-xs text-text-subtle">No comparison</span>;
  }
  const delta = deltaOf(value, previous);
  // Nothing to compare: leave the line empty rather than a row of dashes.
  if (delta.kind === "none") return <span className="h-4" aria-hidden />;
  if (delta.kind === "new") {
    return (
      <span className="text-xs text-text-muted" title={`Nothing in the ${previousWords}`}>
        <span className="font-medium text-ok">New</span> this period
      </span>
    );
  }
  if (delta.kind === "flat") {
    return (
      <span className="text-xs text-text-muted" title={`Same as the ${previousWords}`}>
        No change{" "}
        <span className="text-text-subtle">vs {formatMetric(delta.previous)}</span>
      </span>
    );
  }
  const up = delta.pct > 0;
  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-1 text-xs"
      title={`${formatMetric(delta.previous)} in the ${previousWords}`}
    >
      <span
        className={cn(
          "inline-flex items-center font-medium tabular-nums",
          up ? "text-ok" : "text-danger",
        )}
      >
        {up ? (
          <ArrowUp className="size-3" aria-hidden />
        ) : (
          <ArrowDown className="size-3" aria-hidden />
        )}
        <span className="sr-only">{up ? "Up" : "Down"} </span>
        {formatPct(delta.pct)}
      </span>
      <span className="text-text-subtle">vs {formatMetric(delta.previous)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Highlights

export function Highlights({ items }: { items: Highlight[] }) {
  if (items.length === 0) return null;
  // Plain sentences, no tinted boxes: the numbers below are the content.
  return (
    <section
      aria-label="Highlights"
      className={cn(
        "grid gap-x-8 gap-y-3",
        items.length === 2 && "md:grid-cols-2",
        items.length >= 3 && "md:grid-cols-3",
      )}
    >
      {items.map((h) => (
        <div key={h.id} className="min-w-0 text-sm">
          <p className="font-medium text-text">{h.headline}</p>
          <p className="mt-0.5 text-[13px] text-text-muted">{h.detail}</p>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Top posts with heat tint.

function heatStyle(value: number | undefined, max: number) {
  if (value == null || value <= 0 || max <= 0) return undefined;
  const pct = Math.round(8 + (value / max) * 32);
  return {
    backgroundColor: `color-mix(in srgb, ${VIZ.emerald} ${pct}%, transparent)`,
  };
}

const TOP_POSTS_SHOWN = 10;

export function TopPostsCard({
  data,
  metric,
  postHref,
  loading,
}: {
  data: AnalyticsOverview | undefined;
  metric: MetricKey;
  postHref: (postId: string) => string;
  loading: boolean;
}) {
  const navigate = useNavigate();
  const rows = useMemo(() => {
    if (!data) return [];
    const list = data.topPosts.map((p) => {
      const url =
        data.publications.find((pub) => pub.postId === p.postId && pub.platformPostUrl)
          ?.platformPostUrl ?? null;
      return {
        ...p,
        url,
        views: viewsOf(p.metrics),
        engagement: engagementOf(p.metrics),
        rate: engagementRate(p.metrics),
      };
    });
    // The server sends every sampled post ranked by views + engagement; rank
    // by the picked metric before cutting to the top 10.
    if (metric === "posts") return list.slice(0, TOP_POSTS_SHOWN);
    return [...list]
      .sort(
        (a, b) => (metricValue(b.metrics, metric) ?? -1) - (metricValue(a.metrics, metric) ?? -1),
      )
      .slice(0, TOP_POSTS_SHOWN);
  }, [data, metric]);

  const maxViews = Math.max(0, ...rows.map((r) => r.views ?? 0));
  const maxEng = Math.max(0, ...rows.map((r) => r.engagement));
  const sortLabel = metric === "posts" ? "views and engagement" : metricMeta(metric).noun;

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-bg-elevated">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2">
        <h2 className="text-sm font-semibold text-text">Top posts</h2>
        <span className="text-xs text-text-muted">By {sortLabel}</span>
      </header>
      {loading ? (
        <div className="space-y-2 px-4 pb-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-text-muted">
          No published posts with metrics in this range.
        </p>
      ) : (
        <DataTable
          aria-label="Top posts"
          className="rounded-none border-x-0 border-b-0"
        >
          <DataTableHeader>
            <tr>
              <DataTableHead>Post</DataTableHead>
              <DataTableHead className="text-right">Views</DataTableHead>
              <DataTableHead className="text-right">Eng.</DataTableHead>
              <DataTableHead className="hidden text-right sm:table-cell">Rate</DataTableHead>
              <DataTableHead className="w-10">
                <span className="sr-only">Open on network</span>
              </DataTableHead>
            </tr>
          </DataTableHeader>
          <DataTableBody>
            {rows.map((r) => (
              <DataTableRow
                key={r.postId}
                onActivate={() => navigate(postHref(r.postId))}
              >
                <DataTableCell className="max-w-0 w-full">
                  <Link
                    href={postHref(r.postId)}
                    className="block truncate text-sm font-medium text-text hover:text-accent focus-visible:outline-none focus-visible:underline"
                  >
                    {r.snippet}
                  </Link>
                  <span className="mt-0.5 flex items-center gap-1">
                    {r.platforms.map((p) => (
                      <NetworkIcon key={p} network={p} size={12} />
                    ))}
                  </span>
                </DataTableCell>
                <DataTableCell className="text-right">
                  <span
                    className="rounded px-1.5 py-0.5 tabular-nums text-text"
                    style={heatStyle(r.views, maxViews)}
                  >
                    {formatMetric(r.views)}
                  </span>
                </DataTableCell>
                <DataTableCell className="text-right">
                  <span
                    className="rounded px-1.5 py-0.5 tabular-nums text-text"
                    style={heatStyle(r.engagement, maxEng)}
                  >
                    {formatMetric(r.engagement)}
                  </span>
                </DataTableCell>
                <DataTableCell className="hidden text-right tabular-nums text-text-muted sm:table-cell">
                  {formatRate(r.rate)}
                </DataTableCell>
                <DataTableCell className="text-right">
                  {r.url ? (
                    <RowActions>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex size-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:size-10"
                        aria-label="Open on the network"
                        title="Open on the network"
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    </RowActions>
                  ) : null}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Breakdown by account / by network, plus the engagement mix.

/** Where "Reconnect" goes: OAuth re-auth (AppLink does a full page load for /api URLs) or the account drawer. */
export type ReconnectTarget = { href: string };

export function BreakdownCard({
  data,
  metric,
  loading,
  reconnectFor,
}: {
  data: AnalyticsOverview | undefined;
  metric: MetricKey;
  loading: boolean;
  reconnectFor: (accountId: string) => ReconnectTarget;
}) {
  const [by, setBy] = useState<"account" | "network">("account");
  const rows = useMemo(() => {
    if (!data) return [];
    return breakdownBy(data.publications, by).sort(
      (a, b) => (breakdownValue(b, metric) ?? -1) - (breakdownValue(a, metric) ?? -1),
    );
  }, [data, by, metric]);

  const reconnectIds = useMemo(
    () => new Set((data?.accountsNeedingReconnect ?? []).map((a) => a.accountId)),
    [data?.accountsNeedingReconnect],
  );
  // Accounts that need reconnect and have no row of their own yet.
  const missingRows = useMemo(() => {
    if (by !== "account" || !data) return [];
    const present = new Set(rows.map((r) => r.accountId));
    return data.accountsNeedingReconnect.filter((a) => !present.has(a.accountId));
  }, [by, data, rows]);

  const max = Math.max(0, ...rows.map((r) => breakdownValue(r, metric) ?? 0));
  const mix = data ? engagementMix(data.totals) : [];

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-bg-elevated">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold text-text">
          By {by === "account" ? "account" : "network"}
        </h2>
        <Tabs
          variant="pill"
          aria-label="Group by"
          value={by}
          onChange={setBy}
          items={[
            { value: "account", label: "Accounts" },
            { value: "network", label: "Networks" },
          ]}
        />
      </header>
      {loading ? (
        <div className="space-y-2 px-4 pb-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : rows.length === 0 && missingRows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-text-muted">Nothing published in this range.</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((r) => {
            const value = breakdownValue(r, metric);
            const width = max > 0 && value != null ? Math.max(2, (value / max) * 100) : 0;
            const needsReconnect =
              by === "account" && r.accountId != null && reconnectIds.has(r.accountId);
            return (
              <li
                key={r.key}
                className="grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(3rem,7rem)_auto] items-center gap-x-3 px-4 py-2.5"
              >
                <NetworkIcon network={r.platform} size={16} />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-text">{r.label}</span>
                  <span className="block text-xs text-text-muted">
                    {r.posts.toLocaleString()} {r.posts === 1 ? "post" : "posts"}
                    {needsReconnect && r.accountId ? (
                      <>
                        {" · "}
                        <ReconnectLink target={reconnectFor(r.accountId)}>
                          Reconnect for full numbers
                        </ReconnectLink>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className="min-w-[3.5rem] text-right text-sm font-medium tabular-nums text-text">
                  {formatMetric(value)}
                </span>
              </li>
            );
          })}
          {missingRows.map((a) => (
            <li
              key={`missing-${a.accountId}`}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 opacity-80"
            >
              <NetworkIcon network={a.platform} size={16} />
              <span className="min-w-0 truncate text-sm text-text-muted">
                {handleOf(a.username, a.platform)}
              </span>
              <ReconnectLink target={reconnectFor(a.accountId)} className="text-xs">
                Reconnect to include
              </ReconnectLink>
            </li>
          ))}
        </ul>
      )}
      {!loading && mix.length > 0 ? <EngagementMixBar totals={data!.totals} /> : null}
    </section>
  );
}

function EngagementMixBar({ totals }: { totals: MetricMap }) {
  const slices = engagementMix(totals);
  const total = slices.reduce((n, s) => n + s.value, 0);
  if (total <= 0) return null;
  return (
    <div className="mt-auto border-t border-border px-4 py-3">
      <p className="mb-2 text-xs font-medium text-text-muted">Engagement mix</p>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg-muted" aria-hidden>
        {slices.map((s) => (
          <span
            key={s.key}
            style={{
              width: `${(s.value / total) * 100}%`,
              background: MIX_COLORS[s.key] ?? VIZ.emerald,
            }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        {slices.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: MIX_COLORS[s.key] ?? VIZ.emerald }}
              aria-hidden
            />
            {s.label}
            <span className="font-medium tabular-nums text-text">{formatMetric(s.value)}</span>
            <span className="tabular-nums">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReconnectLink({
  target,
  children,
  className,
}: {
  target: ReconnectTarget;
  children: ReactNode;
  className?: string;
}) {
  const cls = cn(
    "font-medium text-warning underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline",
    className,
  );
  return (
    <Link href={target.href} className={cls}>
      {children}
    </Link>
  );
}
