import { useParams, Navigate } from "react-router-dom";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { PseoFaq } from "@/components/landing/PseoFaq";
import { PseoRelatedLinks } from "@/components/landing/PseoRelatedLinks";
import { PSEO_PAGES_ENABLED } from "@/lib/content/pseo-enabled";
import { ALTERNATIVE_SLUGS, getAlternative } from "@/lib/content/alternatives";
import { getFeature } from "@/lib/content/features";
import { SeoHead } from "@/components/seo/SeoHead";
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebPageJsonLd,
} from "@/lib/seo";

export function AlternativeDetailPage() {
  const { slug = "" } = useParams();
  if (!PSEO_PAGES_ENABLED) return <Navigate to="/" replace />;

  const page = getAlternative(slug);
  if (!page) return <Navigate to="/alternatives" replace />;

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
      <SeoHead
        title={page.metaTitle}
        description={page.metaDescription}
        path={`/alternatives/${slug}`}
        keywords={page.keywords}
        canonical={absoluteUrl(`/alternatives/${slug}`)}
      />
      <PseoJsonLd graphs={jsonLd} />

      <section className="border-b border-border px-6 pb-14 pt-12 lg:px-8 lg:pb-16 lg:pt-16">
        <div className="mx-auto max-w-[1100px]">
          <nav className="mb-8 text-[13px] text-muted-foreground">
            <Link href="/alternatives" className="hover:text-foreground">
              Alternatives
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">{page.competitorName}</span>
          </nav>
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
              Start posting
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
          <p className="max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            {page.intro}
          </p>

          <h2 className="mt-14 mb-6 font-serif text-[clamp(24px,3vw,36px)] tracking-tight text-foreground">
            Why creators switch from {page.competitorName}
          </h2>
          <ul className="max-w-2xl space-y-3">
            {page.whySwitch.map((item) => (
              <li
                key={item}
                className="flex gap-3 text-[15px] leading-relaxed text-foreground"
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {page.comparisonRows.length > 0 && (
        <section className="border-y border-border px-6 py-16 lg:px-8">
          <div className="mx-auto max-w-[1100px]">
            <h2 className="mb-8 font-serif text-[clamp(24px,3vw,36px)] tracking-tight text-foreground">
              Social0 vs {page.competitorName}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-4 pr-6 font-medium text-muted-foreground">
                      Feature
                    </th>
                    <th className="pb-4 pr-6 font-medium text-foreground">
                      Social0
                      <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                        recommended
                      </span>
                    </th>
                    <th className="pb-4 font-medium text-muted-foreground">
                      {page.competitorName}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.comparisonRows.map((row) => (
                    <tr
                      key={row.feature}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-4 pr-6 text-foreground">
                        {row.feature}
                      </td>
                      <td className="py-4 pr-6 text-foreground">
                        {row.social0}
                      </td>
                      <td className="py-4 text-muted-foreground">
                        {row.competitor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

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
