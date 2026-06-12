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
                  href="/dashboard"
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

            {/* Composer — mirrors the real /dashboard/create form */}
            <div className="p-5">
              <div className="rounded-xl border border-white/6 bg-[#141414] p-5 dark:border-transparent dark:bg-white dark:shadow-sm">
                {/* Header row, like the real composer card */}
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-white/90 dark:text-[#0A0A0A]/90">
                    What do you want to post?
                  </span>
                  <span className="text-[11px] text-emerald-400/80 dark:text-emerald-600/80">
                    Draft saved ✓
                  </span>
                </div>

                {/* Textarea look-alike */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 dark:border-black/10 dark:bg-black/[0.02]">
                  <p className="text-[14px] leading-relaxed text-white/85 dark:text-[#0A0A0A]/85">
                    Just shipped Social0 🚀
                    <br />
                    <br />
                    Post to X, LinkedIn, Threads, Bluesky and more at once.
                    <br />
                    <br />
                    No tab switching. No copy-paste.
                    <br />
                    #buildinpublic #indiehacker
                    <span className="ml-0.5 inline-block h-[14px] w-[2px] animate-pulse bg-emerald-400 align-middle dark:bg-emerald-600" />
                  </p>
                </div>

                {/* Character counter, like CaptionCounter */}
                <div className="mt-1.5 mb-4 flex justify-end">
                  <span className="font-mono text-[10px] text-white/30 dark:text-black/35">
                    142 / 280 — fits every platform ✓
                  </span>
                </div>

                {/* Selected accounts */}
                <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/30 dark:text-black/35">
                  Posting to
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {targetPlatforms.map((platform) => (
                    <span
                      key={platform.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-white/75 dark:border-emerald-600/30 dark:bg-emerald-600/10 dark:text-[#0A0A0A]/70"
                    >
                      <platform.icon className="h-3 w-3" />
                      {platform.name}
                      <span className="text-[9px] text-emerald-400 dark:text-emerald-600">
                        ✓
                      </span>
                    </span>
                  ))}
                  <span className="inline-flex items-center rounded-full border border-dashed border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/40 dark:border-black/15 dark:text-black/40">
                    +5 more
                  </span>
                </div>

                {/* Bottom row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/6 pt-4 dark:border-black/8">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 px-2 py-1.5 font-mono text-[10px] text-white/50 dark:border-black/10 dark:text-black/50">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 dark:bg-emerald-600" />
                    Tomorrow 9:00 AM
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="whitespace-nowrap rounded-lg border border-white/10 px-3 py-2 text-[12px] font-medium text-white/60 transition-colors hover:bg-white/5 dark:border-black/10 dark:text-black/55 dark:hover:bg-black/5"
                    >
                      Schedule
                    </button>
                    <button
                      type="button"
                      className="whitespace-nowrap rounded-lg bg-emerald-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_4px_14px_rgba(16,185,129,0.35)] transition-colors hover:bg-emerald-500"
                    >
                      Publish now
                    </button>
                  </div>
                </div>
              </div>

              {/* Success toast — the payoff moment */}
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 dark:border-emerald-600/20 dark:bg-emerald-600/8">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                  ✓
                </span>
                <div>
                  <p className="text-[12px] font-medium text-white/85 dark:text-[#0A0A0A]/85">
                    Published to 4 platforms
                  </p>
                  <p className="text-[11px] text-white/35 dark:text-black/40">
                    X · Bluesky · LinkedIn · Threads — just now
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
