import { Check, CircleHelp, Minus } from "lucide-react";
import {
  AGENCY_INCLUDED_ACCOUNTS,
  CREATOR_ACCOUNTS,
  PLAN_NAMES,
  getPlanLimits,
  type BillingInterval,
} from "@/lib/plans";
import {
  AGENCY_EXTRA_ACCOUNT_PRICE,
  formatPlanPriceLabel,
} from "@/lib/plan-pricing";
import Link from "@/components/AppLink";
import { signInUrl } from "@/lib/sign-in-url";

type Cell = string | boolean;

type CompareCol = "free" | "creator" | "agency";

type CompareRow = {
  feature: string;
  tip: string;
  free: Cell;
  creator: Cell;
  agency: Cell;
};

const freeLimits = getPlanLimits("free");

const ALL: Pick<CompareRow, CompareCol> = {
  free: true,
  creator: true,
  agency: true,
};

const PAID: Pick<CompareRow, CompareCol> = {
  free: false,
  creator: true,
  agency: true,
};

const AGENCY_ONLY: Pick<CompareRow, CompareCol> = {
  free: false,
  creator: false,
  agency: true,
};

function f(
  feature: string,
  tip: string,
  cells: Pick<CompareRow, CompareCol>,
): CompareRow {
  return { feature, tip, ...cells };
}

/** Full feature milk — gated rows match plans.ts; tip explains each row on hover. */
export const COMPARE_ROWS: CompareRow[] = [
  f(
    "Connected accounts",
    "How many social profiles you can link at once across all platforms. Each profile counts once.",
    {
      free: String(freeLimits.maxConnectedAccounts),
      creator: String(CREATOR_ACCOUNTS),
      agency: `${AGENCY_INCLUDED_ACCOUNTS}, then $${AGENCY_EXTRA_ACCOUNT_PRICE.monthly}/mo each`,
    },
  ),
  f(
    "Posts",
    "How many posts you can create and publish. Free includes a lifetime trial allotment.",
    {
      free: `${freeLimits.maxFreePosts} for trial`,
      creator: "Unlimited",
      agency: "Unlimited",
    },
  ),
  f(
    "API requests / hour",
    "Rate limit for Social0 REST API calls with your API key.",
    {
      free: "60",
      creator: "1,000",
      agency: "5,000",
    },
  ),
  f(
    "Multiple accounts per platform",
    "Connect more than one profile on the same network (e.g. two X accounts).",
    PAID,
  ),
  f(
    "Workspaces (multi-brand)",
    "Separate workspaces so you can manage more than one brand or client.",
    PAID,
  ),
  f(
    "Team members & invites",
    "Invite teammates into a shared workspace with roles and collaboration.",
    AGENCY_ONLY,
  ),
  f(
    "All 9 platforms",
    "X, LinkedIn, Instagram, Facebook Pages, Threads, TikTok, YouTube & Shorts, Pinterest, and Bluesky.",
    ALL,
  ),
  f(
    "Text, image & video posts",
    "Compose plain text, image, or video posts with captions.",
    ALL,
  ),
  f(
    "Threads (multi-post)",
    "Publish multi-post threads on X, Threads, and Bluesky.",
    ALL,
  ),
  f(
    "Collections & carousels",
    "Mixed image/video collections and Instagram-style carousels.",
    ALL,
  ),
  f(
    "Per-platform captions",
    "One base caption with optional overrides per platform or account.",
    ALL,
  ),
  f(
    "Drag-and-drop media",
    "Drop images and videos into the composer and create forms.",
    ALL,
  ),
  f("Drafts", "Save unfinished posts and finish them later from Drafts.", ALL),
  f(
    "Publish now",
    "Send immediately with live per-platform progress until done.",
    ALL,
  ),
  f(
    "Parallel multi-platform publish",
    "All selected accounts publish together — one failure doesn’t block the others.",
    ALL,
  ),
  f(
    "Live publish progress",
    "Watch each platform’s status stream in real time after Publish now.",
    ALL,
  ),
  f(
    "Edit scheduled posts",
    "Change content, accounts, or time before a scheduled post goes live.",
    ALL,
  ),
  f(
    "Post again / retry",
    "Republish or retry a post from post detail when something fails.",
    ALL,
  ),
  f(
    "Official OAuth connections",
    "Connect networks with each platform’s supported OAuth flow; tokens encrypted at rest.",
    ALL,
  ),
  f(
    "Token health & reconnect",
    "Background token checks with prompts to reconnect when auth expires.",
    ALL,
  ),
  f(
    "Schedule for later",
    "Pick a date and time in your timezone for future publishing.",
    ALL,
  ),
  f(
    "Content calendar",
    "Month/week view of scheduled, draft, and published posts.",
    ALL,
  ),
  f(
    "Posting queue",
    "Recurring weekly time slots — drop posts into the next open slot.",
    ALL,
  ),
  f(
    "Timezone-aware scheduling",
    "Schedules and queue slots follow the timezone in your settings.",
    ALL,
  ),
  f(
    "Bulk image & video scheduling",
    "Upload many media files and schedule them across days in one flow.",
    PAID,
  ),
  f(
    "Auto-plug (performance CTA replies)",
    "Automatically add a CTA reply when a post hits a performance threshold (e.g. on X).",
    PAID,
  ),
  f(
    "Auto-repost / resurface",
    "Automatically repost evergreen content on an interval with optional limits.",
    PAID,
  ),
  f(
    "REST API",
    "HTTP API to create drafts, upload media, publish, and schedule programmatically.",
    ALL,
  ),
  f(
    "MCP server",
    "Model Context Protocol server so ChatGPT, Claude, Cursor, and similar AIs can post for you.",
    ALL,
  ),
  f(
    "CLI",
    "Command-line tool to log in, list accounts, publish, and schedule from the terminal.",
    ALL,
  ),
  f(
    "API keys",
    "Create sk_live_ keys in the dashboard for API, MCP stdio, and CLI auth.",
    ALL,
  ),
  f(
    "Outbound webhooks",
    "Get notified on events like post.published, post.failed, and post.scheduled.",
    ALL,
  ),
  f(
    "Email on post failure",
    "Optional email when a platform publish fails (toggle in Settings).",
    ALL,
  ),
  f(
    "Dark / light mode",
    "Theme toggle on marketing and auth pages; follows your preference.",
    ALL,
  ),
  f(
    "Human support",
    "Email support from the Social0 team on every paid plan.",
    PAID,
  ),
];

const COLS: { key: CompareCol; label: string }[] = [
  { key: "free", label: PLAN_NAMES.free },
  { key: "creator", label: PLAN_NAMES.creator },
  { key: "agency", label: PLAN_NAMES.agency },
];

function FeatureLabel({ feature, tip }: { feature: string; tip: string }) {
  return (
    <span className="inline-flex max-w-[16rem] items-start gap-1.5 sm:max-w-none">
      <span>{feature}</span>
      <span className="group relative mt-0.5 inline-flex shrink-0">
        <button
          type="button"
          className="rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          aria-label={tip}
        >
          <CircleHelp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 w-[min(240px,55vw)] -translate-y-1/2 rounded-lg border border-border bg-popover px-2.5 py-2 text-left text-[12px] font-normal leading-snug text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-white/10 dark:bg-[#1A1A1A] dark:text-white/85"
        >
          {tip}
        </span>
      </span>
    </span>
  );
}

function CellValue({ value }: { value: Cell }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check
        className="mx-auto h-4 w-4 text-emerald-700 dark:text-emerald-400"
        strokeWidth={2.5}
        aria-label="Included"
      />
    ) : (
      <Minus
        className="mx-auto h-4 w-4 text-muted-foreground/40"
        strokeWidth={2}
        aria-label="Not included"
      />
    );
  }
  return (
    <span className="text-[13px] font-medium tabular-nums text-foreground sm:text-[14px]">
      {value}
    </span>
  );
}

export function PricingComparisonTable({
  interval,
  signedIn = false,
}: {
  interval: BillingInterval;
  signedIn?: boolean;
}) {
  // Signed out, paid CTAs keep the purchase intent through sign-in
  // (`/auth/continue` → returnTo) instead of dropping the buyer on Home.
  const freeHref = signedIn ? "/dashboard" : "/auth?mode=signin";
  const paidHref = (plan: "creator" | "agency") => {
    const target = `/dashboard/billing?view=plans&plan=${plan}&interval=${interval}`;
    return signedIn ? target : signInUrl(target);
  };

  const priceLabel = (tier: CompareCol) => {
    if (tier === "free") return "$0";
    const label = formatPlanPriceLabel(tier, interval);
    return tier === "agency" ? `from ${label}` : label;
  };

  const btnClass =
    "inline-flex w-full max-w-[140px] items-center justify-center rounded-[10px] border border-border px-3 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted dark:border-white/10";

  return (
    <section
      id="compare"
      className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
      aria-label="Plan comparison"
    >
      <div className="mx-auto w-full max-w-350">
        <div className="mb-10 text-center">
          <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            Compare
          </p>
          <h2 className="font-sans text-[clamp(28px,4vw,40px)] font-bold leading-tight tracking-tight text-[#333C4D] dark:text-white">
            Compare and explore every feature
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Hover the ? next to any feature for a short explanation.
          </p>
        </div>

        <div className="overflow-x-auto rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
          <div className="rounded-[22px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111]">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border dark:border-white/10">
                  <th className="sticky left-0 z-10 bg-background px-4 py-5 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground dark:bg-[#111111] sm:px-6">
                    Feature
                  </th>
                  {COLS.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-5 text-center sm:px-4"
                    >
                      <div className="text-[13px] font-semibold text-foreground sm:text-[14px]">
                        {col.label}
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        {priceLabel(col.key)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, i) => {
                  const stripe = i % 2 === 1;
                  const rowBg = stripe
                    ? "bg-muted/25 dark:bg-white/[0.02]"
                    : "bg-background dark:bg-[#111111]";

                  return (
                    <tr
                      key={row.feature}
                      className={`border-b border-border last:border-0 dark:border-white/10 ${rowBg}`}
                    >
                      <th
                        scope="row"
                        className={`sticky left-0 z-20 px-4 py-3 text-left text-[13px] font-medium text-foreground sm:px-6 sm:text-[14px] ${rowBg}`}
                      >
                        <FeatureLabel feature={row.feature} tip={row.tip} />
                      </th>
                      {COLS.map((col) => (
                        <td
                          key={col.key}
                          className="px-3 py-3 text-center sm:px-4"
                        >
                          <CellValue value={row[col.key]} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr>
                  <td className="sticky left-0 z-10 bg-background px-4 py-5 dark:bg-[#111111] sm:px-6" />
                  {COLS.map((col) => (
                    <td
                      key={col.key}
                      className="px-3 py-5 text-center align-top sm:px-4"
                    >
                      <Link
                        href={col.key === "free" ? freeHref : paidHref(col.key)}
                        className={btnClass}
                      >
                        {signedIn
                          ? "Dashboard"
                          : col.key === "free"
                            ? "Start free"
                            : "Get started"}
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-center text-[12px] text-muted-foreground">
          {PLAN_NAMES.agency} adds ${AGENCY_EXTRA_ACCOUNT_PRICE.monthly}/month
          (${AGENCY_EXTRA_ACCOUNT_PRICE.yearly}/year) per account above{" "}
          {AGENCY_INCLUDED_ACCOUNTS}. Yearly plans are 2 months free.
        </p>
      </div>
    </section>
  );
}
