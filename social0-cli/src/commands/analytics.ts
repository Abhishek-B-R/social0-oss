import chalk from "chalk";
import {
  getAnalyticsOverview,
  getPostAnalytics,
  listAnalyticsAccounts,
} from "../api/analytics.js";
import { printOutput, info, warn, truncate } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { applyGlobalOptions, getFormat } from "./helpers.js";
import { formatPlatformName } from "../utils/aliases.js";
import { resolveAccountRef } from "./inbox-helpers.js";
import {
  WINDOW_RANGES,
  type AnalyticsWindowQuery,
  type GlobalOptions,
  type MetricSet,
  type WindowRange,
} from "../types/index.js";

export interface AnalyticsOptions extends GlobalOptions {
  range?: string;
  since?: string;
  until?: string;
  account?: string;
  fresh?: boolean;
}

function parseRange(value: string | undefined): WindowRange | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if ((WINDOW_RANGES as readonly string[]).includes(normalized)) {
    return normalized as WindowRange;
  }
  throw new Error(
    `Unknown range "${value}". Use one of: ${WINDOW_RANGES.join(", ")}.`,
  );
}

function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Rolled-up shares so a one-line summary reads the same across networks. */
function sharesOf(m: MetricSet): number {
  return (m.shares ?? 0) + (m.reposts ?? 0) + (m.quotes ?? 0);
}

function viewsOf(m: MetricSet): number | null {
  return m.views ?? m.impressions ?? null;
}

async function buildQuery(opts: AnalyticsOptions): Promise<AnalyticsWindowQuery> {
  const range = parseRange(opts.range);
  return {
    range: opts.since || opts.until ? (range ?? "custom") : range,
    since: opts.since,
    until: opts.until,
    accountId: opts.account ? await resolveAccountRef(opts.account) : undefined,
    fresh: opts.fresh,
  };
}

export async function analyticsCommand(
  action: string | undefined,
  arg: string | undefined,
  opts: AnalyticsOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (action === "accounts") {
      const accounts = await listAnalyticsAccounts();
      if (accounts.length === 0) {
        info("No connected accounts have live analytics yet.");
        console.log("");
        console.log(
          chalk.dim(
            "  Analytics rolls out per network as each platform approves API access.",
          ),
        );
        return;
      }
      printOutput(
        accounts.map((a) => ({
          id: a.id,
          platform: formatPlatformName(a.platform),
          username: a.username ?? "—",
          needs_reconnect: a.missing_scopes.length > 0 ? "yes" : "no",
        })),
        format,
      );
      return;
    }

    if (action === "post") {
      if (!arg) {
        console.error("Usage: social0 analytics post <post-id>");
        process.exit(1);
      }
      const data = await getPostAnalytics(arg);
      if (format !== "table") {
        printOutput(data, format);
        return;
      }
      printOutput(
        {
          post_id: data.post_id,
          views: compact(viewsOf(data.totals)),
          likes: compact(data.totals.likes),
          comments: compact(data.totals.comments),
          shares: compact(sharesOf(data.totals)),
          engagement: compact(data.totals.engagement),
          fetched_at: data.fetched_at,
        },
        format,
      );
      console.log("");
      printOutput(
        data.publications.map((p) => ({
          platform: formatPlatformName(p.platform),
          account: p.account_username ?? "—",
          status: p.status,
          views: compact(viewsOf(p.metrics)),
          likes: compact(p.metrics.likes),
          comments: compact(p.metrics.comments),
          note: p.error ? truncate(p.error, 48) : "",
        })),
        format,
      );
      printFooter(data.accounts_needing_reconnect, data.partial, false, 0);
      return;
    }

    if (action && action !== "overview") {
      console.error(`Unknown analytics action: ${action}`);
      console.error("Usage: social0 analytics [overview|accounts|post <id>]");
      process.exit(1);
    }

    const data = await getAnalyticsOverview(await buildQuery(opts));
    if (format !== "table") {
      printOutput(data, format);
      return;
    }

    console.log(
      chalk.bold(`Analytics · ${data.range}`),
      chalk.dim(`${data.since.slice(0, 10)} → ${data.until.slice(0, 10)}`),
    );
    console.log("");
    printOutput(
      {
        views: compact(viewsOf(data.totals)),
        likes: compact(data.totals.likes),
        comments: compact(data.totals.comments),
        shares: compact(sharesOf(data.totals)),
        engagement: compact(data.totals.engagement),
        publications: data.publications.length,
      },
      format,
    );

    if (data.by_platform.length > 0) {
      console.log("");
      console.log(chalk.bold("By platform"));
      printOutput(
        data.by_platform.map((row) => ({
          platform: formatPlatformName(row.platform),
          posts: row.post_count,
          views: compact(viewsOf(row.metrics)),
          likes: compact(row.metrics.likes),
          comments: compact(row.metrics.comments),
          engagement: compact(row.metrics.engagement),
        })),
        format,
      );
    }

    if (data.top_posts.length > 0) {
      console.log("");
      console.log(chalk.bold("Top posts"));
      printOutput(
        data.top_posts.slice(0, 10).map((post) => ({
          post_id: post.post_id,
          snippet: truncate(post.snippet, 48),
          platforms: post.platforms.map(formatPlatformName).join(", "),
          views: compact(viewsOf(post.metrics)),
          engagement: compact(post.metrics.engagement),
        })),
        format,
      );
    } else {
      console.log("");
      info(
        "No posts published through Social0 have metrics in this range. Try --range 28d.",
      );
    }

    printFooter(
      data.accounts_needing_reconnect,
      data.partial,
      data.sampled,
      data.sample_limit,
    );
  } catch (err) {
    exitWithError(err);
  }
}

function printFooter(
  reconnect: Array<{ platform: string; username: string | null }>,
  partial: boolean,
  sampled: boolean,
  sampleLimit: number,
): void {
  if (sampled) {
    console.log("");
    warn(
      `Showing the latest ${sampleLimit} publications in this range — totals are a sample, not a lifetime count.`,
    );
  }
  if (partial) {
    console.log("");
    warn("Partial results — the live request budget ran out. Re-run to load more.");
  }
  if (reconnect.length > 0) {
    console.log("");
    warn(
      `Reconnect for full insights: ${reconnect
        .map(
          (a) =>
            `${formatPlatformName(a.platform)}${a.username ? ` (@${a.username})` : ""}`,
        )
        .join(", ")}`,
    );
    console.log(chalk.dim("  social0 accounts connect <platform>"));
  }
}
