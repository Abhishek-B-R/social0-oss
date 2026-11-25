import { useId, useState, type ReactNode } from "react";
import Link from "@/components/AppLink";
import { signInUrl } from "@/lib/sign-in-url";
import {
  AGENCY_INCLUDED_ACCOUNTS,
  CREATOR_ACCOUNTS,
  PLAN_NAMES,
  getPlanLimits,
  type BillingInterval,
  type SellablePlanTier,
} from "@/lib/plans";
import {
  ACCOUNT_SLIDER,
  AGENCY_EXTRA_ACCOUNT_PRICE,
  agencyExtraAccounts,
  formatEffectiveMonthly,
  formatMoney,
  getPlanPrice,
  planPriceForAccounts,
  recommendedPlan,
  yearlySavings,
} from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";
import { BlackFridayNote } from "@/components/landing/BlackFridayBar";

const NETWORKS =
  "X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky and Pinterest";

type PricingCardsProps = {
  signedIn?: boolean;
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
  /** Page hero uses h1; landing section uses h2. */
  headingAs?: "h1" | "h2";
  /** Where "Compare every feature" points (landing → /pricing#compare). */
  compareHref?: string;
  /** Section element id (landing uses #pricing). */
  id?: string;
};

/**
 * Pricing, account count first: one slider ("how many accounts?") lights up
 * the plan that fits and prices Agency live.
 */
export function PricingCards({
  signedIn = false,
  interval,
  onIntervalChange,
  headingAs = "h2",
  compareHref = "#compare",
  id,
}: PricingCardsProps) {
  const [accounts, setAccounts] = useState<number>(ACCOUNT_SLIDER.default);
  const sliderId = useId();
  const Heading = headingAs;
  const yearly = interval === "yearly";
  const fit = recommendedPlan(accounts);
  const free = getPlanLimits("free");

  // Agency is never priced below its 59 included accounts.
  const agencyAccounts = Math.max(accounts, AGENCY_INCLUDED_ACCOUNTS);
  const agencyExtra = agencyExtraAccounts(agencyAccounts);

  const startHref = (plan: SellablePlanTier) => {
    const target = `/dashboard/billing?view=plans&plan=${plan}&interval=${interval}${
      plan === "agency" ? `&accounts=${agencyAccounts}` : ""
    }`;
    return signedIn ? target : signInUrl(target);
  };
  const freeHref = signedIn ? "/dashboard" : "/auth?mode=signin";

  const creatorBilled = yearly
    ? `≈ $${formatEffectiveMonthly("creator")}/mo · you save $${formatMoney(yearlySavings("creator"))}`
    : `or $${formatMoney(getPlanPrice("creator", "yearly").price)}/year, 2 months free`;
  const agencyNote =
    agencyExtra > 0
      ? `${AGENCY_INCLUDED_ACCOUNTS} + ${agencyExtra} extra account${agencyExtra === 1 ? "" : "s"}`
      : `Includes ${AGENCY_INCLUDED_ACCOUNTS} accounts`;

  return (
    <section id={id} className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto flex w-full max-w-200 flex-col items-center gap-6 text-center">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Pricing
        </div>
        <Heading className="font-serif text-[clamp(28px,4.5vw,44px)] font-extrabold leading-tight tracking-tight text-balance text-[#333C4D] dark:text-white">
          One price per account. Two plans. That&apos;s it.
        </Heading>
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
          Every plan posts to {NETWORKS}, with unlimited posts, the API, MCP and
          CLI.
        </p>
        <BlackFridayNote />

        <IntervalToggle value={interval} onChange={onIntervalChange} />

        <div className="flex w-full max-w-160 flex-col gap-2.5 text-left">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <label
              htmlFor={sliderId}
              className="text-[15px] font-semibold text-foreground"
            >
              How many social accounts do you post to?
            </label>
            <span className="font-serif text-[22px] font-bold tabular-nums text-foreground">
              <output htmlFor={sliderId} aria-live="polite">
                {accounts}
              </output>{" "}
              <span className="font-sans text-[13px] font-medium text-muted-foreground">
                account{accounts === 1 ? "" : "s"}
              </span>
            </span>
          </div>
          <input
            id={sliderId}
            type="range"
            min={ACCOUNT_SLIDER.min}
            max={ACCOUNT_SLIDER.max}
            step={1}
            value={accounts}
            onChange={(e) => setAccounts(Number(e.target.value))}
            aria-valuetext={`${accounts} accounts`}
            className="h-7 w-full cursor-pointer accent-emerald-500"
          />
          <SliderTicks />
          <p className="text-[13px] text-muted-foreground">
            Each connected profile counts once: your Instagram and your
            client&apos;s Instagram are 2 accounts.
          </p>
        </div>

        <div className="grid w-full max-w-190 grid-cols-1 gap-4 text-left md:grid-cols-2">
          <PlanCard
            name={PLAN_NAMES.creator}
            tagline="One person or brand on every platform"
            picked={fit === "creator"}
            dimmed={fit !== "creator"}
            price={planPriceForAccounts("creator", accounts, interval)}
            yearly={yearly}
            billed={creatorBilled}
            cta={`Start with ${PLAN_NAMES.creator}`}
            href={startHref("creator")}
            features={[
              <>
                <b className="font-semibold text-foreground">
                  {CREATOR_ACCOUNTS} accounts
                </b>
                , any mix of platforms
              </>,
              "Unlimited posts and scheduling",
              "Bulk image and video tools",
              "Auto-repost and auto-plug",
              "REST API, MCP and CLI · 1,000 requests/hour",
            ]}
          />
          <PlanCard
            name={PLAN_NAMES.agency}
            tagline="Agencies, client work and agent fleets"
            picked={fit === "agency"}
            dimmed={false}
            price={planPriceForAccounts("agency", agencyAccounts, interval)}
            yearly={yearly}
            billed={agencyNote}
            cta={`Start with ${PLAN_NAMES.agency}`}
            href={startHref("agency")}
            featuresHead={`Everything in ${PLAN_NAMES.creator}, plus:`}
            features={[
              <>
                <b className="font-semibold text-foreground">
                  {AGENCY_INCLUDED_ACCOUNTS} accounts included
                </b>
                , then ${AGENCY_EXTRA_ACCOUNT_PRICE.monthly} per account, no cap
              </>,
              "Invite teammates to shared workspaces",
              "Higher API limits · 5,000 requests/hour",
            ]}
          />
        </div>

        <p className="text-[13px] text-muted-foreground">
          Just trying it out?{" "}
          <Link
            href={freeHref}
            className="text-emerald-700 underline underline-offset-[3px] hover:text-emerald-600 dark:text-emerald-400"
          >
            Start free
          </Link>{" "}
          with {free.maxConnectedAccounts} accounts and {free.maxFreePosts}{" "}
          posts. No card needed.
        </p>

        <Link
          href={compareHref}
          className="text-[13px] font-medium text-foreground underline underline-offset-[3px] hover:text-emerald-700 dark:hover:text-emerald-400"
        >
          Compare every feature
        </Link>
      </div>
    </section>
  );
}

function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  const btn =
    "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500";
  const on = "bg-foreground text-background";
  const off = "text-muted-foreground hover:text-foreground";
  return (
    <div
      role="group"
      aria-label="Billing period"
      className="inline-flex gap-0.5 rounded-full border border-border bg-card p-1 dark:border-white/10"
    >
      <button
        type="button"
        aria-pressed={value === "monthly"}
        onClick={() => onChange("monthly")}
        className={cn(btn, value === "monthly" ? on : off)}
      >
        Monthly
      </button>
      <button
        type="button"
        aria-pressed={value === "yearly"}
        onClick={() => onChange("yearly")}
        className={cn(btn, value === "yearly" ? on : off)}
      >
        Yearly
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
            value === "yearly"
              ? "bg-emerald-500 text-[#04140c]"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
          )}
        >
          2 months free
        </span>
      </button>
    </div>
  );
}

/** Tick labels placed where each value sits on the 1–200 track. */
function SliderTicks() {
  const span = ACCOUNT_SLIDER.max - ACCOUNT_SLIDER.min;
  return (
    <div
      aria-hidden
      className="relative h-4 font-mono text-[11px] font-medium text-muted-foreground/80"
    >
      {ACCOUNT_SLIDER.ticks.map((t, i) => {
        const pct = ((t - ACCOUNT_SLIDER.min) / span) * 100;
        const edge =
          i === 0
            ? "translate-x-0"
            : i === ACCOUNT_SLIDER.ticks.length - 1
              ? "-translate-x-full"
              : "-translate-x-1/2";
        return (
          <span
            key={t}
            className={cn("absolute top-0 tabular-nums", edge)}
            style={{ left: `${pct}%` }}
          >
            {t}
          </span>
        );
      })}
    </div>
  );
}

function PlanCard({
  name,
  tagline,
  picked,
  dimmed,
  price,
  yearly,
  billed,
  cta,
  href,
  features,
  featuresHead,
}: {
  name: string;
  tagline: string;
  picked: boolean;
  dimmed: boolean;
  price: number;
  yearly: boolean;
  billed: string;
  cta: string;
  href: string;
  features: ReactNode[];
  featuresHead?: string;
}) {
  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-6 transition-[border-color,box-shadow,opacity] duration-200 motion-reduce:transition-none dark:bg-[#1A1A1A]",
        picked
          ? "border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]"
          : "border-border dark:border-white/10",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-serif text-[18px] font-bold text-foreground">
          {name}
        </h3>
        <span
          className={cn(
            "rounded-full bg-emerald-500 px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-[#04140c]",
            !picked && "invisible",
          )}
        >
          Your fit
        </span>
      </div>
      <p className="-mt-2.5 text-[14px] text-muted-foreground">{tagline}</p>
      <div>
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-serif text-[40px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
            ${formatMoney(price)}
          </span>
          <span className="text-[14px] text-muted-foreground">
            {yearly ? "/year" : "/month"}
          </span>
        </div>
        <p className="mt-1 min-h-5 text-[13px] tabular-nums text-muted-foreground">
          {billed}
        </p>
      </div>
      <Link
        href={href}
        className={cn(
          "block w-full rounded-[10px] border px-4 py-3 text-center text-[15px] font-semibold transition-colors",
          picked
            ? "border-emerald-500 bg-emerald-500 text-[#04140c] hover:bg-emerald-400"
            : "border-border bg-background text-foreground hover:bg-muted dark:border-white/10 dark:bg-[#111111] dark:hover:bg-white/5",
        )}
      >
        {cta}
      </Link>
      <ul className="flex flex-col gap-2 text-[14px] text-muted-foreground">
        {featuresHead ? (
          <li className="text-[13px] font-semibold">{featuresHead}</li>
        ) : null}
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className="mt-[3px] h-4 w-4 flex-none rounded-full bg-emerald-500/15"
            >
              <path
                d="M4.5 8.2l2.2 2.2 4.8-4.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald-600 dark:text-emerald-400"
              />
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
