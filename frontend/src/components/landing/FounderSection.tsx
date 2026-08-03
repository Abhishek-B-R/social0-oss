import { XIcon } from "./PlatformIcons";

export function FounderSection() {
  return (
    <section className="border-y border-border bg-muted/30 px-4 py-16 dark:bg-muted/10 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-[900px]">
        <div className="flex flex-col items-center gap-8 md:flex-row md:gap-12">
          <div className="relative shrink-0">
            <div
              className="h-28 w-28 cursor-pointer overflow-hidden rounded-full bg-muted dark:bg-muted/60"
              onClick={() => window.open("https://x.com/abhitwt", "_blank")}
            >
              <img
                src="/pfp.webp"
                alt="Abhishek, founder of Social0"
                width={112}
                height={112}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-foreground dark:border-[#0A0A0A] dark:bg-white">
              <XIcon className="h-3.5 w-3.5 text-background dark:text-[#0A0A0A]" />
            </div>
          </div>

          <div className="flex-1 text-center md:text-left">
            <h2 className="mb-3 font-serif text-[clamp(22px,3vw,28px)] tracking-tight text-foreground">
              I built Social0 because I was tired of copying the same post
              between nine websites.
            </h2>
            <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">
              <p>
                Every launch meant opening X, then LinkedIn, then Threads, then
                Bluesky, then Instagram. After weeks of that, I stopped posting
                consistently.
              </p>
              <p className="font-medium text-foreground">So I built Social0.</p>
              <p>
                Today it&apos;s a dashboard, REST API, MCP, and CLI — one publish
                engine behind all of them.
              </p>
              <p>
                Bug or idea?{" "}
                <a
                  href="https://x.com/social0_app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-400"
                >
                  DM me on X
                </a>{" "}
                or{" "}
                <a
                  href="mailto:support@social0.app"
                  className="font-medium text-foreground underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-400"
                >
                  email me
                </a>
                . I usually fix broken things within 48 hours.
              </p>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3 md:flex-row md:gap-5">
              <div>
                <div className="text-[15px] font-semibold text-foreground">
                  Abhishek
                </div>
                <a
                  href="https://x.com/abhitwt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-muted-foreground hover:text-foreground"
                >
                  @abhitwt
                </a>
              </div>
              <div className="hidden h-8 w-px bg-border md:block" />
              <div className="text-[13px] text-muted-foreground">
                {/* PLACEHOLDER — replace 2,400+ with real creator count */}
                <span className="font-semibold text-foreground">2,400+</span>{" "}
                creators posting ·{" "}
                <span className="font-semibold text-foreground">7,500+</span>{" "}
                following the journey
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
