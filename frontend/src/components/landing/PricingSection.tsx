import { useState } from "react";
import Link from "@/components/AppLink";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import { PlanDiscountPrice } from "@/components/billing/PlanDiscountPrice";
import { getPlanLimits, type BillingInterval } from "@/lib/plans";
import {
  formatEffectiveMonthly,
  getPlanPrice,
} from "@/lib/plan-pricing";

const freeFeatures = [
  "Connect up to 3 accounts",
  `${getPlanLimits("free").maxFreePosts} posts to try it out before you commit`,
  "Schedule posts across your channels",
  "All 9 platforms - one dashboard",
  "REST API, MCP & CLI included",
  "No credit card required",
  "No trial that auto-charges you",
  "Activated instantly when you sign up",
];

/* Plan cards follow landing theme tokens. */
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

export function PricingSection({ signedIn = false }: { signedIn?: boolean }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const starter = getPlanPrice("starter", interval);
  const growth = getPlanPrice("growth", interval);
  const pro = getPlanPrice("pro", interval);
  const saveBadge = (pct: number | undefined) =>
    pct != null ? (
      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-400">
        Save {pct}%
      </span>
    ) : null;

  return (
    <section id="pricing" className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 text-[11px] uppercase tracking-widest text-emerald-400">
              Pricing
            </div>
            <h2 className="font-serif text-[clamp(32px,4vw,48px)] leading-tight tracking-tight text-foreground">
              Simple pricing.
              <br />
              <em className="italic text-muted-foreground">No gotchas.</em>
            </h2>
          </div>
          <BillingIntervalToggle
            value={interval}
            onChange={setInterval}
            className="mt-10 sm:mt-12"
          />
        </div>
        <p className="mb-3 text-[15px] text-muted-foreground">
          Start free today. Upgrade when you&apos;re ready — every plan includes
          REST API, MCP &amp; CLI. Paid plans include a 3-day trial.
        </p>

        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 lg:grid-cols-4">
          {/* FREE */}
          <div className={basePlanCard}>
            <div className="mb-6 min-h-[30px]" aria-hidden />

            <div className={basePlanLabel}>Free</div>

            <div className="mt-6 mb-2 flex items-baseline gap-2">
              <div className={basePlanPrice}>$0</div>
              <div className="text-[13px] text-muted-foreground">forever</div>
            </div>

            <p className={`mb-8 ${basePlanDesc}`}>
              Publish across every platform and see why creators switch - before
              you spend a dollar.
            </p>

            <hr className="mb-8 border-border" />

            <ul className="flex-1 space-y-3.5">
              {freeFeatures.map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <span className={basePlanCheck}>✓</span>
                  <span className={basePlanFeature}>{text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <Link
                href={signedIn ? "/dashboard" : "/auth"}
                className={ctaNeutral}
              >
                {signedIn ? "Go to dashboard →" : "Get started free"}
              </Link>
              <p className={basePlanFooter}>No card required</p>
            </div>
          </div>

          {/* STARTER */}
          <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-8 dark:border-white/10 dark:bg-[#1A1A1A] md:p-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(16,185,129,0.12),transparent_55%)]" />

            <div className="relative z-10 mb-6 min-h-[30px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground dark:border-white/10">
                For solo creators
              </span>
            </div>

            <div className={`relative z-10 ${basePlanLabel}`}>Starter</div>

            <div className="relative z-10 mt-6 mb-2">
              <PlanDiscountPrice
                amount={starter.price}
                listAmount={starter.listPrice}
                period={interval === "yearly" ? "/year" : "/month"}
                size="hero"
              />
            </div>
            {interval === "yearly" ? (
              <p className="relative z-10 mb-2 text-[13px] text-muted-foreground">
                ≈ ${formatEffectiveMonthly("starter")}/month
              </p>
            ) : null}

            <p className={`relative z-10 mb-8 ${basePlanDesc}`}>
              For creators ready to post everywhere without the copy-paste
              marathon.
            </p>

            <hr className="relative z-10 mb-8 border-foreground/10" />

            <ul className="relative z-10 flex-1 space-y-3.5">
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

            <div className="relative z-10 mt-auto pt-8">
              <Link
                href={signedIn ? "/dashboard" : "/auth"}
                className={`${ctaBase} border border-emerald-500/40 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/10`}
              >
                {signedIn ? "Go to dashboard →" : "Start your 3-day free trial"}
              </Link>
              <p className={basePlanFooter}>
                3-day free trial · Cancel anytime
              </p>
            </div>
          </div>

          {/* GROWTH */}
          <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border-2 border-emerald-500/50 bg-card p-8 shadow-[0_0_40px_rgba(16,185,129,0.12)] dark:bg-[#1A1A1A] md:p-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(16,185,129,0.15),transparent_55%)]" />

            <div className="relative z-10 mb-6 min-h-[30px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Most popular
              </span>
            </div>

            <div className="relative z-10 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className={basePlanLabel}>Growth</div>
              <p className="text-[12px] font-medium text-red-400">
                Lock this pricing forever
              </p>
            </div>

            <div className="relative z-10 mt-6 mb-2">
              <PlanDiscountPrice
                amount={growth.price}
                listAmount={growth.listPrice}
                period={interval === "yearly" ? "/year" : "/month"}
                size="hero"
                badge={saveBadge(growth.savePercent)}
              />
            </div>
            {interval === "yearly" ? (
              <p className="relative z-10 mb-2 text-[13px] text-muted-foreground">
                ≈ ${formatEffectiveMonthly("growth")}/month
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
                    className={`mt-0.5 shrink-0 text-[14px] ${item.highlight ? "font-semibold text-emerald-400" : "text-emerald-400/70"}`}
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
                {signedIn ? "Go to dashboard →" : "Start your 3-day free trial"}
              </Link>
              <p className={basePlanFooter}>
                3-day free trial · Cancel anytime
              </p>
            </div>
          </div>

          {/* PRO */}
          <div
            className={`${basePlanCard} relative overflow-hidden border-emerald-500/25`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(16,185,129,0.1),transparent_55%)]" />

            <div className="relative z-10 mb-6 min-h-[30px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-emerald-400">
                For teams & agencies
              </span>
            </div>

            <div className="relative z-10 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className={basePlanLabel}>Pro</div>
              <p className="text-[12px] font-medium text-red-400">
                Lock this pricing forever
              </p>
            </div>
            <div className="relative z-10 mt-6 mb-2">
              <PlanDiscountPrice
                amount={pro.price}
                listAmount={pro.listPrice}
                period={interval === "yearly" ? "/year" : "/month"}
                size="hero"
                badge={saveBadge(pro.savePercent)}
              />
            </div>
            {interval === "yearly" ? (
              <p className="relative z-10 mb-2 text-[13px] text-muted-foreground">
                ≈ ${formatEffectiveMonthly("pro")}/month
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
                    className={`mt-0.5 shrink-0 text-[14px] ${item.highlight ? "font-semibold text-emerald-400" : "text-emerald-400/70"}`}
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
                {signedIn ? "Go to dashboard →" : "Start your 3-day free trial"}
              </Link>
              <p className={basePlanFooter}>
                3-day free trial · Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
