import Link from "next/link";
import { Info } from "lucide-react";
import { DOCS_FAIR_USAGE_URL } from "@/lib/docs-url";

const starterFeatures = [
  "Up to 5 connected accounts",
  "Multiple accounts per platform",
  "Unlimited posts",
  "Schedule posts across platforms",
  "Carousel posts",
  "Threads & Collections support",
  "Human support",
];

const growthFeatures = [
  { text: "Up to 15 connected accounts", highlight: true },
  { text: "Multiple accounts per platform", highlight: false },
  { text: "Unlimited posts", highlight: false },
  { text: "Schedule posts across platforms", highlight: false },
  { text: "Carousel posts", highlight: false },
  { text: "Threads & Collections support", highlight: false },
  { text: "Human support", highlight: false },
  { text: "Auto-plug high performing tweets", highlight: false },
  { text: "Auto-repost on autopilot", highlight: false },
  { text: "Bulk scheduling tools", highlight: false },
];

const proFeatures = [
  { text: "Unlimited connected accounts", highlight: true },
  { text: "Multiple accounts per platform", highlight: false },
  { text: "Unlimited posts", highlight: false },
  { text: "Schedule posts across platforms", highlight: false },
  { text: "Carousel posts", highlight: false },
  { text: "Threads & Collections support", highlight: false },
  { text: "Human support", highlight: false },
  { text: "Auto-plug high performing tweets", highlight: false },
  { text: "Auto-repost on autopilot", highlight: false },
  { text: "Bulk scheduling tools", highlight: false },
  { text: "Priority support", highlight: false },
  { text: "Early access to new features", highlight: false },
];

export function PricingSection({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section id="pricing" className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
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
              Early adopter pricing — early users keep this price forever
            </div>
          </div>
        </div>
        <p className="mb-3 text-[15px] text-muted-foreground">
          All plans include a 7-day free trial. Cancel anytime.
        </p>

        {/* Two-card grid (Pro tier commented out for now — add back later) */}
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-border shadow-sm md:grid-cols-2">
          {/* STARTER */}
          <div className="flex flex-col bg-background p-8 md:p-10">
            <div className="mb-6 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Starter
            </div>

            <div className="mb-2 flex items-baseline gap-3">
              <div className="font-serif text-[64px] leading-none tracking-tight text-foreground">
                $6
              </div>
              <div>
                <div className="text-[18px] font-medium text-muted-foreground line-through decoration-red-500 decoration-2">
                  $9
                </div>
                <div className="text-[13px] text-muted-foreground">/month</div>
              </div>
              <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                Save 33%
              </span>
            </div>

            <p className="mb-8 text-[14px] leading-relaxed text-muted-foreground">
              For creators who want to stop copy-pasting between tabs.
            </p>

            <hr className="mb-8 border-border" />

            <ul className="mb-10 flex-1 space-y-4">
              {starterFeatures.map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-[14px] text-emerald-600 dark:text-emerald-400">
                    ✓
                  </span>
                  <span className="text-[14px] leading-snug text-muted-foreground">
                    {text}
                  </span>
                </li>
              ))}
              <li className="flex items-start gap-3 text-[13px] text-muted-foreground">
                <span className="mt-0.5 shrink-0 text-[14px] text-emerald-600 dark:text-emerald-400">
                  ✓
                </span>
                <span className="text-[14px] leading-snug text-muted-foreground">
                  Twitter/X posting limits apply
                </span>
                <a
                  href={DOCS_FAIR_USAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Twitter/X posting limits (API constraints)"
                >
                  <Info className="h-3.5 w-3.5 shrink-0" />
                </a>
              </li>
            </ul>

            <Link
              href={signedIn ? "/dashboard" : "/auth"}
              className="block w-full rounded-[10px] border-2 border-foreground/10 bg-background py-3.5 text-center text-[14px] font-medium text-foreground transition-all hover:border-foreground/25 hover:bg-muted dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-muted/50"
            >
              {signedIn ? "Go to dashboard →" : "Get started — 7-day free trial"}
            </Link>

            <p className="mt-3 text-center text-[12px] text-muted-foreground">
              7-day free trial · Cancel anytime
            </p>
          </div>

          {/* GROWTH */}
          <div className="relative flex flex-col overflow-hidden bg-[#0C0C0C] p-8 dark:bg-[#FAFAF8] md:p-10">
            {/* Background texture */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(26,107,74,0.15),transparent_60%)] dark:bg-[radial-gradient(circle_at_70%_0%,rgba(26,107,74,0.08),transparent_60%)]" />

            {/* Most popular badge */}
            <div className="relative z-10 mb-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-800/60 bg-emerald-950/70 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-emerald-400 dark:border-emerald-200 dark:bg-emerald-50 dark:text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 dark:bg-emerald-500" />
                Most popular
              </span>
            </div>

            <div className="relative z-10 mb-6 text-[11px] font-medium uppercase tracking-widest text-white/30 dark:text-[#0A0A0A]/40">
              Growth
            </div>

            <div className="relative z-10 mb-2 flex items-baseline gap-3">
              <div className="font-serif text-[64px] leading-none tracking-tight text-white dark:text-[#0A0A0A]">
                $19
              </div>
              <div>
                <div className="text-[18px] font-medium text-white/50 line-through decoration-red-500 decoration-2 dark:text-[#0A0A0A]/50">
                  $29
                </div>
                <div className="text-[13px] text-white/40 dark:text-[#0A0A0A]/40">
                  /month
                </div>
              </div>
              <span className="ml-2 rounded bg-emerald-900/50 px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-400 dark:bg-emerald-100 dark:text-emerald-700">
                Save 34%
              </span>
            </div>

            <p className="relative z-10 mb-8 text-[14px] leading-relaxed text-white/50 dark:text-[#0A0A0A]/60">
              For creators who want automation, reposting, and bulk scheduling.
            </p>

            <hr className="relative z-10 mb-8 border-white/[0.08] dark:border-[#0A0A0A]/10" />

            <ul className="relative z-10 mb-10 flex-1 space-y-4">
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
              <li className="flex items-start gap-3 text-[13px] text-muted-foreground">
                <span className="mt-0.5 shrink-0 text-[14px] text-emerald-500/70 dark:text-emerald-600/70">
                  ✓
                </span>
                <span className="text-white/50 dark:text-[#0A0A0A]/60">
                  Twitter/X posting limits apply
                </span>
                <a
                  href={DOCS_FAIR_USAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Twitter/X posting limits (API constraints)"
                >
                  <Info className="h-3.5 w-3.5 shrink-0" />
                </a>
              </li>
            </ul>

            <Link
              href={signedIn ? "/dashboard" : "/auth"}
              className="relative z-10 block w-full rounded-[10px] bg-emerald-600 py-3.5 text-center text-[14px] font-medium text-white transition-all hover:-translate-y-px hover:bg-emerald-500 hover:shadow-[0_6px_20px_rgba(34,145,79,0.35)]"
            >
              {signedIn ? "Go to dashboard →" : "Get started — 7-day free trial"}
            </Link>

            <p className="relative z-10 mt-3 text-center text-[12px] text-white/25 dark:text-[#0A0A0A]/40">
              7-day free trial · Cancel anytime
            </p>
          </div>

          {/* PRO — commented out for now, add back later
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
              href="/auth"
              className="block w-full rounded-[10px] border-2 border-foreground/10 bg-background py-3.5 text-center text-[14px] font-medium text-foreground transition-all hover:border-foreground/25 hover:bg-muted dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-muted/50"
            >
              Get started — 7-day free trial
            </Link>

            <p className="mt-3 text-center text-[12px] text-muted-foreground">
              7-day free trial · Cancel anytime
            </p>
          </div>
          */}
        </div>
      </div>
    </section>
  );
}
