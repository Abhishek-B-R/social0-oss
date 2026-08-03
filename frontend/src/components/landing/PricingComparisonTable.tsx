import { Check, Minus } from "lucide-react";
import type { BillingInterval } from "@/lib/plans";
import { getPlanLimits } from "@/lib/plans";
import {
  formatEffectiveMonthly,
  formatPlanPriceLabel,
  getPlanPrice,
} from "@/lib/plan-pricing";
import Link from "@/components/AppLink";

type Cell = string | boolean;

type CompareRow = {
  feature: string;
  free: Cell;
  starter: Cell;
  growth: Cell;
  pro: Cell;
};

const freePosts = getPlanLimits("free").maxFreePosts;

export const COMPARE_ROWS: CompareRow[] = [
  {
    feature: "Connected accounts",
    free: "3",
    starter: "5",
    growth: "15",
    pro: "50",
  },
  {
    feature: "Posts",
    free: `${freePosts} to try`,
    starter: "Unlimited",
    growth: "Unlimited",
    pro: "Unlimited",
  },
  {
    feature: "All 9 platforms",
    free: true,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    feature: "Scheduling & calendar",
    free: true,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    feature: "REST API, MCP & CLI",
    free: true,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    feature: "Multiple accounts per platform",
    free: false,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    feature: "Workspaces (multi-brand)",
    free: false,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    feature: "Carousels",
    free: false,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    feature: "Threads & collections",
    free: false,
    starter: true,
    growth: true,
    pro: true,
  },
  {
    feature: "Bulk scheduling",
    free: false,
    starter: false,
    growth: true,
    pro: true,
  },
  {
    feature: "Auto-plug",
    free: false,
    starter: false,
    growth: true,
    pro: true,
  },
  {
    feature: "Auto-repost",
    free: false,
    starter: false,
    growth: true,
    pro: true,
  },
  {
    feature: "Team collaboration",
    free: false,
    starter: false,
    growth: false,
    pro: true,
  },
  {
    feature: "Priority support",
    free: false,
    starter: false,
    growth: false,
    pro: true,
  },
  {
    feature: "Early access to new features",
    free: false,
    starter: false,
    growth: false,
    pro: true,
  },
];

const COLS = [
  { key: "free" as const, label: "Free", recommended: false },
  { key: "starter" as const, label: "Starter", recommended: false },
  { key: "growth" as const, label: "Growth", recommended: true },
  { key: "pro" as const, label: "Pro", recommended: false },
];

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
    <span className="text-[13px] font-medium text-foreground sm:text-[14px]">
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
  const ctaHref = signedIn ? "/dashboard" : "/auth";

  const priceLabel = (tier: "starter" | "growth" | "pro") => {
    if (interval === "yearly") {
      return `≈ $${formatEffectiveMonthly(tier)}/mo`;
    }
    return formatPlanPriceLabel(tier, interval);
  };

  return (
    <section
      id="compare"
      className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
      aria-label="Plan comparison"
    >
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 text-center">
          <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            Compare
          </p>
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] italic leading-tight text-muted-foreground">
            See what’s in each plan.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-muted-foreground">
            Every limit and feature side by side — so you know exactly what
            you’re getting.
          </p>
        </div>

        <div className="overflow-x-auto rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
          <div className="overflow-hidden rounded-[22px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111]">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border dark:border-white/10">
                  <th className="sticky left-0 z-10 bg-background px-4 py-5 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground dark:bg-[#111111] sm:px-6">
                    Feature
                  </th>
                  {COLS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-5 text-center sm:px-4 ${
                        col.recommended
                          ? "bg-emerald-500/8 dark:bg-emerald-500/10"
                          : ""
                      }`}
                    >
                      <div
                        className={`text-[13px] font-semibold sm:text-[14px] ${
                          col.recommended
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-foreground"
                        }`}
                      >
                        {col.label}
                        {col.recommended ? (
                          <span className="mt-1 block text-[10px] font-medium uppercase tracking-widest text-emerald-700/80 dark:text-emerald-400/80">
                            Recommended
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        {col.key === "free"
                          ? "$0"
                          : priceLabel(col.key)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-b border-border last:border-0 dark:border-white/10"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-background px-4 py-3.5 text-left text-[13px] font-medium text-foreground dark:bg-[#111111] sm:px-6 sm:text-[14px]"
                    >
                      {row.feature}
                    </th>
                    {COLS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-3.5 text-center sm:px-4 ${
                          col.recommended
                            ? "bg-emerald-500/5 dark:bg-emerald-500/10"
                            : ""
                        }`}
                      >
                        <CellValue value={row[col.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 z-10 bg-background px-4 py-5 dark:bg-[#111111] sm:px-6" />
                  {COLS.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-5 text-center sm:px-4 ${
                        col.recommended
                          ? "bg-emerald-500/5 dark:bg-emerald-500/10"
                          : ""
                      }`}
                    >
                      <Link
                        href={ctaHref}
                        className={
                          col.recommended
                            ? "inline-flex w-full max-w-[140px] items-center justify-center rounded-[10px] bg-emerald-500 px-3 py-2.5 text-[13px] font-semibold text-[#04140c] transition-colors hover:bg-emerald-400"
                            : "inline-flex w-full max-w-[140px] items-center justify-center rounded-[10px] border border-border px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted dark:border-white/10"
                        }
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

        {interval === "yearly" ? (
          <p className="mt-4 text-center text-[12px] text-muted-foreground">
            Yearly prices shown as effective monthly. Starter{" "}
            {formatPlanPriceLabel("starter", "yearly")} · Growth{" "}
            {formatPlanPriceLabel("growth", "yearly")}
            {getPlanPrice("growth", "yearly").listPrice
              ? ` (list $${getPlanPrice("growth", "yearly").listPrice})`
              : ""}{" "}
            · Pro {formatPlanPriceLabel("pro", "yearly")}
            {getPlanPrice("pro", "yearly").listPrice
              ? ` (list $${getPlanPrice("pro", "yearly").listPrice})`
              : ""}
            .
          </p>
        ) : null}
      </div>
    </section>
  );
}
