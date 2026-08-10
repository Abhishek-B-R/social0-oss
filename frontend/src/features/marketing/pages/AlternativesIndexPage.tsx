import { Navigate } from "react-router-dom";
import type { PageMetadata } from "@/lib/seo";
import Link from "@/components/AppLink";
import { PSEO_PAGES_ENABLED } from "@/lib/content/pseo-enabled";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { ALTERNATIVES } from "@/lib/content/alternatives";
import {
  buildItemListJsonLd,
  buildPageMetadata,
  buildSoftwareApplicationJsonLd,
  buildWebPageJsonLd,
} from "@/lib/seo";

export const metadata: PageMetadata = buildPageMetadata({
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
  if (!PSEO_PAGES_ENABLED) return <Navigate to="/404" replace />;

  const jsonLd = [
    buildWebPageJsonLd({
      name: "Social Media Scheduler Alternatives | Social0",
      description:
        "Compare Social0 to Buffer, Hootsuite, Later, Metricool, and other social media schedulers.",
      path: "/alternatives",
    }),
    buildItemListJsonLd(
      ALTERNATIVES.map((alt) => ({
        name: `${alt.competitorName} alternative`,
        path: `/alternatives/${alt.slug}`,
      })),
    ),
    buildSoftwareApplicationJsonLd(),
  ];

  return (
    <MarketingPageLayout>
      <PseoJsonLd graphs={jsonLd} />
      <section className="px-6 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[1100px]">
          <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            Alternatives
          </p>
          <h1 className="max-w-2xl font-serif text-[clamp(32px,5vw,48px)] leading-tight tracking-tight text-[#333C4D] dark:text-white">
            Social0 vs popular schedulers
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
            Straight comparisons for creators evaluating a switch — what
            Social0 does differently, and who it&apos;s for.
          </p>

          <ul className="mt-14 divide-y divide-border border-y border-border">
            {ALTERNATIVES.map((alt) => (
              <li key={alt.slug}>
                <Link
                  href={`/alternatives/${alt.slug}`}
                  className="group flex flex-col gap-1 py-6 transition-colors sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
                >
                  <div className="min-w-0">
                    <h2 className="font-serif text-xl tracking-tight text-[#333C4D] group-hover:text-[#333C4D]/80 dark:text-white dark:group-hover:text-white/80">
                      {alt.competitorName} alternative
                    </h2>
                    <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                      {alt.heroSubheadline}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] text-muted-foreground transition-colors group-hover:text-foreground sm:pt-1">
                    Compare →
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
