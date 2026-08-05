import { useState } from "react";
import Link from "@/components/AppLink";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import { PlanDiscountPrice } from "@/components/billing/PlanDiscountPrice";
import { getPlanLimits, type BillingInterval } from "@/lib/plans";
import {
  billedAsYearlyLabel,
  getEffectiveMonthly,
  getPlanPrice,
} from "@/lib/plan-pricing";

const freeFeatures: { text: string; highlight?: boolean }[] = [
  { text: "No credit card required", highlight: true },
  { text: "Connect up to 3 accounts" },
  {
    text: `${getPlanLimits("free").maxFreePosts} posts to try it out before you commit`,
    highlight: true,
  },
  { text: "Schedule posts across your channels" },
  { text: "All 9 platforms - one dashboard" },
  { text: "REST API, MCP & CLI included" },
  { text: "No trial that auto-charges you" },
  { text: "Activated instantly when you sign up" },
];

const basePlanCard =
  "flex h-full flex-col rounded-2xl border border-border bg-card p-8 md:p-10 dark:border-white/10 dark:bg-[#1A1A1A]";

const basePlanLabel =
  "text-[11px] font-medium uppercase tracking-widest text-muted-foreground";

const basePlanPrice =
  "font-serif text-[clamp(40px,6vw,64px)] leading-none tracking-tight text-foreground";

const basePlanDesc = "text-[14px] leading-relaxed text-muted-foreground";

const basePlanFeature = "text-[14px] leading-snug text-muted-foreground";

const basePlanCheck =
  "mt-0.5 shrink-0 text-[14px] text-emerald-600 dark:text-emerald-400";

const basePlanFooter = "mt-3 text-center text-[12px] text-muted-foreground";

const ctaBase =
  "block w-full rounded-[10px] py-3.5 text-center text-[14px] font-medium transition-all";

const ctaNeutral = `${ctaBase} border border-border bg-background text-foreground hover:border-foreground/25 hover:bg-muted dark:border-white/10 dark:bg-[#111111] dark:hover:border-white/25 dark:hover:bg-white/5`;

const ctaPrimary = `${ctaBase} bg-emerald-500 font-semibold text-[#04140c] hover:-translate-y-px hover:bg-emerald-400 hover:shadow-[0_6px_24px_rgba(16,185,129,0.35)]`;

const starterFeatures = [
  "Everything in Free",
  "Up to 5 connected accounts",
  "Multiple accounts per platform",
  "Unlimited posts",
  "REST API, MCP & CLI included",
  "Carousel posts",
  "Threads & Collections support",
];

const growthFeatures = [
  { text: "Everything in Starter", highlight: true },
  { text: "Up to 15 connected accounts", highlight: true },
  { text: "Unlimited posts across all 9 platforms", highlight: false },
  { text: "REST API, MCP & CLI included", highlight: false },
  { text: "Multiple accounts per platform", highlight: false },
  { text: "Auto-plug high performing tweets", highlight: false },
  { text: "Auto-repost on autopilot", highlight: false },
  { text: "Bulk scheduling tools", highlight: false },
];

const proFeatures = [
  { text: "Everything in Growth", highlight: true },
  { text: "Up to 50 connected accounts", highlight: true },
  { text: "Team collaboration / invite teammates", highlight: true },
  { text: "Multiple accounts per platform", highlight: false },
  { text: "Unlimited posts across all 9 platforms", highlight: false },
  { text: "Auto-plug and Auto-repost features", highlight: false },
  { text: "Bulk scheduling tools", highlight: false },
  { text: "Priority support", highlight: false },
  { text: "Early access to new features", highlight: false },
];

type PricingCardsProps = {
  signedIn?: boolean;
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
  /** Page hero uses h1; section uses h2 */
  headingAs?: "h1" | "h2";
  /** Anchor for the compare-plans link (landing → /pricing#compare) */
  compareHref?: string;
  /** Section element id (landing uses #pricing) */
  id?: string;
};

export function PricingCards({
  signedIn = false,
  interval,
  onIntervalChange,
  headingAs = "h2",
  compareHref = "#compare",
  id,
}: PricingCardsProps) {
  const starter = getPlanPrice("starter", interval);
  const growth = getPlanPrice("growth", interval);
  const pro = getPlanPrice("pro", interval);
  const Heading = headingAs;
  const saveBadge = (pct: number | undefined) =>
    pct != null ? (
      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
        Save {pct}%
      </span>
    ) : null;

  return (
    <section id={id} className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Pricing
            </div>
            <Heading className="font-serif text-[clamp(32px,4vw,48px)] leading-tight tracking-tight text-foreground">
              Find the right plan
              <br />
              <em className="italic text-muted-foreground">for how you post.</em>
            </Heading>
          </div>
          <BillingIntervalToggle
            value={interval}
            onChange={onIntervalChange}
            className="mt-10 sm:mt-12"
          />
        </div>
        <p className="mb-3 text-[15px] text-muted-foreground">
          Start free today. Most creators pick{" "}
          <span className="font-medium text-foreground">Growth</span> when
          they&apos;re ready to automate — every plan includes REST API, MCP
          &amp; CLI.
        </p>
        <p className="mb-10 text-[13px] text-muted-foreground">
          No credit card on Free · Cancel anytime · Questions?{" "}
          <a
            href="mailto:support@social0.app"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Email us
          </a>{" "}
          — we&apos;ll make it right.
        </p>

        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div className={basePlanCard}>
            <div className="mb-6 min-h-[30px]" aria-hidden />
            <div className={basePlanLabel}>Free</div>
            <div className="mt-6 mb-2 flex items-baseline gap-2">
              <div className={basePlanPrice}>$0</div>
              <div className="text-[13px] text-muted-foreground">forever</div>
            </div>
            <p className={`mb-8 ${basePlanDesc}`}>
              Publish across every platform and see why creators switch — before
              you spend a dollar.
            </p>
            <hr className="mb-8 border-border" />
            <ul className="flex-1 space-y-3.5">
              {freeFeatures.map((item) => (
                <li key={item.text} className="flex items-start gap-3">
                  <span className={basePlanCheck}>✓</span>
                  <span
                    className={
                      item.highlight
                        ? "text-[14px] font-semibold leading-snug text-foreground"
                        : basePlanFeature
                    }
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <Link
                href={signedIn ? "/dashboard" : "/auth"}
                className={ctaNeutral}
              >
                {signedIn ? "Go to dashboard →" : "Start free"}
              </Link>
              <p className={basePlanFooter}>No card required</p>
            </div>
          </div>

          <div className={basePlanCard}>
            <div className="mb-6 min-h-[30px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground dark:border-white/10">
                For solo creators
              </span>
            </div>
            <div className={basePlanLabel}>Starter</div>
            <div className="mt-6 mb-2">
              <PlanDiscountPrice
                amount={
                  interval === "yearly"
                    ? getEffectiveMonthly("starter")
                    : starter.price
                }
                listAmount={
                  interval === "yearly" ? undefined : starter.listPrice
                }
                period="/month"
                size="hero"
              />
            </div>
            {interval === "yearly" ? (
              <p className="mb-2 text-[13px] text-muted-foreground">
                {billedAsYearlyLabel("starter")}
              </p>
            ) : null}
            <p className={`mb-8 ${basePlanDesc}`}>
              For creators ready to post everywhere without the copy-paste
              marathon.
            </p>
            <hr className="mb-8 border-border" />
            <ul className="flex-1 space-y-3.5">
              {starterFeatures.map((text, i) => (
                <li key={text} className="flex items-start gap-3">
                  <span
                    className={`${basePlanCheck}${i === 0 ? " font-semibold" : ""}`}
                  >
                    ✓
                  </span>
                  <span
                    className={`text-[14px] leading-snug ${i === 0 ? "font-medium text-foreground/90" : "text-foreground/70"}`}
                  >
                    {text}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <Link
                href={signedIn ? "/dashboard" : "/auth"}
                className={ctaNeutral}
              >
                {signedIn ? "Go to dashboard →" : "Start free"}
              </Link>
              <p className={basePlanFooter}>Cancel anytime</p>
            </div>
          </div>

          <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border-2 border-emerald-500/55 bg-card p-8 shadow-[0_0_48px_rgba(16,185,129,0.14)] dark:bg-[#1A1A1A] md:p-10 lg:z-10 lg:scale-[1.02]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(16,185,129,0.18),transparent_55%)]" />
            <div className="relative z-10 mb-6 min-h-[30px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600 dark:bg-emerald-400" />
                Recommended
              </span>
            </div>
            <div className="relative z-10 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className={basePlanLabel}>Growth</div>
              <p className="text-[12px] font-medium text-amber-800 dark:text-amber-400/90">
                Early adopter pricing
              </p>
            </div>
            <div className="relative z-10 mt-6 mb-2">
              <PlanDiscountPrice
                amount={
                  interval === "yearly"
                    ? getEffectiveMonthly("growth")
                    : growth.price
                }
                listAmount={
                  interval === "yearly" ? undefined : growth.listPrice
                }
                period="/month"
                size="hero"
                badge={saveBadge(growth.savePercent)}
              />
            </div>
            {interval === "yearly" ? (
              <p className="relative z-10 mb-2 text-[13px] text-muted-foreground">
                {billedAsYearlyLabel("growth")}
              </p>
            ) : null}
            <p className={`relative z-10 mb-8 ${basePlanDesc}`}>
              Scale your reach with automation, reposting, and bulk scheduling
              built for serious creators.
            </p>
            <hr className="relative z-10 mb-8 border-border" />
            <ul className="relative z-10 flex-1 space-y-3.5">
              {growthFeatures.map((item) => (
                <li key={item.text} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 shrink-0 text-[14px] ${item.highlight ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-emerald-700/70 dark:text-emerald-400/70"}`}
                  >
                    ✓
                  </span>
                  <span
                    className={`text-[14px] leading-snug ${item.highlight ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
            <div className="relative z-10 mt-auto pt-8">
              <Link
                href={signedIn ? "/dashboard" : "/auth"}
                className={ctaPrimary}
              >
                {signedIn ? "Go to dashboard →" : "Choose Growth"}
              </Link>
              <p className={basePlanFooter}>Best value for most creators</p>
            </div>
          </div>

          <div className={`${basePlanCard} relative overflow-hidden`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(16,185,129,0.06),transparent_55%)]" />
            <div className="relative z-10 mb-6 min-h-[30px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground dark:border-white/10">
                For teams & agencies
              </span>
            </div>
            <div className="relative z-10 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className={basePlanLabel}>Pro</div>
              <p className="text-[12px] font-medium text-amber-800 dark:text-amber-400/90">
                Early adopter pricing
              </p>
            </div>
            <div className="relative z-10 mt-6 mb-2">
              <PlanDiscountPrice
                amount={
                  interval === "yearly"
                    ? getEffectiveMonthly("pro")
                    : pro.price
                }
                listAmount={interval === "yearly" ? undefined : pro.listPrice}
                period="/month"
                size="hero"
                badge={saveBadge(pro.savePercent)}
              />
            </div>
            {interval === "yearly" ? (
              <p className="relative z-10 mb-2 text-[13px] text-muted-foreground">
                {billedAsYearlyLabel("pro")}
              </p>
            ) : null}
            <p className={`relative z-10 mb-8 ${basePlanDesc}`}>
              For power users and agencies who need more accounts and team
              collaboration.
            </p>
            <hr className="relative z-10 mb-8 border-border" />
            <ul className="relative z-10 flex-1 space-y-3.5">
              {proFeatures.map((item) => (
                <li key={item.text} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 shrink-0 text-[14px] ${item.highlight ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-emerald-700/70 dark:text-emerald-400/70"}`}
                  >
                    ✓
                  </span>
                  <span
                    className={`text-[14px] leading-snug ${item.highlight ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
            <div className="relative z-10 mt-auto pt-8">
              <Link
                href={signedIn ? "/dashboard" : "/auth"}
                className={ctaNeutral}
              >
                {signedIn ? "Go to dashboard →" : "Start free"}
              </Link>
              <p className={basePlanFooter}>Cancel anytime</p>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          <Link
            href={compareHref}
            className="font-medium text-foreground underline underline-offset-4 hover:text-emerald-700 dark:hover:text-emerald-400"
          >
            Compare plans →
          </Link>
        </p>
      </div>
    </section>
  );
}

/** Standalone wrapper if needed elsewhere */
export function PricingSection({ signedIn = false }: { signedIn?: boolean }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  return (
    <PricingCards
      signedIn={signedIn}
      interval={interval}
      onIntervalChange={setInterval}
    />
  );
}
