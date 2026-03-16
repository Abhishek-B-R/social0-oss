"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { XIcon, BlueskyIcon, LinkedInIcon, ThreadsIcon } from "./PlatformIcons";

const targetPlatforms = [
  { icon: XIcon, name: "Twitter" },
  { icon: BlueskyIcon, name: "Bluesky" },
  { icon: LinkedInIcon, name: "LinkedIn" },
  { icon: ThreadsIcon, name: "Threads" },
];

export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="px-6 pb-8 pt-20 lg:px-8 lg:pt-28">
      <div className="mx-auto max-w-[1180px]">
        {/* Two-column layout */}
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_420px] lg:gap-16">
          {/* Left column - Copy */}
          <div>
            {/* Eyebrow badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Public Beta
            </div>

            {/* Headline: only "all your socials" in serif italic emerald (1–2 words) */}
            <h1 className="mb-6 text-[clamp(44px,6vw,72px)] leading-[1.05] tracking-tight text-foreground">
              <span className="font-serif text-[clamp(44px,6vw,72px)] leading-[1.05] tracking-tight text-foreground">
                Post and schedule to{" "}
              </span>
              <em className="font-serif italic text-[#1a6b4a] dark:text-[#00ff77]">
                all your socials
              </em>
              <span className="font-serif text-[clamp(44px,6vw,72px)] leading-[1.05] tracking-tight text-foreground">
                {" "}
                from one place.
              </span>
            </h1>

            {/* Subtitle — benefit first, no feature names */}
            <p className="mb-10 max-w-[480px] text-[17px] leading-relaxed text-muted-foreground">
              Simple to use, with built-in tools that keep your content working
              even after you publish.
            </p>

            {/* CTA */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href={signedIn ? "/dashboard" : "/auth"}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-foreground px-7 py-3.5 text-[15px] font-medium text-background transition-all hover:scale-[1.02] hover:bg-neutral-800 dark:hover:bg-neutral-100 dark:hover:text-neutral-900"
                >
                  {signedIn ? "Go to dashboard" : "Start for free"}
                  <span aria-hidden="true">→</span>
                </Link>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle className="h-3.5 w-3.5" /> 7-day free trial ·
                  Cancel anytime
                </span>
              </div>
              {/* Social proof — under CTA to reinforce action */}
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-1.5 w-1.5 ml-2 shrink-0 rounded-full bg-emerald-500/80" />
                Be among the first to try Social0
              </p>
            </div>
          </div>

          {/* Right column - Mini Dashboard Mockup */}
          {/* Dark mode: light mockup for contrast | Light mode: dark mockup */}
          <div className="hidden overflow-hidden rounded-2xl border border-white/8 bg-[#0A0A0A] shadow-[0_40px_80px_rgba(0,0,0,0.18)] dark:border-border dark:bg-[#FAFAF8] dark:shadow-[0_40px_80px_rgba(0,0,0,0.12)] lg:block">
            {/* Fake browser bar */}
            <div className="flex items-center gap-2 border-b border-white/6 bg-[#141414] px-4 py-3 dark:border-border dark:bg-[#F0EEE9]">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#28CA41]" />
              </div>
              <div className="ml-3 rounded bg-white/5 px-3 py-1 font-mono text-[11px] text-white/25 dark:bg-black/4 dark:text-black/30">
                social0.app/compose
              </div>
            </div>

            {/* Composer */}
            <div className="p-5">
              <div className="rounded-xl border border-white/6 bg-[#141414] p-5 dark:border-transparent dark:bg-white dark:shadow-sm">
                <p className="mb-4 text-[14px] leading-relaxed text-white/80 dark:text-[#0A0A0A]/80">
                  Just shipped Social0 🚀
                  <br />
                  <br />
                  Post to X, LinkedIn, Threads, Bluesky and more at once.
                  <br />
                  <br />
                  No tab switching. No copy-paste. <br />
                  #buildinpublic #indiehacker
                </p>

                {/* Platform target pills with real icons */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {targetPlatforms.map((platform) => (
                    <span
                      key={platform.name}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-medium text-white/60 dark:bg-black/5 dark:text-[#0A0A0A]/60"
                    >
                      <platform.icon className="h-3 w-3" />
                      {platform.name}
                    </span>
                  ))}
                </div>

                {/* Bottom row */}
                <div className="flex items-center justify-between">
                  <span className="rounded bg-white/15 px-2.5 py-1 font-mono text-[11px] text-white/50 dark:bg-black/4 dark:text-black/50">
                    Tomorrow 9:00 AM
                  </span>
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-500"
                  >
                    Publish now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
