/**
 * Content model for the Social0 blog.
 *
 * Articles are authored as typed blocks rather than raw HTML or Markdown so the
 * renderer stays XSS-safe (no `dangerouslySetInnerHTML` on body copy) and so
 * every article is type-checked at build time. Inline emphasis, code, and links
 * are written with the tiny subset parsed by `@/lib/rich-text`.
 */

export type BlogBlock =
  | { type: "paragraph"; text: string }
  /** Rendered as <h2>. Gets an id so the table of contents can link to it. */
  | { type: "heading"; text: string }
  /** Rendered as <h3>. Not included in the table of contents. */
  | { type: "subheading"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "table"; caption?: string; columns: string[]; rows: string[][] }
  | { type: "callout"; title?: string; text: string }
  | { type: "quote"; text: string; attribution?: string }
  | { type: "code"; language?: string; code: string }
  /** Inline conversion block. `href` is an internal marketing path. */
  | { type: "cta"; text: string; href: string; label: string };

export type BlogFaq = { question: string; answer: string };

export type BlogPost = {
  slug: string;
  /** Primary keyword cluster this article targets. Used for the topic chip. */
  category: BlogCategory;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  /** <h1>. May differ from metaTitle, which carries the brand suffix. */
  title: string;
  /** Deck under the h1, also used as the card excerpt on the index. */
  excerpt: string;
  /** ISO date (YYYY-MM-DD). */
  datePublished: string;
  /** ISO date (YYYY-MM-DD). Defaults to datePublished when omitted. */
  dateModified?: string;
  /** Rounded reading time in minutes, shown in the byline and schema. */
  readingMinutes: number;
  body: BlogBlock[];
  faq?: BlogFaq[];
  /** Marketing pages this article should pass authority to. */
  relatedPaths?: { href: string; label: string }[];
  /** Other blog slugs to surface at the foot of the article. */
  relatedSlugs?: string[];
};

export const BLOG_CATEGORIES = [
  "Platform specs",
  "Strategy",
  "Engineering",
  "AI & automation",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
