"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { FlowAnimation } from "./FlowAnimation";

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
              {/* <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> */}
              {/* Public Beta */}
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
                  {signedIn ? "Go to dashboard" : "Start posting"}
                  <span aria-hidden="true">→</span>
                </Link>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle className="h-3.5 w-3.5" /> Start free · No credit
                  card required
                </span>
              </div>
              {/* Social proof — under CTA to reinforce action */}
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-1.5 w-1.5 ml-2 shrink-0 rounded-full bg-emerald-500/80" />
                Be among the first to try Social0
              </p>
            </div>
          </div>

          {/* Right column - Animated beam: you → Social0 → every platform */}
          {/* Inverted vs page theme: dark card on light theme, light card on dark */}
          <div className="hidden self-center lg:block">
            <FlowAnimation className="shadow-[0_40px_80px_rgba(0,0,0,0.18)] dark:shadow-[0_40px_80px_rgba(0,0,0,0.12)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
