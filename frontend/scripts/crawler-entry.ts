/**
 * Bundled by scripts/generate-crawler-pages.mjs (esbuild) and run in Node at
 * build time. Renders every content route to plain HTML so search and AI
 * crawlers that don't run JavaScript read the same words people see.
 * Output: functions/crawler-pages.generated.json, used by functions/_middleware.ts.
 */
import { BLOG_POSTS } from "../src/lib/content/blog";
import type { BlogBlock, BlogPost } from "../src/lib/content/blog-types";
import { FEATURES, type FeaturePage } from "../src/lib/content/features";
import { TOOLS, type ToolPage } from "../src/lib/content/tools";
import { ALTERNATIVES } from "../src/lib/content/alternatives";
import { CATALOG_ALTERNATIVES } from "../src/lib/content/alternatives-catalog";
import type { AlternativePage } from "../src/lib/content/alternative-page-types";
import { parseInline, slugifyHeading, type InlineNode } from "../src/lib/rich-text";

const SITE = "https://social0.app";
const AUTHOR = "Abhishek BR";

export type Faq = { question: string; answer: string };
export type CrawlerPage = { html: string; faqs: Faq[] };

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absolute(href: string): string {
  return href.startsWith("/") ? `${SITE}${href}` : href;
}

/** Same inline subset the SPA renders: **bold**, `code`, [label](href). */
function inline(text: string): string {
  return parseInline(text)
    .map((node: InlineNode) => {
      switch (node.type) {
        case "strong":
          return `<strong>${esc(node.value)}</strong>`;
        case "code":
          return `<code>${esc(node.value)}</code>`;
        case "link":
          return `<a href="${esc(absolute(node.href))}">${esc(node.value)}</a>`;
        default:
          return esc(node.value);
      }
    })
    .join("");
}

function block(b: BlogBlock): string {
  switch (b.type) {
    case "paragraph":
      return `<p>${inline(b.text)}</p>`;
    case "heading":
      return `<h2 id="${esc(slugifyHeading(b.text))}">${inline(b.text)}</h2>`;
    case "subheading":
      return `<h3>${inline(b.text)}</h3>`;
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag}>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${tag}>`;
    }
    case "table": {
      const caption = b.caption ? `<caption>${inline(b.caption)}</caption>` : "";
      const head = `<thead><tr>${b.columns.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
      const body = `<tbody>${b.rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      return `<table>${caption}${head}${body}</table>`;
    }
    case "callout":
      return `<aside>${b.title ? `<strong>${inline(b.title)}</strong> ` : ""}${inline(b.text)}</aside>`;
    case "quote":
      return `<blockquote><p>${inline(b.text)}</p>${b.attribution ? `<cite>${esc(b.attribution)}</cite>` : ""}</blockquote>`;
    case "code":
      return `<pre><code>${esc(b.code)}</code></pre>`;
    case "cta":
      return `<p>${inline(b.text)} <a href="${esc(absolute(b.href))}">${esc(b.label)}</a></p>`;
  }
  return "";
}

function faqHtml(faqs: Faq[]): string {
  if (!faqs.length) return "";
  return `<h2 id="faq">Frequently asked questions</h2>${faqs
    .map((f) => `<h3>${inline(f.question)}</h3><p>${inline(f.answer)}</p>`)
    .join("")}`;
}

function article(inner: string): string {
  return `<article id="prerender">${inner}</article>`;
}

function blogPage(post: BlogPost): CrawlerPage {
  const updated = post.dateModified ?? post.datePublished;
  const related = (post.relatedPaths ?? [])
    .map((r) => `<li><a href="${esc(absolute(r.href))}">${esc(r.label)}</a></li>`)
    .join("");
  const html = article(
    `<h1>${esc(post.title)}</h1>` +
      `<p>By <a href="${SITE}/about">${AUTHOR}</a> · Published <time datetime="${post.datePublished}">${post.datePublished}</time>` +
      (updated !== post.datePublished ? ` · Updated <time datetime="${updated}">${updated}</time>` : "") +
      ` · ${post.readingMinutes} min read</p>` +
      `<p>${inline(post.excerpt)}</p>` +
      post.body.map(block).join("") +
      faqHtml(post.faq ?? []) +
      (related ? `<h2>Related</h2><ul>${related}</ul>` : "") +
      `<p><a href="${SITE}/blog">All guides</a> · <a href="${SITE}/">Social0</a> · <a href="${SITE}/pricing">Pricing</a></p>`,
  );
  return { html, faqs: post.faq ?? [] };
}

function steps(items: { step: number; title: string; description: string }[]): string {
  if (!items.length) return "";
  return `<h2>How it works</h2><ol>${items
    .map((s) => `<li><strong>${esc(s.title)}</strong>: ${inline(s.description)}</li>`)
    .join("")}</ol>`;
}

function benefits(title: string, items: { title: string; description: string }[]): string {
  if (!items.length) return "";
  return `<h2>${esc(title)}</h2>${items
    .map((b) => `<h3>${esc(b.title)}</h3><p>${inline(b.description)}</p>`)
    .join("")}`;
}

function featurePage(f: FeaturePage): CrawlerPage {
  const html = article(
    `<h1>${esc(f.heroHeadline)}</h1><p>${inline(f.heroSubheadline)}</p><p>${inline(f.intro)}</p>` +
      benefits("Why use Social0 for this", f.benefits) +
      benefits("Options before you publish", f.prePostOptions ?? []) +
      steps(f.howItWorks) +
      faqHtml(f.faq) +
      `<p><a href="${SITE}/pricing">Pricing</a> · <a href="${SITE}/features">All features</a> · <a href="${SITE}/">Social0</a></p>`,
  );
  return { html, faqs: f.faq };
}

function toolPage(t: ToolPage): CrawlerPage {
  const docs = t.docsHref ? ` · <a href="${esc(absolute(t.docsHref))}">Docs</a>` : "";
  const html = article(
    `<h1>${esc(t.heroHeadline)}</h1><p>${inline(t.heroSubheadline)}</p><p>${inline(t.intro)}</p>` +
      benefits("What you get", t.benefits) +
      steps(t.howItWorks) +
      faqHtml(t.faq) +
      `<p><a href="${SITE}/pricing">Pricing</a>${docs} · <a href="${SITE}/tools">All tools</a></p>`,
  );
  return { html, faqs: t.faq };
}

function alternativePage(a: AlternativePage): CrawlerPage {
  const rows = a.comparisonRows
    .map((r) => `<tr><td>${inline(r.feature)}</td><td>${inline(r.social0)}</td><td>${inline(r.competitor)}</td></tr>`)
    .join("");
  const table = rows
    ? `<table><thead><tr><th>Feature</th><th>Social0</th><th>${esc(a.competitorName)}</th></tr></thead><tbody>${rows}</tbody></table>`
    : "";
  const html = article(
    `<h1>${esc(a.heroHeadline)}</h1><p>${inline(a.heroSubheadline)}</p><p>${inline(a.intro)}</p>` +
      (a.whySwitch.length
        ? `<h2>Why people switch from ${esc(a.competitorName)}</h2><ul>${a.whySwitch.map((w) => `<li>${inline(w)}</li>`).join("")}</ul>`
        : "") +
      (table ? `<h2>Social0 vs ${esc(a.competitorName)}</h2>${table}` : "") +
      faqHtml(a.faq) +
      `<p><a href="${SITE}/pricing">Social0 pricing</a> · <a href="${SITE}/alternatives">All comparisons</a></p>`,
  );
  return { html, faqs: a.faq };
}

export function buildCrawlerPages(): Record<string, CrawlerPage> {
  const pages: Record<string, CrawlerPage> = {};
  for (const post of BLOG_POSTS) pages[`/blog/${post.slug}`] = blogPage(post);
  for (const f of FEATURES) pages[`/features/${f.slug}`] = featurePage(f);
  for (const t of TOOLS) pages[`/tools/${t.slug}`] = toolPage(t);
  const seen = new Set<string>();
  for (const a of [...ALTERNATIVES, ...CATALOG_ALTERNATIVES]) {
    if (seen.has(a.slug)) continue;
    seen.add(a.slug);
    pages[`/alternatives/${a.slug}`] = alternativePage(a);
  }
  return pages;
}
