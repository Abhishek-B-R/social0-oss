"use client";
/* eslint-disable @next/next/no-img-element */
import { XIcon } from "./PlatformIcons";

export function FounderSection() {
  return (
    <section className="border-y border-border bg-muted/30 px-6 py-20 dark:bg-muted/10 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex flex-col items-center gap-10 md:flex-row md:gap-16">
          {/* Photo */}
          <div className="relative shrink-0">
            <div
              className="h-32 w-32 overflow-hidden rounded-full bg-muted dark:bg-muted/60"
              onClick={() => window.open("https://x.com/abhitwt", "_blank")}
            >
              <img
                src="/pfp.jpg"
                alt="Abhishek, founder of Social0"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-foreground dark:border-[#0A0A0A] dark:bg-white">
              <XIcon className="h-4 w-4 text-background dark:text-[#0A0A0A]" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 text-center md:text-left">
            <h2 className="mb-4 font-serif text-[clamp(24px,3vw,32px)] tracking-tight text-foreground">
              Why I built Social0
            </h2>
            <div className="mb-6 space-y-2 text-[16px] leading-relaxed text-muted-foreground">
              <p>Every morning I opened the same tabs.</p>
              <p className="text-muted-foreground/80 dark:text-muted-foreground/80">
                Twitter. LinkedIn. Threads. Bluesky.
              </p>
              <p>
                Just to post the{" "}
                <strong className="font-semibold text-foreground">
                  same update again and again
                </strong>
                .
              </p>
              <p>
                Sometimes it meant opening{" "}
                <strong className="font-semibold text-foreground">
                  4–6 different tabs
                </strong>{" "}
                just to share one post.
              </p>
              <p>
                Most tools started at{" "}
                <strong className="font-semibold text-foreground">
                  $50–$100/month
                </strong>{" "}
                or were packed with features I didn’t actually need.
              </p>
              <p>
                The cheaper ones were{" "}
                <strong className="font-semibold text-foreground">
                  slow, buggy, or missing basic functionality
                </strong>
                .
              </p>
              <p>
                I wanted something{" "}
                <strong className="font-semibold text-emerald-700 dark:text-emerald-400">
                  simple, fast, and affordable
                </strong>
                .
              </p>
              <p className="text-foreground">
                So I built Social0 — a way to{" "}
                <strong className="font-semibold text-emerald-700 dark:text-emerald-400">
                  write once and publish everywhere
                </strong>
                .
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-6">
              <div>
                <div className="text-[16px] font-semibold text-foreground">
                  Abhishek
                </div>
                <a
                  href="https://twitter.com/abhitwt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  @abhitwt
                </a>
              </div>
              <div className="hidden h-10 w-px bg-border md:block" />
              <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
                <span className="font-semibold text-foreground">7,500+</span>
                <span>people following the journey</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-10 border-t border-border pt-10 text-center md:justify-start">
          <div>
            <div className="text-3xl font-semibold tracking-tight text-foreground">
              9
            </div>
            <div className="text-[13px] text-muted-foreground">
              platforms supported
            </div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div>
            <div className="text-3xl font-semibold tracking-tight text-foreground">
              1
            </div>
            <div className="text-[13px] text-muted-foreground">
              Built by a solo founder
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
