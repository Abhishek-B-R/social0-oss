import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PseoRelatedLinks } from "@/components/landing/PseoRelatedLinks";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { SeoHead } from "@/components/seo/SeoHead";
import {
  BLOG_POSTS,
  blogPostPath,
  formatBlogDate,
  usedBlogCategories,
} from "@/lib/content/blog";
import {
  absoluteUrl,
  buildBlogJsonLd,
  buildBreadcrumbJsonLd,
  buildWebPageJsonLd,
} from "@/lib/seo";

const TITLE = "Blog — Social0";
const DESCRIPTION =
  "Platform specs, publishing strategy, and engineering notes on multi-platform social media publishing — character limits, video specs, posting APIs, and AI agent workflows.";

export default function BlogIndexPage() {
  const [featured, ...rest] = BLOG_POSTS;
  const categories = usedBlogCategories();

  const jsonLd = [
    buildWebPageJsonLd({
      name: TITLE,
      description: DESCRIPTION,
      path: "/blog",
    }),
    buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
    ]),
    buildBlogJsonLd(
      BLOG_POSTS.map((post) => ({
        title: post.title,
        description: post.metaDescription,
        path: blogPostPath(post.slug),
        datePublished: post.datePublished,
      })),
    ),
  ];

  return (
    <MarketingPageLayout>
      <SeoHead
        title={TITLE}
        description={DESCRIPTION}
        path="/blog"
        canonical={absoluteUrl("/blog")}
      />
      <PseoJsonLd graphs={jsonLd} />

      <section className="px-6 pb-10 pt-16 lg:px-8 lg:pt-20">
        <div className="mx-auto max-w-[1100px]">
          <p className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700">
            Blog
          </p>
          <h1 className="max-w-3xl font-serif text-[clamp(32px,5vw,48px)] leading-tight tracking-tight text-[#333C4D] dark:text-white">
            Notes on publishing to nine networks at once
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            Platform specs we keep current because our own composer enforces
            them, strategy that survives a busy month, and the engineering
            behind reliable scheduled publishing.
          </p>

          <ul className="mt-8 flex flex-wrap gap-2">
            {categories.map((category) => (
              <li
                key={category}
                className="rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground"
              >
                {category}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {featured ? (
        <section className="px-6 lg:px-8">
          <div className="mx-auto max-w-[1100px]">
            <Link
              href={blogPostPath(featured.slug)}
              className="group flex flex-col rounded-2xl border border-border bg-muted/20 px-7 py-8 transition-colors hover:border-emerald-600/40 lg:px-10 lg:py-10"
            >
              <span className="text-[11px] uppercase tracking-widest text-emerald-700">
                Latest · {featured.category}
              </span>
              <h2 className="mt-3 max-w-3xl font-serif text-[clamp(24px,3.2vw,34px)] leading-tight tracking-tight text-[#333C4D] dark:text-white">
                {featured.title}
              </h2>
              <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
                {featured.excerpt}
              </p>
              <span className="mt-5 text-[13px] text-muted-foreground">
                <time dateTime={featured.datePublished}>
                  {formatBlogDate(featured.datePublished)}
                </time>
                <span className="mx-2" aria-hidden="true">
                  ·
                </span>
                {featured.readingMinutes} min read
              </span>
            </Link>
          </div>
        </section>
      ) : null}

      <section className="px-6 py-14 lg:px-8">
        <div className="mx-auto max-w-[1100px]">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <li key={post.slug}>
                <Link
                  href={blogPostPath(post.slug)}
                  className="flex h-full flex-col rounded-2xl border border-border bg-background px-6 py-6 transition-colors hover:border-emerald-600/40 hover:bg-muted/30 dark:hover:bg-white/[0.03]"
                >
                  <span className="text-[11px] uppercase tracking-widest text-emerald-700">
                    {post.category}
                  </span>
                  <h2 className="mt-2 text-[16px] font-semibold leading-snug text-[#333C4D] dark:text-white">
                    {post.title}
                  </h2>
                  <p className="mt-3 line-clamp-4 flex-1 text-[14px] leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                  <span className="mt-5 text-[12px] text-muted-foreground">
                    <time dateTime={post.datePublished}>
                      {formatBlogDate(post.datePublished)}
                    </time>
                    <span className="mx-2" aria-hidden="true">
                      ·
                    </span>
                    {post.readingMinutes} min read
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PseoRelatedLinks
        title="Also explore"
        links={[
          { href: "/features", label: "Platform schedulers" },
          { href: "/tools", label: "Tools & integrations" },
          { href: "/alternatives", label: "Comparisons" },
          { href: "/mcp", label: "MCP server" },
          { href: "/pricing", label: "Pricing" },
        ]}
      />
    </MarketingPageLayout>
  );
}
