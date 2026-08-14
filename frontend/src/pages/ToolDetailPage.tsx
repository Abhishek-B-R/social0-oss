import { Navigate, useParams } from "react-router-dom";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PseoFaq } from "@/components/landing/PseoFaq";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { SeoHead } from "@/components/seo/SeoHead";
import { getTool, TOOLS } from "@/lib/content/tools";
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebPageJsonLd,
} from "@/lib/seo";

function isExternal(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

export function ToolDetailPage() {
  const { slug = "" } = useParams();
  const page = getTool(slug);
  if (!page) return <Navigate to="/tools" replace />;

  const related = TOOLS.filter((t) => t.slug !== page.slug)
    .slice(0, 6)
    .map((t) => ({ href: `/tools/${t.slug}`, label: t.label }));

  const jsonLd = [
    buildWebPageJsonLd({
      name: page.metaTitle,
      description: page.metaDescription,
      path: `/tools/${slug}`,
    }),
    buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Tools", path: "/tools" },
      { name: page.label, path: `/tools/${slug}` },
    ]),
    buildSoftwareApplicationJsonLd(),
    buildFaqJsonLd(page.faq),
  ];

  const ctaClassName =
    "inline-flex items-center gap-2 rounded-[10px] bg-foreground px-6 py-3 text-[15px] font-medium text-background transition-all hover:-translate-y-px dark:bg-white dark:text-black";

  return (
    <MarketingPageLayout>
      <SeoHead
        title={page.metaTitle}
        description={page.metaDescription}
        path={`/tools/${slug}`}
        keywords={page.keywords}
        canonical={absoluteUrl(`/tools/${slug}`)}
      />
      <PseoJsonLd graphs={jsonLd} />

      <section className="border-b border-border px-6 pb-16 pt-12 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-[1100px]">
          <nav className="mb-6 text-[13px] text-muted-foreground">
            <Link href="/tools" className="hover:text-foreground">
              Tools
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">{page.label}</span>
          </nav>
          <p className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700">
            {page.label}
          </p>
          <h1 className="max-w-3xl font-serif text-[clamp(32px,5vw,52px)] leading-tight tracking-tight text-[#333C4D] dark:text-white">
            {page.heroHeadline}
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            {page.heroSubheadline}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {isExternal(page.ctaHref) ? (
              <a
                href={page.ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className={ctaClassName}
              >
                {page.ctaLabel}
                <span aria-hidden="true">→</span>
              </a>
            ) : (
              <Link href={page.ctaHref} className={ctaClassName}>
                {page.ctaLabel}
                <span aria-hidden="true">→</span>
              </Link>
            )}
            {page.docsHref ? (
              <a
                href={page.docsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[10px] border border-border px-6 py-3 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                Docs
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-[1100px]">
          <p className="max-w-3xl text-[16px] leading-relaxed text-muted-foreground">
            {page.intro}
          </p>
          <h2 className="mt-12 mb-6 font-serif text-[clamp(24px,3vw,36px)] tracking-tight text-[#333C4D] dark:text-white">
            What you get
          </h2>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {page.benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="bg-background px-6 py-6 dark:bg-background/50"
              >
                <h3 className="mb-2 text-[15px] font-semibold text-[#333C4D] dark:text-white">
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
          <h2 className="mb-8 font-serif text-[clamp(24px,3vw,36px)] tracking-tight text-[#333C4D] dark:text-white">
            How it works
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {page.howItWorks.map((step) => (
              <li key={step.step} className="rounded-2xl border border-border bg-background p-6">
                <p className="mb-3 text-[12px] font-medium uppercase tracking-widest text-emerald-700">
                  Step {step.step}
                </p>
                <h3 className="mb-2 text-[16px] font-semibold text-[#333C4D] dark:text-white">
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

      <section className="px-6 pb-16 lg:px-8">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-4 font-serif text-[clamp(22px,2.5vw,28px)] tracking-tight text-[#333C4D] dark:text-white">
            More tools
          </h2>
          <div className="flex flex-wrap gap-3">
            {related.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-border px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:border-emerald-600/40 hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/mcp"
              className="rounded-full border border-border px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:border-emerald-600/40 hover:text-foreground"
            >
              MCP
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageLayout>
  );
}
