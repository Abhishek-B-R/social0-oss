import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PseoFaq } from "@/components/landing/PseoFaq";
import { PseoRelatedLinks } from "@/components/landing/PseoRelatedLinks";
import { FEATURE_SLUGS, getFeature } from "@/lib/content/features";
import { getAlternative } from "@/lib/content/alternatives";
import {
  buildFaqJsonLd,
  buildPageMetadata,
  buildWebPageJsonLd,
} from "@/lib/seo";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return FEATURE_SLUGS.map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getFeature(slug);
  if (!page) return {};

  return buildPageMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/features/${slug}`,
    keywords: page.keywords,
  });
}

export default async function FeaturePage({ params }: PageProps) {
  const { slug } = await params;
  const page = getFeature(slug);
  if (!page) notFound();

  const relatedAlternatives = page.relatedAlternativeSlugs
    .map((s) => getAlternative(s))
    .filter(Boolean)
    .map((a) => ({
      href: `/alternatives/${a!.slug}`,
      label: `${a!.competitorName} alternative`,
    }));

  const jsonLd = [
    buildWebPageJsonLd({
      name: page.metaTitle,
      description: page.metaDescription,
      path: `/features/${slug}`,
    }),
    buildFaqJsonLd(page.faq),
  ];

  return (
    <MarketingPageLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="border-b border-border px-6 pb-16 pt-12 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-[1100px]">
          <nav className="mb-6 text-[13px] text-muted-foreground">
            <Link href="/features" className="hover:text-foreground">
              Features
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">
              {page.platformLabel ?? page.heroHeadline.split("—")[0].trim()}
            </span>
          </nav>
          {page.platformLabel ? (
            <p className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700">
              {page.platformLabel} scheduling
            </p>
          ) : null}
          <h1 className="max-w-3xl font-serif text-[clamp(32px,5vw,52px)] leading-tight tracking-tight text-foreground">
            {page.heroHeadline}
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            {page.heroSubheadline}
          </p>
          <div className="mt-8">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-[10px] bg-foreground px-6 py-3 text-[15px] font-medium text-background transition-all hover:-translate-y-px dark:bg-white dark:text-black"
            >
              Start scheduling free
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-[1100px]">
          <p className="max-w-3xl text-[16px] leading-relaxed text-muted-foreground">
            {page.intro}
          </p>
          <h2 className="mt-12 mb-6 font-serif text-[clamp(24px,3vw,36px)] tracking-tight text-foreground">
            What you get
          </h2>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {page.benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="bg-background px-6 py-6 dark:bg-background/50"
              >
                <h3 className="mb-2 text-[15px] font-semibold text-foreground">
                  {benefit.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-10 font-serif text-[clamp(24px,3vw,36px)] tracking-tight text-foreground">
            How it works
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {page.howItWorks.map((step) => (
              <li
                key={step.step}
                className="rounded-2xl border border-border bg-background p-6 dark:bg-background/50"
              >
                <span className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600/10 text-[13px] font-semibold text-emerald-700">
                  {step.step}
                </span>
                <h3 className="mb-2 text-[16px] font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <PseoFaq faqs={page.faq} />
      <PseoRelatedLinks title="Compare tools" links={relatedAlternatives} />
      <PseoRelatedLinks
        title="More features"
        links={FEATURE_SLUGS.filter((s) => s !== slug).slice(0, 6).map((s) => {
          const feature = getFeature(s)!;
          return {
            href: `/features/${s}`,
            label: feature.platformLabel
              ? `${feature.platformLabel} scheduler`
              : feature.heroHeadline.split("—")[0].trim(),
          };
        })}
      />
    </MarketingPageLayout>
  );
}
