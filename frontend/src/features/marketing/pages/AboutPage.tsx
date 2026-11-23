import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

const linkClass =
  "text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400 dark:hover:text-emerald-300";

export default function AboutPage() {
  return (
    <div className="landing landing-page min-h-screen flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[22px] text-foreground landing mb-6">
          About Social0
        </h1>
        <p className="text-base text-muted-foreground mb-10">
          Social0 is a social media scheduler with a REST API, MCP server and
          CLI that lets creators, agencies and AI agents publish one post to
          nine networks from one place.
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              What Social0 does
            </h2>
            <p>
              Social0 is a social media scheduler for creators, founders, and
              AI agents. Compose a post once and publish or schedule it to X
              (Twitter), LinkedIn, Instagram, TikTok, YouTube, Facebook Pages,
              Threads, Bluesky, and Pinterest. The same publish pipeline powers
              the dashboard, the hosted MCP server, the REST API, and the{" "}
              <code>social0</code> CLI, so a human and an agent can share one
              set of connected accounts.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Who uses Social0
            </h2>
            <p>
              People who outgrew posting from nine native apps, teams that want
              a shared calendar without an enterprise sales call, and agents
              that need a real API instead of a browser. A free plan is
              available with no credit card. Paid tiers add accounts, bulk
              image and video tools, auto-repost, auto-plug, and teams.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              What makes Social0 different
            </h2>
            <ul>
              <li>
                Priced by connected accounts, with unlimited posts on paid
                plans: Creator is $29.90/month for 15 accounts, Agency is
                $59.90/month for 59 accounts plus $1 for each extra one. See{" "}
                <a href="/pricing" className={linkClass}>
                  pricing
                </a>
                .
              </li>
              <li>
                The REST API, the hosted{" "}
                <a href="/mcp" className={linkClass}>
                  MCP server
                </a>{" "}
                and the CLI are on every plan, including the free one (3
                accounts, 10 posts, no card).
              </li>
              <li>
                One post goes out to every selected network in parallel, and you
                see which networks succeeded and which failed, per account.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Who builds Social0
            </h2>
            <p>
              Social0 is built and run by Abhishek BR, an independent developer
              in India who writes the code, answers support and ships updates
              himself. He started it to post his own work everywhere without
              opening nine apps, and to let his AI agents do the same. You can
              find his other work on{" "}
              <a href="https://github.com/Abhishek-B-R" className={linkClass}>
                GitHub
              </a>{" "}
              and{" "}
              <a href="https://abhishekbr.com" className={linkClass}>
                abhishekbr.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Who operates Social0
            </h2>
            <p>
              Social0 is an independent product operated by{" "}
              {LEGAL_ENTITY.operatorName} ({LEGAL_ENTITY.twitterHandle}). We
              are remote-first. Product support is{" "}
              <a href={`mailto:${LEGAL_ENTITY.supportEmail}`} className={linkClass}>
                {LEGAL_ENTITY.supportEmail}
              </a>
              . There is no walk-in office; contact and privacy requests are
              handled by email. See{" "}
              <a href="/contact" className={linkClass}>
                Contact
              </a>{" "}
              and{" "}
              <a href="/privacy" className={linkClass}>
                Privacy
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
