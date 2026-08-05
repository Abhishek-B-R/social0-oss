import { XIcon } from "./PlatformIcons";

export function FounderSection() {
  return (
    <section className="border-y border-border bg-muted/30 px-6 py-20 dark:bg-muted/10 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex flex-col items-center gap-10">
          {/* Photo — on top */}
          <div className="relative shrink-0">
            <div
              className="h-32 w-32 cursor-pointer overflow-hidden rounded-full bg-muted dark:bg-muted/60"
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
          <div className="w-full max-w-[720px] text-center md:text-left">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              The Story Behind Social0
            </p>
            <h2 className="mb-6 font-serif text-[clamp(24px,3vw,32px)] tracking-tight text-foreground">
              I don&apos;t think posting on social media should require project
              management skills.
            </h2>

            <div className="mb-6 space-y-5 text-[16px] leading-relaxed text-muted-foreground">
              <p>
                I used to post on X, then remember LinkedIn, then remember
                Threads, and then remember that I told everyone I was
                &ldquo;trying Bluesky seriously this time.&rdquo; Twenty minutes
                later, I&apos;d still be copy-pasting the same text into
                different tabs.
              </p>
              <p>
                At some point, I realized I had accidentally become an unpaid
                intern for my own social media accounts.
              </p>
              <p>
                The good scheduling tools were too expensive. The cheap ones
                tested my patience. The rest had 147 bloated features but still
                couldn&apos;t do the one thing I actually wanted.
              </p>

              <p className="font-semibold text-foreground">
                So I built Social0.
              </p>

              <div className="space-y-1.5 border-l-2 border-border pl-4">
                <p>For creators trying to stay consistent.</p>
                <p>For agencies juggling multiple accounts.</p>
                <p>For businesses that have better things to do.</p>
                <p>
                  For anyone asking:{" "}
                  <span className="italic text-foreground">
                    &ldquo;Why am I still copy-pasting posts in 2026?&rdquo;
                  </span>
                </p>
              </div>

              <p>
                Social0 is a one-person product. Every feature, bug fix, and
                support reply is handled directly by me. I use it every day to
                crosspost my own content—so when something breaks, I feel it
                first.
              </p>

              <p>
                If you run into a bug, have an idea, or just want to chat,{" "}
                <a
                  href="mailto:support@social0.app"
                  className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-emerald-700 dark:hover:text-emerald-400"
                >
                  shoot me an email
                </a>{" "}
                or a{" "}
                <a
                  href="https://x.com/social0_app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-emerald-700 dark:hover:text-emerald-400"
                >
                  DM on X
                </a>
                . I read every message and promise to fix any breaking issues
                within 48 hours.
              </p>

              <p>Thanks for being here; it means a lot!</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[16px] font-semibold text-foreground">
                Abhishek
              </div>
              <a
                href="https://x.com/abhitwt"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] text-[#2B7EFF] transition-opacity hover:opacity-80"
              >
                @abhitwt
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
