import { XIcon } from "./PlatformIcons";

export function FounderSection() {
  return (
    <section className="border-y border-border bg-muted/30 px-6 py-20 dark:bg-muted/10 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex flex-col items-center gap-10 md:flex-row md:gap-16">
          {/* Photo */}
          <div className="relative shrink-0">
            <div className="h-32 w-32 overflow-hidden rounded-full bg-muted dark:bg-muted/60">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/me-original-kHBh6EO4auYBHlL4qunshacNB27xMD.jpg"
                alt="Abhishek"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-foreground dark:border-[#0A0A0A] dark:bg-white">
              <XIcon className="h-4 w-4 text-background dark:text-[#0A0A0A]" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 text-center md:text-left">
            {/* Pull quote - the most prominent element */}
            <blockquote className="mb-8">
              <p className="font-serif text-[clamp(24px,4vw,36px)] italic leading-snug tracking-tight text-foreground">
                &ldquo;I got tired of copy-pasting the same tweet into 6
                different tabs every morning. So I built this.&rdquo;
              </p>
            </blockquote>

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
                <span className="font-semibold text-foreground">6,500+</span>
                <span>followers watching this get built</span>
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
              platforms connected
            </div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div>
            <div className="text-3xl font-semibold tracking-tight text-foreground">
              1
            </div>
            <div className="text-[13px] text-muted-foreground">
              solo founder
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
