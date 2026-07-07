import { Navigate } from "react-router-dom";
import type { PageMetadata } from "@/lib/seo";
import Link from "@/components/AppLink";
import { PSEO_PAGES_ENABLED } from "@/lib/content/pseo-enabled";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { FEATURES } from "@/lib/content/features";
import {
  buildItemListJsonLd,
  buildPageMetadata,
  buildSoftwareApplicationJsonLd,
  buildWebPageJsonLd,
} from "@/lib/seo";

export const metadata: PageMetadata = buildPageMetadata({
  title: "Social Media Scheduling Features | Social0",
  description:
    "Platform schedulers and tools: Threads, Bluesky, TikTok, Instagram, LinkedIn, X, multi-platform publishing, and content calendar.",
  path: "/features",
  keywords: [
    "social media scheduling features",
    "threads scheduler",
    "bluesky scheduler",
    "tiktok scheduler",
  ],
});

export default function FeaturesIndexPage() {
  if (!PSEO_PAGES_ENABLED) return <Navigate to="/404" replace />;

  const jsonLd = [
    buildWebPageJsonLd({
      name: "Social Media Scheduling Features | Social0",
      description:
        "Platform schedulers and tools: Threads, Bluesky, TikTok, Instagram, LinkedIn, X, multi-platform publishing, and content calendar.",
      path: "/features",
    }),
    buildItemListJsonLd(
      FEATURES.map((feature) => ({
        name: feature.platformLabel
          ? `${feature.platformLabel} scheduler`
          : feature.heroHeadline.split("-")[0].trim(),
        path: `/features/${feature.slug}`,
      })),
    ),
    buildSoftwareApplicationJsonLd(),
  ];

  return (
    <MarketingPageLayout>
      <PseoJsonLd graphs={jsonLd} />
      <section className="px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1100px]">
          <p className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700">
            Features
          </p>
          <h1 className="max-w-2xl font-serif text-[clamp(32px,5vw,48px)] leading-tight tracking-tight text-foreground">
            Scheduling for every platform you use
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            Deep dives on how Social0 handles each network and the
            multi-platform workflow that ties them together.
          </p>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature.slug}>
                <Link
                  href={`/features/${feature.slug}`}
                  className="block rounded-2xl border border-border bg-background p-6 transition-colors hover:border-emerald-600/30 dark:bg-background/50"
                >
                  <h2 className="font-serif text-xl text-foreground">
                    {feature.platformLabel
                      ? `${feature.platformLabel} scheduler`
                      : feature.heroHeadline.split("-")[0].trim()}
                  </h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                    {feature.heroSubheadline}
                  </p>
                  <span className="mt-4 inline-block text-[13px] font-medium text-emerald-700">
                    Learn more →
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
