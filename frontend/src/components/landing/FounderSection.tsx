import Link from "@/components/AppLink";

export function FounderSection({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="border-y border-border bg-muted/30 px-6 py-20 dark:bg-muted/10 lg:px-8">
      <div className="mx-auto max-w-[720px]">
        <div className="flex flex-col items-center text-center">
          {/* Photo */}
          <div
            className="mb-6 h-32 w-32 cursor-pointer overflow-hidden rounded-full border-2 border-emerald-500/40 bg-muted dark:bg-muted/60"
            onClick={() => window.open("https://x.com/abhitwt", "_blank")}
          >
            <img
              src="/pfp.jpg"
              alt="Abhishek, founder of Social0"
              className="h-full w-full object-cover"
            />
          </div>

          <h2 className="font-sans text-[clamp(26px,4vw,34px)] font-bold tracking-tight text-foreground">
            hello..!! it&apos;s{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              Abhishek
            </span>
          </h2>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            (the guy who built Social0)
          </p>

          <div className="mt-8 w-full text-left">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              The Story Behind Social0
            </p>
            <h3 className="mb-6 font-serif text-[clamp(22px,3vw,28px)] tracking-tight text-foreground">
              I don&apos;t think posting on social media should require project
              management skills.
            </h3>

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
                The good scheduling tools were too expensive ($150–$500/month).
                The cheap ones tested my patience. The rest had 147 bloated
                features but still couldn&apos;t do the one thing I actually
                wanted.
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
                . I read every message and try my best to fix any breaking
                issues within 48 hours.
              </p>

              <p>Thanks for being here; it means a lot!</p>

              <p>
                If you want to try it yourself and save hours this week, start
                free below — no credit card required.
              </p>
            </div>
          </div>

          <Link
            href={signedIn ? "/dashboard" : "/auth"}
            className="mt-2 inline-flex min-h-12 w-full max-w-sm items-center justify-center rounded-full bg-emerald-500 px-8 py-3.5 text-[15px] font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
          >
            {signedIn ? "Go to dashboard" : "Try it out for free"}
          </Link>
        </div>
      </div>
    </section>
  );
}
