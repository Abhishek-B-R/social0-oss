import { useState } from "react";
import Link from "@/components/AppLink";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import { PlanDiscountPrice } from "@/components/billing/PlanDiscountPrice";
import { getPlanLimits, type BillingInterval } from "@/lib/plans";
import {
  billedAsYearlyLabel,
  getEffectiveMonthly,
  getPlanPrice,
  getYearlySlashMonthly,
} from "@/lib/plan-pricing";

const freePosts = getPlanLimits("free").maxFreePosts;

/** Shared milk lines — repeated per card (not one bundled “API, MCP & CLI” row). */
const CORE_PUBLISH = [
  "All 9 platforms",
  "Text, image & video posts",
  "Threads (multi-post)",
  "Collections & carousels",
  "Per-platform captions",
  "Drag-and-drop media",
  "Drafts",
  "Publish now",
  "Parallel multi-platform publish",
  "Live publish progress",
  "Schedule posts",
  "Content calendar",
  "Posting queue",
  "Timezone-aware scheduling",
  "Edit scheduled posts",
  "Post again / retry",
  "Official OAuth connections",
  "Token health & reconnect",
] as const;

const CORE_DEV = [
  "REST API",
  "MCP server",
  "CLI",
  "API keys",
  "Outbound webhooks",
] as const;

const CORE_EXTRAS = ["Email on post failure", "Dark / light mode"] as const;

const freeFeatures: { text: string; highlight?: boolean }[] = [
  { text: "No credit card required", highlight: true },
  { text: "Up to 3 connected accounts", highlight: true },
  { text: `${freePosts} posts to try before you upgrade`, highlight: true },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  ...CORE_EXTRAS.map((text) => ({ text })),
  { text: "Activated instantly — no trial that auto-charges" },
];

const starterFeatures = [
  "Up to 5 connected accounts",
  "Unlimited posts",
  "Multiple accounts per platform",
  "Workspaces (multi-brand)",
  ...CORE_PUBLISH,
  ...CORE_DEV,
  ...CORE_EXTRAS,
  "Human support",
];

const growthFeatures = [
  { text: "Up to 15 connected accounts", highlight: true },
  { text: "Unlimited posts", highlight: true },
  { text: "Multiple accounts per platform" },
  { text: "Workspaces (multi-brand)" },
  { text: "Bulk image & video scheduling", highlight: true },
  { text: "Auto-plug (performance CTA replies)", highlight: true },
  { text: "Auto-repost / resurface", highlight: true },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  ...CORE_EXTRAS.map((text) => ({ text })),
  { text: "Human support" },
];

const proFeatures = [
  { text: "Up to 50 connected accounts", highlight: true },
  { text: "Unlimited posts", highlight: true },
  { text: "Team collaboration / invite teammates", highlight: true },
  { text: "Multiple accounts per platform" },
  { text: "Workspaces (multi-brand)" },
  { text: "Bulk image & video scheduling" },
  { text: "Auto-plug (performance CTA replies)" },
  { text: "Auto-repost / resurface" },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  ...CORE_EXTRAS.map((text) => ({ text })),
  { text: "Priority support", highlight: true },
  { text: "Early access to new features" },
];

const maxFeatures = [
  { text: "Unlimited connected accounts", highlight: true },
  { text: "Unlimited posts", highlight: true },
  { text: "Team collaboration / invite teammates", highlight: true },
  { text: "Multiple accounts per platform" },
  { text: "Workspaces (multi-brand)" },
  { text: "Bulk image & video scheduling" },
  { text: "Auto-plug (performance CTA replies)" },
  { text: "Auto-repost / resurface" },
  ...CORE_PUBLISH.map((text) => ({ text })),
  ...CORE_DEV.map((text) => ({ text })),
  ...CORE_EXTRAS.map((text) => ({ text })),
  { text: "Priority support", highlight: true },
  { text: "Early access to new features" },
  { text: "10,000 API requests / hour" },
];

const basePlanCard =
  "flex h-full flex-col rounded-2xl border border-border bg-card p-8 md:p-10 dark:border-white/10 dark:bg-[#1A1A1A]";

const basePlanLabel =
  "text-[11px] font-medium uppercase tracking-widest text-muted-foreground";

const basePlanPrice =
  "font-sans text-[clamp(40px,6vw,64px)] font-bold leading-none tracking-tight tabular-nums text-foreground";

const basePlanDesc = "text-[14px] leading-relaxed text-muted-foreground";

const basePlanFeature = "text-[14px] leading-snug text-muted-foreground";

const basePlanCheck =
  "mt-0.5 shrink-0 text-[14px] text-emerald-600 dark:text-emerald-400";

const basePlanFooter = "mt-3 text-center text-[12px] text-muted-foreground";

const ctaBase =
  "block w-full rounded-[10px] py-3.5 text-center text-[14px] font-medium transition-all";

const ctaNeutral = `${ctaBase} border border-border bg-background text-foreground hover:border-foreground/25 hover:bg-muted dark:border-white/10 dark:bg-[#111111] dark:hover:border-white/25 dark:hover:bg-white/5`;

const ctaPrimary = `${ctaBase} bg-emerald-500 font-semibold text-[#04140c] hover:-translate-y-px hover:bg-emerald-400 hover:shadow-[0_6px_24px_rgba(16,185,129,0.35)]`;

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
  const [showMax, setShowMax] = useState(false);
  const starter = getPlanPrice("starter", interval);
  const growth = getPlanPrice("growth", interval);
  const pro = getPlanPrice("pro", interval);
  const max = getPlanPrice("max", interval);
  const Heading = headingAs;
  const paidCta = signedIn ? "Go to dashboard →" : "Get started";
  const maxBuyHref = signedIn ? "/dashboard/billing" : "/auth";
  const maxWalkthroughHref = "https://cal.com/abhishekbr/30min";
  const saveBadge = (pct: number | undefined) =>
    pct != null ? (
      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
        Save {pct}%
      </span>
    ) : null;

  return (
    <section id={id} className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-280">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
              Pricing
            </div>
            <Heading className="font-sans text-[clamp(32px,4.5vw,48px)] font-bold leading-tight tracking-tight text-foreground dark:text-white">
              Find the right plan
              <br />
              <span className="text-muted-foreground">for how you post.</span>
            </Heading>
          </div>
          <BillingIntervalToggle
            value={interval}
            onChange={onIntervalChange}
            className="mt-10 sm:mt-12"
          />
        </div>
        <p className="mb-3 text-[15px] text-muted-foreground">
          Start on Free, upgrade when you need more accounts or automation —
          every paid plan includes REST API, MCP &amp; CLI.
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
            <div className="mb-6 min-h-7.5" aria-hidden />
            <div className={basePlanLabel}>Free</div>
            <div className="mt-6 mb-2 flex items-baseline gap-2">
              <div className={basePlanPrice}>
                <sup className="mr-0.5 text-[0.55em] font-medium top-[-0.35em]">
                  $
                </sup>
                0
              </div>
              <div className="text-[13px] text-muted-foreground">forever</div>
            </div>
            <p className={`mb-8 ${basePlanDesc}`}>
              Publish across every platform and see why creators switch — before
              you spend a dollar.
            </p>
            <hr className="mb-8 border-border" />
            <ul className="flex-1 space-y-2.5">
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
            <div className="mb-6 min-h-7.5">
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
                  interval === "yearly"
                    ? getYearlySlashMonthly("starter")
                    : starter.listPrice
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
            <ul className="flex-1 space-y-2.5">
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
                {paidCta}
              </Link>
              <p className={basePlanFooter}>Cancel anytime</p>
            </div>
          </div>

          <div className={basePlanCard}>
            <div className="mb-6 min-h-7.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground dark:border-white/10">
                Automation &amp; scale
              </span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className={basePlanLabel}>Growth</div>
              <p className="text-[12px] font-medium text-amber-800 dark:text-amber-400/90">
                Early adopter pricing
              </p>
            </div>
            <div className="mt-6 mb-2">
              <PlanDiscountPrice
                amount={
                  interval === "yearly"
                    ? getEffectiveMonthly("growth")
                    : growth.price
                }
                listAmount={
                  interval === "yearly"
                    ? getYearlySlashMonthly("growth")
                    : growth.listPrice
                }
                period="/month"
                size="hero"
                badge={saveBadge(growth.savePercent)}
              />
            </div>
            {interval === "yearly" ? (
              <p className="mb-2 text-[13px] text-muted-foreground">
                {billedAsYearlyLabel("growth")}
              </p>
            ) : null}
            <p className={`mb-8 ${basePlanDesc}`}>
              Scale your reach with automation, reposting, and bulk scheduling
              built for serious creators.
            </p>
            <hr className="mb-8 border-border" />
            <ul className="flex-1 space-y-2.5">
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
            <div className="mt-auto pt-8">
              <Link
                href={signedIn ? "/dashboard" : "/auth"}
                className={ctaNeutral}
              >
                {paidCta}
              </Link>
              <p className={basePlanFooter}>Cancel anytime</p>
            </div>
          </div>

          <div className={basePlanCard}>
            <div className="mb-6 min-h-7.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground dark:border-white/10">
                For teams &amp; agencies
              </span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className={basePlanLabel}>Pro</div>
              <p className="text-[12px] font-medium text-amber-800 dark:text-amber-400/90">
                Early adopter pricing
              </p>
            </div>
            <div className="mt-6 mb-2">
              <PlanDiscountPrice
                amount={
                  interval === "yearly" ? getEffectiveMonthly("pro") : pro.price
                }
                listAmount={
                  interval === "yearly"
                    ? getYearlySlashMonthly("pro")
                    : pro.listPrice
                }
                period="/month"
                size="hero"
                badge={saveBadge(pro.savePercent)}
              />
            </div>
            {interval === "yearly" ? (
              <p className="mb-2 text-[13px] text-muted-foreground">
                {billedAsYearlyLabel("pro")}
              </p>
            ) : null}
            <p className={`mb-8 ${basePlanDesc}`}>
              For power users and agencies who need more accounts and team
              collaboration.
            </p>
            <hr className="mb-8 border-border" />
            <ul className="flex-1 space-y-2.5">
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
            <div className="mt-auto pt-8">
              <Link
                href={signedIn ? "/dashboard" : "/auth"}
                className={ctaNeutral}
              >
                {paidCta}
              </Link>
              <p className={basePlanFooter}>Cancel anytime</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          {!showMax ? (
            <button
              type="button"
              onClick={() => setShowMax(true)}
              className="text-[13px] font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Want more?
            </button>
          ) : (
            <div className="w-full max-w-md">
              <div className={`${basePlanCard} relative overflow-hidden`}>
                <div className="mb-6 min-h-7.5">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground dark:border-white/10">
                    Unlimited connections
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className={basePlanLabel}>Max</div>
                  <p className="text-[12px] font-medium text-amber-800 dark:text-amber-400/90">
                    Early adopter pricing
                  </p>
                </div>
                <div className="mt-6 mb-2">
                  <PlanDiscountPrice
                    amount={
                      interval === "yearly"
                        ? getEffectiveMonthly("max")
                        : max.price
                    }
                    listAmount={
                      interval === "yearly"
                        ? getYearlySlashMonthly("max")
                        : max.listPrice
                    }
                    period="/month"
                    size="hero"
                    badge={saveBadge(max.savePercent)}
                  />
                </div>
                {interval === "yearly" ? (
                  <p className="mb-2 text-[13px] text-muted-foreground">
                    {billedAsYearlyLabel("max")}
                  </p>
                ) : null}
                <p className={`mb-8 ${basePlanDesc}`}>
                  For agencies and power users who need unlimited social
                  connections — everything in Pro, without the account cap.
                </p>
                <hr className="mb-8 border-border" />
                <ul className="mb-8 space-y-2.5">
                  {maxFeatures.map((item) => (
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
                <div className="flex flex-col gap-2.5">
                  <a
                    href={maxWalkthroughHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ctaPrimary}
                  >
                    Get a walkthrough
                  </a>
                  <Link href={maxBuyHref} className={ctaNeutral}>
                    {signedIn ? "Buy Max yourself →" : "Buy Max yourself"}
                  </Link>
                </div>
                <p className={basePlanFooter}>
                  Walk through it with me, or checkout yourself — your call.
                </p>
              </div>
            </div>
          )}
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
