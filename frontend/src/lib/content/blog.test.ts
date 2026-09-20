import { describe, expect, it } from "vitest";
import { BLOG_POSTS, getBlogPost, relatedBlogPosts } from "./blog";
import type { BlogBlock } from "./blog-types";
import { BLOG_CATEGORIES } from "./blog-types";
import { FEATURES } from "./features";
import { TOOLS } from "./tools";
import { parseInline } from "@/lib/rich-text";

/** Marketing routes that exist outside the pSEO content files. */
const STATIC_PATHS = new Set([
  "/",
  "/about",
  "/alternatives",
  "/blog",
  "/contact",
  "/developers",
  "/features",
  "/mcp",
  "/pricing",
  "/tools",
]);

const FEATURE_PATHS = new Set(FEATURES.map((f) => `/features/${f.slug}`));
const TOOL_PATHS = new Set(TOOLS.map((t) => `/tools/${t.slug}`));
const BLOG_PATHS = new Set(BLOG_POSTS.map((p) => `/blog/${p.slug}`));

function isKnownInternalPath(href: string): boolean {
  const [path] = href.split("#");
  if (path === "") return true; // pure anchor link
  return (
    STATIC_PATHS.has(path) ||
    FEATURE_PATHS.has(path) ||
    TOOL_PATHS.has(path) ||
    BLOG_PATHS.has(path)
  );
}

/** Every string in a block that may carry inline markup. */
function blockStrings(block: BlogBlock): string[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "subheading":
      return [block.text];
    case "list":
      return block.items;
    case "table":
      return [
        ...(block.caption ? [block.caption] : []),
        ...block.columns,
        ...block.rows.flat(),
      ];
    case "callout":
      return [...(block.title ? [block.title] : []), block.text];
    case "quote":
      return [block.text];
    case "cta":
      return [block.text];
    case "code":
      return [];
    default:
      return [];
  }
}

describe("blog content", () => {
  it("has posts", () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0);
  });

  it("has unique slugs", () => {
    const slugs = BLOG_POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("is sorted newest first", () => {
    const dates = BLOG_POSTS.map((p) => p.datePublished);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it.each(BLOG_POSTS.map((p) => [p.slug, p] as const))(
    "%s has valid metadata",
    (_slug, post) => {
      expect(post.slug).toMatch(/^[a-z0-9-]+$/);
      expect(BLOG_CATEGORIES).toContain(post.category);
      expect(post.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (post.dateModified) {
        expect(post.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(
          post.dateModified.localeCompare(post.datePublished),
        ).toBeGreaterThanOrEqual(0);
      }
      expect(post.keywords.length).toBeGreaterThan(0);
      expect(post.readingMinutes).toBeGreaterThan(0);
      expect(post.body.length).toBeGreaterThan(0);
    },
  );

  it.each(BLOG_POSTS.map((p) => [p.slug, p] as const))(
    "%s has SEO-sane title and description lengths",
    (_slug, post) => {
      // Google truncates titles past ~60 chars and descriptions past ~160.
      // A little overflow is fine; these bounds catch real mistakes.
      expect(post.metaTitle.length).toBeGreaterThanOrEqual(20);
      expect(post.metaTitle.length).toBeLessThanOrEqual(75);
      expect(post.metaDescription.length).toBeGreaterThanOrEqual(70);
      expect(post.metaDescription.length).toBeLessThanOrEqual(200);
    },
  );

  it.each(BLOG_POSTS.map((p) => [p.slug, p] as const))(
    "%s links only to routes that exist",
    (_slug, post) => {
      const hrefs: string[] = [];

      for (const block of post.body) {
        if (block.type === "cta") hrefs.push(block.href);
        for (const text of blockStrings(block)) {
          for (const node of parseInline(text)) {
            if (node.type === "link") hrefs.push(node.href);
          }
        }
      }
      for (const related of post.relatedPaths ?? []) hrefs.push(related.href);

      const broken = hrefs
        .filter((href) => href.startsWith("/"))
        .filter((href) => !isKnownInternalPath(href));

      expect(broken).toEqual([]);
    },
  );

  it.each(BLOG_POSTS.map((p) => [p.slug, p] as const))(
    "%s references related slugs that exist and are not itself",
    (_slug, post) => {
      for (const slug of post.relatedSlugs ?? []) {
        expect(getBlogPost(slug), `unknown related slug: ${slug}`).toBeDefined();
        expect(slug).not.toBe(post.slug);
      }
    },
  );

  it.each(BLOG_POSTS.map((p) => [p.slug, p] as const))(
    "%s has a unique FAQ question set",
    (_slug, post) => {
      const questions = (post.faq ?? []).map((f) => f.question);
      expect(new Set(questions).size).toBe(questions.length);
    },
  );

  it.each(BLOG_POSTS.map((p) => [p.slug, p] as const))(
    "%s has at least one internal link for topical linking",
    (_slug, post) => {
      const hasCta = post.body.some((block) => block.type === "cta");
      const hasRelated = (post.relatedPaths ?? []).length > 0;
      expect(hasCta || hasRelated).toBe(true);
    },
  );
});

describe("relatedBlogPosts", () => {
  it("never returns the post itself and respects the limit", () => {
    for (const post of BLOG_POSTS) {
      const related = relatedBlogPosts(post, 3);
      expect(related.length).toBeLessThanOrEqual(3);
      expect(related.map((p) => p.slug)).not.toContain(post.slug);
      expect(new Set(related.map((p) => p.slug)).size).toBe(related.length);
    }
  });

  it("fills up to the limit when enough posts exist", () => {
    const post = BLOG_POSTS[0];
    expect(relatedBlogPosts(post, 3)).toHaveLength(3);
  });

  it("prefers explicitly related slugs", () => {
    const post = BLOG_POSTS.find((p) => (p.relatedSlugs ?? []).length > 0);
    expect(post).toBeDefined();
    if (!post) return;
    const related = relatedBlogPosts(post, 3).map((p) => p.slug);
    expect(related[0]).toBe(post.relatedSlugs?.[0]);
  });
});
