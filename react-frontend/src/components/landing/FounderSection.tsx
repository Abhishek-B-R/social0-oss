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
              I don&apos;t think posting on social media should require project
              management skills.
            </h2>
            <div className="mb-6 space-y-4 text-[16px] leading-relaxed text-muted-foreground">
              <p>
                I&apos;d post on Twitter. Then remember LinkedIn. Then remember
                Threads. Then remember that I told everyone I was &ldquo;trying
                Bluesky seriously this time.&rdquo;
              </p>
              <p>
                Twenty minutes later, I&apos;d still be copy pasting the same
                post into different text boxes.
              </p>
              <p>
                At some point I realized I had accidentally become an unpaid
                intern for my own social media accounts.
              </p>
              <p>
                I searched for tools. The good ones were expensive. The cheap
                ones tested my patience. The rest somehow had 147 features and
                still couldn&apos;t do the one thing I wanted.
              </p>
              <p className="font-semibold text-foreground">
                So I built Social0.
              </p>
              <div className="space-y-2 pl-0 md:pl-1">
                <p>For creators trying to stay consistent.</p>
                <p>For agencies juggling multiple accounts.</p>
                <p>For businesses that have better things to do.</p>
                <p>
                  For anyone who&apos;s ever thought:{" "}
                  <span className="italic text-foreground">
                    &ldquo;Why am I still copy pasting the same post in
                    2026?&rdquo;
                  </span>
                </p>
              </div>
              <p>
                If you run into a bug, something feels confusing, or you have an
                idea that would make Social0 better,{" "}
                <a
                  href="https://x.com/social0_app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-emerald-700 dark:hover:text-emerald-400"
                >
                  send me a DM on X
                </a>{" "}
                or{" "}
                <a
                  href="mailto:support@social0.app"
                  className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-emerald-700 dark:hover:text-emerald-400"
                >
                  shoot me an email
                </a>
                .
              </p>
              <p>
                I read every message myself, and if something is broken,
                I&apos;ll do my best to fix it within 48 hours.
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-6">
              <div>
                <div className="text-[16px] font-semibold text-foreground">
                  Abhishek
                </div>
                <a
                  href="https://x.com/abhitwt"
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
      </div>
    </section>
  );
}
