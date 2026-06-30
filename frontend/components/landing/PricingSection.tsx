import Link from "next/link";
import { getPlanLimits } from "@/lib/plans";

const freeFeatures = [
  "Connect up to 3 accounts",
  `${getPlanLimits("free").maxFreePosts} posts to try it out before you commit`,
  "Schedule posts across your channels",
  "All 9 platforms - one dashboard",
  "No credit card required",
  "No trial that auto-charges you",
  "Activated instantly when you sign up",
];

/* Free & Starter follow the page theme (dark cards on the dark landing).
   Growth is the inverted contrast card (white on dark, dark on light). */
const basePlanCard =
  "flex h-full flex-col rounded-2xl border border-border bg-background p-8 shadow-sm md:p-10";

const basePlanLabel =
  "text-[11px] font-medium uppercase tracking-widest text-muted-foreground";

const basePlanPrice =
  "font-serif text-[64px] leading-none tracking-tight text-foreground";

const basePlanDesc = "text-[14px] leading-relaxed text-muted-foreground";

const basePlanFeature = "text-[14px] leading-snug text-muted-foreground";

const basePlanCheck =
  "mt-0.5 shrink-0 text-[14px] text-emerald-600 dark:text-emerald-400";

const basePlanFooter = "mt-3 text-center text-[12px] text-muted-foreground";

const ctaBase =
  "block w-full rounded-[10px] py-3.5 text-center text-[14px] font-medium transition-all";

const ctaNeutral = `${ctaBase} border-2 border-foreground/10 bg-background text-foreground hover:border-foreground/25 hover:bg-muted dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-muted/50`;

const ctaPrimary = `${ctaBase} bg-emerald-600 font-semibold text-white hover:-translate-y-px hover:bg-emerald-500 hover:shadow-[0_6px_20px_rgba(34,145,79,0.35)]`;

const starterFeatures = [
  "Everything in Free",
  "Up to 5 connected accounts",
  "Multiple accounts per platform",
  "Unlimited posts",
  "Carousel posts",
  "Threads & Collections support",
  "Human support",
];

const growthFeatures = [
  { text: "Everything in Starter", highlight: true },
  { text: "Up to 15 connected accounts", highlight: true },
  { text: "Unlimited posts across all 9 platforms", highlight: false },
  { text: "Multiple accounts per platform", highlight: false },
  { text: "Auto-plug high performing tweets", highlight: false },
  { text: "Auto-repost on autopilot", highlight: false },
  { text: "Bulk scheduling tools", highlight: false },
];

// const proFeatures = [
//   { text: "Unlimited connected accounts", highlight: true },
//   { text: "Multiple accounts per platform", highlight: false },
//   { text: "Unlimited posts", highlight: false },
//   { text: "Schedule posts across platforms", highlight: false },
//   { text: "Carousel posts", highlight: false },
//   { text: "Threads & Collections support", highlight: false },
//   { text: "Human support", highlight: false },
//   { text: "Auto-plug high performing tweets", highlight: false },
//   { text: "Auto-repost on autopilot", highlight: false },
//   { text: "Bulk scheduling tools", highlight: false },
//   { text: "Priority support", highlight: false },
//   { text: "Early access to new features", highlight: false },
// ];

export function PricingSection({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section id="pricing" className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-[1280px]">
        {/* Section header */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Pricing
            </div>
            <h2 className="font-serif text-[clamp(32px,4vw,48px)] leading-tight tracking-tight text-foreground">
              Simple pricing.
              <br />
              No gotchas.
            </h2>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Early adopter pricing - early users keep this price forever
            </div>
          </div>
        </div>
        <p className="mb-3 text-[15px] text-muted-foreground">
          Start free today. Upgrade when you&apos;re ready - every paid plan
          includes a 3-day trial.
        </p>

        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-3">
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

          {/* STARTER - step up from Free: lifted surface + emerald accents */}
          <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/15 bg-gradient-to-b from-muted/60 to-background p-8 shadow-md md:p-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(26,107,74,0.07),transparent_55%)]" />

            <div className="relative z-10 mb-6 min-h-[30px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-foreground/15 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                For solo creators
              </span>
            </div>

            <div className={`relative z-10 ${basePlanLabel}`}>Starter</div>

            <div className="relative z-10 mt-6 mb-2 flex items-baseline gap-2">
              <div className={basePlanPrice}>$9</div>
              <div className="text-[13px] text-muted-foreground">/month</div>
            </div>

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
                href="/dashboard"
                className={`${ctaBase} border-2 border-emerald-600/50 text-emerald-700 hover:border-emerald-500 hover:bg-emerald-600/10 dark:text-emerald-400`}
              >
                {signedIn ? "Go to dashboard →" : "Start your 3-day free trial"}
              </Link>
              <p className={basePlanFooter}>
                3-day free trial · Cancel anytime
              </p>
            </div>
          </div>

          {/* GROWTH - inverted contrast card: white on dark theme, dark on light */}
          <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-600/30 bg-[#0C0C0C] p-8 shadow-md dark:bg-[#FAFAF8] md:p-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(26,107,74,0.15),transparent_60%)] dark:bg-[radial-gradient(circle_at_70%_0%,rgba(26,107,74,0.08),transparent_60%)]" />

            <div className="relative z-10 mb-6 min-h-[30px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-800/60 bg-emerald-950/70 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-emerald-400 dark:border-emerald-200 dark:bg-emerald-50 dark:text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 dark:bg-emerald-500" />
                Most popular
              </span>
            </div>

            <div className="relative z-10 text-[11px] font-medium uppercase tracking-widest text-white/30 dark:text-[#0A0A0A]/40">
              Growth
            </div>

            <div className="relative z-10 mt-6 mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="font-serif text-[64px] leading-none tracking-tight text-white dark:text-[#0A0A0A]">
                $19
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[18px] font-medium text-white/50 line-through decoration-red-500 decoration-2 dark:text-[#0A0A0A]/50">
                  $29
                </span>
                <span className="text-[13px] text-white/40 dark:text-[#0A0A0A]/40">
                  /month
                </span>
              </div>
              <span className="rounded bg-emerald-900/50 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-400 dark:bg-emerald-100 dark:text-emerald-700">
                Save 34%
              </span>
            </div>

            <p className="relative z-10 mb-8 text-[14px] leading-relaxed text-white/50 dark:text-[#0A0A0A]/60">
              Scale your reach with automation, reposting, and bulk scheduling
              built for serious creators.
            </p>

            <hr className="relative z-10 mb-8 border-white/8 dark:border-[#0A0A0A]/10" />

            <ul className="relative z-10 flex-1 space-y-3.5">
              {growthFeatures.map((item) => (
                <li key={item.text} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 shrink-0 text-[14px] ${item.highlight ? "font-semibold text-emerald-400 dark:text-emerald-600" : "text-emerald-500/70 dark:text-emerald-600/70"}`}
                  >
                    ✓
                  </span>
                  <span
                    className={`text-[14px] leading-snug ${item.highlight ? "font-medium text-white/90 dark:text-[#0A0A0A]/90" : "text-white/50 dark:text-[#0A0A0A]/60"}`}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>

            <div className="relative z-10 mt-auto pt-8">
              <Link href="/dashboard" className={ctaPrimary}>
                {signedIn ? "Go to dashboard →" : "Start your 3-day free trial"}
              </Link>
              <p className="mt-3 text-center text-[12px] text-white/25 dark:text-[#0A0A0A]/40">
                3-day free trial · Cancel anytime · Lock in early-adopter
                pricing
              </p>
            </div>
          </div>

          {/* PRO - commented out for now, add back later
          <div className="flex flex-col bg-background p-8 md:p-10">
            <div className="mb-6 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Pro
            </div>

            <div className="mb-2 flex items-baseline gap-3">
              <div className="font-serif text-[64px] leading-none tracking-tight text-foreground">
                $35
              </div>
              <div>
                <div className="text-[18px] font-medium text-muted-foreground line-through decoration-red-500 decoration-2">
                  $49
                </div>
                <div className="text-[13px] text-muted-foreground">/month</div>
              </div>
              <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                Save 30%
              </span>
            </div>

            <p className="mb-8 text-[14px] leading-relaxed text-muted-foreground">
              For power users and agencies who need unlimited reach.
            </p>

            <hr className="mb-8 border-border" />

            <ul className="mb-10 flex-1 space-y-4">
              {proFeatures.map((item) => (
                <li key={item.text} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 shrink-0 text-[14px] ${item.highlight ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-emerald-600 dark:text-emerald-400"}`}
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

            <Link
              href="/dashboard"
              className="block w-full rounded-[10px] border-2 border-foreground/10 bg-background py-3.5 text-center text-[14px] font-medium text-foreground transition-all hover:border-foreground/25 hover:bg-muted dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-muted/50"
            >
              Get started - 3-day free trial
            </Link>

            <p className="mt-3 text-center text-[12px] text-muted-foreground">
              3-day free trial · Cancel anytime
            </p>
          </div>
          */}
        </div>
      </div>
    </section>
  );
}
