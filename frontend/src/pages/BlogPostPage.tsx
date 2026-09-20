import { Navigate, useParams } from "react-router-dom";
import Link from "@/components/AppLink";
import { BlogBody } from "@/components/blog/BlogBody";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PseoFaq } from "@/components/landing/PseoFaq";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { SeoHead } from "@/components/seo/SeoHead";
import {
  blogPostPath,
  blogTableOfContents,
  formatBlogDate,
  getBlogPost,
  relatedBlogPosts,
} from "@/lib/content/blog";
import {
  absoluteUrl,
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
} from "@/lib/seo";

export function BlogPostPage() {
  const { slug = "" } = useParams();
  const post = getBlogPost(slug);
  if (!post) return <Navigate to="/blog" replace />;

  const path = blogPostPath(post.slug);
  const toc = blogTableOfContents(post.body);
  const related = relatedBlogPosts(post);

  const jsonLd = [
    buildBlogPostingJsonLd({
      title: post.title,
      description: post.metaDescription,
      path,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      keywords: post.keywords,
      readingMinutes: post.readingMinutes,
    }),
    buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
      { name: post.title, path },
    ]),
    ...(post.faq?.length ? [buildFaqJsonLd(post.faq)] : []),
  ];

  return (
    <MarketingPageLayout>
      <SeoHead
        title={post.metaTitle}
        description={post.metaDescription}
        path={path}
        keywords={post.keywords}
        canonical={absoluteUrl(path)}
        openGraph={{ type: "article" }}
      />
      <PseoJsonLd graphs={jsonLd} />

      <article>
        <header className="border-b border-border px-6 pb-12 pt-12 lg:px-8 lg:pt-16">
          <div className="mx-auto max-w-[760px]">
            <nav className="mb-6 text-[13px] text-muted-foreground">
              <Link href="/blog" className="hover:text-foreground">
                Blog
              </Link>
              <span className="mx-2">/</span>
              <span className="text-foreground">{post.category}</span>
            </nav>
            <h1 className="font-serif text-[clamp(30px,4.6vw,46px)] leading-[1.15] tracking-tight text-[#333C4D] dark:text-white">
              {post.title}
            </h1>
            <p className="mt-5 text-[18px] leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
            <p className="mt-6 text-[13px] text-muted-foreground">
              <time dateTime={post.datePublished}>
                {formatBlogDate(post.datePublished)}
              </time>
              <span className="mx-2" aria-hidden="true">
                ·
              </span>
              {post.readingMinutes} min read
            </p>
          </div>
        </header>

        <div className="px-6 py-12 lg:px-8">
          <div className="mx-auto max-w-[760px]">
            {toc.length > 2 ? (
              <nav
                aria-label="On this page"
                className="mb-10 rounded-2xl border border-border bg-muted/20 px-6 py-5"
              >
                <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                  On this page
                </p>
                <ol className="space-y-2">
                  {toc.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="text-[14px] leading-relaxed text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}

            <BlogBody blocks={post.body} />

            {post.relatedPaths?.length ? (
              <section className="mt-14 border-t border-border pt-8">
                <h2 className="mb-4 text-[11px] uppercase tracking-widest text-muted-foreground">
                  Related product pages
                </h2>
                <ul className="flex flex-wrap gap-3">
                  {post.relatedPaths.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="inline-flex rounded-full border border-border px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:border-emerald-600/40 hover:text-foreground"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </article>

      {post.faq?.length ? <PseoFaq faqs={post.faq} /> : null}

      {related.length > 0 ? (
        <section className="border-t border-border px-6 py-14 lg:px-8">
          <div className="mx-auto max-w-[1100px]">
            <h2 className="mb-6 font-serif text-[clamp(22px,2.5vw,28px)] tracking-tight text-[#333C4D] dark:text-white">
              Keep reading
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={blogPostPath(item.slug)}
                    className="flex h-full flex-col rounded-2xl border border-border bg-background px-5 py-5 transition-colors hover:border-emerald-600/40 hover:bg-muted/30 dark:hover:bg-white/[0.03]"
                  >
                    <span className="text-[11px] uppercase tracking-widest text-emerald-700">
                      {item.category}
                    </span>
                    <span className="mt-2 text-[15px] font-semibold leading-snug text-[#333C4D] dark:text-white">
                      {item.title}
                    </span>
                    <span className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                      {item.excerpt}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </MarketingPageLayout>
  );
}
