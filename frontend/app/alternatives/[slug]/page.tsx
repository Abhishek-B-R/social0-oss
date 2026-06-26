import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { PseoFaq } from "@/components/landing/PseoFaq";
import { PseoRelatedLinks } from "@/components/landing/PseoRelatedLinks";
import { PSEO_PAGES_ENABLED } from "@/lib/content/pseo-enabled";
import { ALTERNATIVE_SLUGS, getAlternative } from "@/lib/content/alternatives";
import { getFeature } from "@/lib/content/features";
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildPageMetadata,
  buildSoftwareApplicationJsonLd,
  buildWebPageJsonLd,
} from "@/lib/seo";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  if (!PSEO_PAGES_ENABLED) return [];
  return ALTERNATIVE_SLUGS.map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getAlternative(slug);
  if (!page) return {};

  return buildPageMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/alternatives/${slug}`,
    keywords: page.keywords,
  });
}

export default async function AlternativePage({ params }: PageProps) {
  if (!PSEO_PAGES_ENABLED) notFound();

  const { slug } = await params;
  const page = getAlternative(slug);
  if (!page) notFound();

  const relatedFeatures = page.relatedFeatureSlugs
    .map((s) => getFeature(s))
    .filter(Boolean)
    .map((f) => ({
      href: `/features/${f!.slug}`,
      label: f!.heroHeadline.replace(/ -.*/, ""),
    }));

  const jsonLd = [
    buildWebPageJsonLd({
      name: page.metaTitle,
      description: page.metaDescription,
      path: `/alternatives/${slug}`,
    }),
    buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Alternatives", path: "/alternatives" },
      {
        name: `${page.competitorName} alternative`,
        path: `/alternatives/${slug}`,
      },
    ]),
    buildSoftwareApplicationJsonLd(),
    buildFaqJsonLd(page.faq),
  ];

  return (
    <MarketingPageLayout>
      <PseoJsonLd graphs={jsonLd} />

      <section className="border-b border-border px-6 pb-16 pt-12 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-[1100px]">
          <nav className="mb-6 text-[13px] text-muted-foreground">
            <Link href="/alternatives" className="hover:text-foreground">
              Alternatives
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">{page.competitorName}</span>
          </nav>
          <p className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700">
            {page.competitorName} alternative
          </p>
          <h1 className="max-w-3xl font-serif text-[clamp(32px,5vw,52px)] leading-tight tracking-tight text-foreground">
            {page.heroHeadline}
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            {page.heroSubheadline}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-[10px] bg-foreground px-6 py-3 text-[15px] font-medium text-background transition-all hover:-translate-y-px dark:bg-white dark:text-black"
            >
              Try Social0 free
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/#pricing"
              className="inline-flex items-center rounded-[10px] border border-border px-6 py-3 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              View pricing
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
            Why creators switch from {page.competitorName}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {page.whySwitch.map((item) => (
              <li
                key={item}
                className="rounded-xl border border-border bg-background px-5 py-4 text-[14px] leading-relaxed text-foreground dark:bg-background/50"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-[1100px] overflow-x-auto">
          <h2 className="mb-8 font-serif text-[clamp(24px,3vw,36px)] tracking-tight text-foreground">
            Social0 vs {page.competitorName}
          </h2>
          <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4 font-medium text-muted-foreground">
                  Feature
                </th>
                <th className="py-3 pr-4 font-medium text-emerald-700">
                  Social0
                </th>
                <th className="py-3 font-medium text-muted-foreground">
                  {page.competitorName}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.comparisonRows.map((row) => (
                <tr key={row.feature} className="border-b border-border/70">
                  <td className="py-4 pr-4 font-medium text-foreground">
                    {row.feature}
                  </td>
                  <td className="py-4 pr-4 text-foreground">{row.social0}</td>
                  <td className="py-4 text-muted-foreground">
                    {row.competitor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PseoFaq faqs={page.faq} />
      <PseoRelatedLinks title="Related features" links={relatedFeatures} />
      <PseoRelatedLinks
        title="More alternatives"
        links={ALTERNATIVE_SLUGS.filter((s) => s !== slug).map((s) => {
          const alt = getAlternative(s)!;
          return {
            href: `/alternatives/${s}`,
            label: `${alt.competitorName} alternative`,
          };
        })}
      />
    </MarketingPageLayout>
  );
}
