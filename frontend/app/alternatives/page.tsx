import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { ALTERNATIVES } from "@/lib/content/alternatives";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Social Media Scheduler Alternatives | Social0",
  description:
    "Compare Social0 to Buffer, Hootsuite, Later, Metricool, and other social media schedulers. Find the right tool for multi-platform publishing.",
  path: "/alternatives",
  keywords: [
    "social media scheduler alternatives",
    "buffer alternative",
    "hootsuite alternative",
  ],
});

export default function AlternativesIndexPage() {
  return (
    <MarketingPageLayout>
      <section className="px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1100px]">
          <p className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700">
            Alternatives
          </p>
          <h1 className="max-w-2xl font-serif text-[clamp(32px,5vw,48px)] leading-tight tracking-tight text-foreground">
            Social0 vs popular schedulers
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            Honest comparisons for creators evaluating a switch. Each page
            covers features, workflow differences, and who Social0 is best for.
          </p>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {ALTERNATIVES.map((alt) => (
              <li key={alt.slug}>
                <Link
                  href={`/alternatives/${alt.slug}`}
                  className="block rounded-2xl border border-border bg-background p-6 transition-colors hover:border-emerald-600/30 dark:bg-background/50"
                >
                  <h2 className="font-serif text-xl text-foreground">
                    {alt.competitorName} alternative
                  </h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                    {alt.heroSubheadline}
                  </p>
                  <span className="mt-4 inline-block text-[13px] font-medium text-emerald-700">
                    Read comparison →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingPageLayout>
  );
}
