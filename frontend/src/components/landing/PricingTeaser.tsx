import Link from "@/components/AppLink";
import { getPlanLimits } from "@/lib/plans";
import { getPlanPrice } from "@/lib/plan-pricing";

const freePosts = getPlanLimits("free").maxFreePosts;
const growth = getPlanPrice("growth", "monthly");
const starter = getPlanPrice("starter", "monthly");
const pro = getPlanPrice("pro", "monthly");

/**
 * In-page pricing (Oliver) without dumping the full /pricing page:
 * Free (anchor) → Growth (recommended / decoy middle) → Pro.
 * Full comparison stays on /pricing.
 */
export function PricingTeaser() {
  return (
    <section id="pricing" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 text-center">
          <p className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Pricing
          </p>
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] leading-tight tracking-tight text-foreground">
            Simple pricing.
            <br />
            <em className="italic text-muted-foreground">No gotchas.</em>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Start free. Most creators pick Growth when they&apos;re ready to
            automate.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Free — micro-commitment entry */}
          <div className="rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
            <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-6 dark:border-white/5 dark:bg-[#111111] sm:p-7">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Free
              </p>
              <p className="mt-4 font-serif text-[40px] leading-none tracking-tight text-foreground">
                $0
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                {freePosts} posts · 3 accounts · forever
              </p>
              <Link
                href="/auth"
                className="mt-8 inline-flex min-h-11 items-center justify-center rounded-[10px] border border-border bg-background px-4 py-2.5 text-[14px] font-medium text-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 active:scale-[0.97]"
              >
                Start free
              </Link>
            </div>
          </div>

          {/* Growth — recommended / safe middle (decoy context vs Starter/Pro) */}
          <div className="rounded-[28px] border border-emerald-500/40 bg-emerald-500/5 p-1.5 dark:border-emerald-500/45 dark:bg-emerald-500/10 md:-translate-y-1">
            <div className="relative flex h-full flex-col overflow-hidden rounded-[22px] border border-emerald-500/25 bg-background p-6 dark:border-emerald-500/30 dark:bg-[#111111] sm:p-7">
              <span className="mb-3 inline-flex w-fit items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                Recommended
              </span>
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Growth
              </p>
              <p className="mt-4 flex items-baseline gap-1.5 font-serif text-[40px] leading-none tracking-tight text-foreground">
                ${growth.price}
                <span className="text-[14px] font-sans text-muted-foreground">
                  /mo
                </span>
              </p>
              {growth.listPrice ? (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  <span className="line-through">${growth.listPrice}</span> early
                  adopter
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  vs Starter ${starter.price} · Pro ${pro.price}
                </p>
              )}
              <p className="mt-2 text-[13px] text-muted-foreground">
                15 accounts · automation · bulk tools
              </p>
              <Link
                href="/auth"
                className="mt-8 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-emerald-500 px-4 py-2.5 text-[14px] font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
              >
                Choose Growth
              </Link>
            </div>
          </div>

          {/* Pro */}
          <div className="rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
            <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-6 dark:border-white/5 dark:bg-[#111111] sm:p-7">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Pro
              </p>
              <p className="mt-4 flex items-baseline gap-1.5 font-serif text-[40px] leading-none tracking-tight text-foreground">
                ${pro.price}
                <span className="text-[14px] font-sans text-muted-foreground">
                  /mo
                </span>
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                50 accounts · teams · priority
              </p>
              <Link
                href="/auth"
                className="mt-8 inline-flex min-h-11 items-center justify-center rounded-[10px] border border-border bg-background px-4 py-2.5 text-[14px] font-medium text-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 active:scale-[0.97]"
              >
                Start free
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          No credit card on Free · Cancel anytime ·{" "}
          <Link
            href="/pricing"
            className="underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Compare every feature
          </Link>
        </p>
      </div>
    </section>
  );
}
