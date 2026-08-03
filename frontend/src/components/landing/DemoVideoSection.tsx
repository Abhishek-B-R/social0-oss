import Link from "@/components/AppLink";
import { getPlanLimits } from "@/lib/plans";

const YOUTUBE_DEMO_ID = "yGADZAGW7ls";
const freePosts = getPlanLimits("free").maxFreePosts;

/**
 * Killer visual + micro-commitment: watch → Start free (same goal as hero).
 * Opus-style “try before signup” without building a new tool surface.
 */
export function DemoVideoSection() {
  return (
    <section
      className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8"
      aria-label="Social0 product demo video"
    >
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-8 flex flex-col items-center gap-2 text-center sm:mb-10">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Product demo
          </p>
          <h2 className="max-w-md font-serif text-[clamp(24px,3.5vw,36px)] italic leading-tight text-muted-foreground">
            See it post everywhere.
          </h2>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 shadow-[0_40px_80px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-[#1A1A1A] dark:shadow-[0_40px_80px_rgba(0,0,0,0.4)]">
          <div className="overflow-hidden rounded-[22px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111]">
            <div className="relative aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${YOUTUBE_DEMO_ID}`}
                title="Social0 demo - post and schedule to all your socials from one place"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <Link
            href="/auth"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-7 py-3.5 text-[15px] font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
          >
            Start free — {freePosts} posts included
            <span aria-hidden>→</span>
          </Link>
          <p className="text-[12px] text-muted-foreground">
            No credit card · Connect an account in under 2 minutes
          </p>
        </div>
      </div>
    </section>
  );
}
