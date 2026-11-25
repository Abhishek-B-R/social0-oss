/**
 * Cloudflare Pages middleware for crawlers and SEO:
 * - 301 trailing slash -> bare path
 * - inject title / description / canonical / OG / WebPage JSON-LD on known routes
 * - hard 404 for unknown public paths (stops soft-200 SPA duplicates)
 */

import routeMetaBundle from "./route-meta.generated.json";
import crawlerPagesBundle from "./crawler-pages.generated.json";
import landingPrerender from "./landing-prerender.generated.json";
import {
  crawlerHtmlForMeta,
  injectCrawlerHtml,
  jsonResponse,
  markdownForPath,
  markdownResponse,
  AI_CATALOG,
  blogMarkdown,
  API_CATALOG,
  discoveryLinkHeader,
  MCP_SERVER_CARD,
  NOT_FOUND_MARKDOWN,
  prefersMarkdown,
  WELL_KNOWN_MCP,
  withVaryAccept,
} from "./_agent";

type RouteMeta = {
  title: string;
  description: string;
  /** Static routes with an on-page FAQ (e.g. /mcp): rendered for crawlers + FAQPage schema. */
  faqs?: Faq[];
  /** When set, emit noindex (app / utility URLs). */
  noindex?: boolean;
  /** Blog posts: ISO dates from the post file. */
  datePublished?: string;
  dateModified?: string;
};

type Faq = { question: string; answer: string };

type PagesContext = {
  request: Request;
  next: () => Promise<Response>;
};

const OG_IMAGE = "https://social0.app/og-image.jpg";

/** Plan prices for schema.org. Mirrors src/lib/plan-pricing.ts and _agent.ts PRICING_ROWS; update together. */
const PLAN_OFFERS = [
  { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD", description: "3 connected accounts, 10 posts, API, MCP and CLI included, no card" },
  { "@type": "Offer", name: "Creator", price: "29.90", priceCurrency: "USD", description: "15 connected accounts, unlimited posts, API, MCP and CLI; $299 billed yearly" },
  { "@type": "Offer", name: "Agency", price: "59.90", priceCurrency: "USD", description: "59 connected accounts then $1 per extra account per month, unlimited posts, teams; $599 billed yearly" },
];
const SITE = "https://social0.app";

const STATIC_META = routeMetaBundle.static as Record<string, RouteMeta>;
const FEATURE_META = routeMetaBundle.features as Record<string, RouteMeta>;
const ALTERNATIVE_META = routeMetaBundle.alternatives as Record<string, RouteMeta>;
const TOOL_META = routeMetaBundle.tools as Record<string, RouteMeta>;
const BLOG_META = routeMetaBundle.blog as Record<string, RouteMeta>;
const HOME_FAQS = (routeMetaBundle as { homeFaqs?: Faq[] }).homeFaqs ?? [];
/** Full page bodies for blog/feature/tool/alternative routes (scripts/generate-crawler-pages.mjs). */
const CRAWLER_PAGES = crawlerPagesBundle as Record<string, { html: string; faqs: Faq[] }>;
/** Build time of the deployed site: the honest "last updated" for static pages. */
const SITE_UPDATED_AT = routeMetaBundle.generatedAt;

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname || "/";
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function resolveMeta(path: string): RouteMeta | null {
  if (STATIC_META[path]) return STATIC_META[path];

  const featureMatch = path.match(/^\/features\/([^/]+)$/);
  if (featureMatch) {
    return FEATURE_META[featureMatch[1]] ?? null;
  }

  const altMatch = path.match(/^\/alternatives\/([^/]+)$/);
  if (altMatch) {
    return ALTERNATIVE_META[altMatch[1]] ?? null;
  }

  const toolMatch = path.match(/^\/tools\/([^/]+)$/);
  if (toolMatch) {
    return TOOL_META[toolMatch[1]] ?? null;
  }

  const blogMatch = path.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    return BLOG_META[blogMatch[1]] ?? null;
  }

  return null;
}

/** True when the client names HTML in Accept (a browser) and does not prefer markdown. */
function acceptsHtml(acceptHeader: string | null): boolean {
  if (!acceptHeader || prefersMarkdown(acceptHeader)) return false;
  return acceptHeader.split(",").some((part) => {
    const [type, ...params] = part.split(";").map((s) => s.trim().toLowerCase());
    if (type !== "text/html" && type !== "application/xhtml+xml") return false;
    const q = params.find((p) => p.startsWith("q="));
    return !q || Number(q.slice(2)) > 0;
  });
}

function isKnownPublicPath(path: string): boolean {
  if (resolveMeta(path)) return true;
  // App surfaces Google shouldn't index - still "known" so humans aren't 404'd
  if (
    path.startsWith("/auth") ||
    path.startsWith("/dashboard") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/oauth") ||
    path.startsWith("/invite") ||
    path.startsWith("/api") ||
    path.startsWith("/v1") ||
    path === "/about" ||
    path === "/contact" ||
    path === "/developers"
  ) {
    return true;
  }
  return false;
}

function upsertMeta(
  html: string,
  attr: "name" | "property",
  key: string,
  content: string,
): string {
  const re = new RegExp(
    `<meta\\s+${attr}=["']${key}["']\\s+content=["'][^"']*["']\\s*/?>`,
    "i",
  );
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function pageDates(meta: RouteMeta): { datePublished?: string; dateModified: string } {
  return {
    ...(meta.datePublished ? { datePublished: meta.datePublished } : {}),
    dateModified: meta.dateModified ?? meta.datePublished ?? SITE_UPDATED_AT,
  };
}

function injectJsonLd(html: string, meta: RouteMeta, url: string, path: string): string {
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: meta.title,
    description: meta.description,
    url,
    inLanguage: "en",
    ...pageDates(meta),
    isPartOf: {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      name: "Social0",
      url: SITE,
    },
  };

  const graph: object[] = [webPage];

  if (/^\/blog\/[^/]+$/.test(path)) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: meta.title,
      description: meta.description,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      image: OG_IMAGE,
      inLanguage: "en",
      ...pageDates(meta),
      author: {
        "@type": "Person",
        name: "Abhishek BR",
        url: `${SITE}/about`,
        sameAs: ["https://github.com/Abhishek-B-R", "https://abhishekbr.com"],
      },
      publisher: {
        "@type": "Organization",
        name: "Social0",
        url: SITE,
        logo: { "@type": "ImageObject", url: OG_IMAGE },
      },
    });
  }

  const pageFaqs = CRAWLER_PAGES[path]?.faqs ?? meta.faqs ?? [];
  if (pageFaqs.length) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: pageFaqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer.replace(/\*\*|`|\[([^\]]+)\]\([^)]+\)/g, "$1") },
      })),
    });
  }

  if (path === "/pricing") {
    graph.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Social0",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE,
      offers: PLAN_OFFERS,
    });
  }

  if (path === "/") {
    graph.push(
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        name: "Social0",
        url: SITE,
        description: meta.description,
        inLanguage: "en",
        publisher: { "@type": "Organization", name: "Social0", url: SITE },
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Social0",
        url: SITE,
        logo: OG_IMAGE,
        sameAs: [
          "https://x.com/social0_app",
          "https://www.linkedin.com/company/social0/",
          "https://github.com/Abhishek-B-R/social0-cli",
          "https://www.npmjs.com/package/social0",
          "https://www.npmjs.com/package/@social0/mcp",
        ],
        email: "support@social0.app",
        founder: {
          "@type": "Person",
          name: "Abhishek BR",
          url: `${SITE}/about`,
          sameAs: ["https://github.com/Abhishek-B-R", "https://abhishekbr.com"],
        },
        contactPoint: {
          "@type": "ContactPoint",
          email: "support@social0.app",
          contactType: "customer support",
          url: `${SITE}/contact`,
        },
        address: {
          "@type": "PostalAddress",
          addressCountry: "IN",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Social0",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: SITE,
        description: meta.description,
        offers: PLAN_OFFERS,
      },
    );
    if (HOME_FAQS.length) {
      graph.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: HOME_FAQS.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      });
    }
  }

  const script = `<script type="application/ld+json">${JSON.stringify(graph.length === 1 ? graph[0] : graph).replace(/</g, "\\u003c")}</script>`;
  if (/<script type="application\/ld\+json"/i.test(html)) return html;
  return html.replace(/<\/head>/i, `  ${script}\n</head>`);
}

function applyRouteMeta(html: string, path: string, meta: RouteMeta): string {
  // Canonical always strips query (e.g. ?mode=agentic -> /)
  const canonicalPath = path === "/home" ? "/" : path;
  const url = `${SITE}${canonicalPath === "/" ? "/" : canonicalPath}`;

  let out = html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${escapeAttr(meta.title)}</title>`,
  );
  out = upsertMeta(out, "name", "description", meta.description);
  out = upsertMeta(out, "property", "og:title", meta.title);
  out = upsertMeta(out, "property", "og:description", meta.description);
  out = upsertMeta(out, "property", "og:url", url);
  out = upsertMeta(
    out,
    "property",
    "og:type",
    /^\/blog\/[^/]+$/.test(path) ? "article" : "website",
  );
  out = upsertMeta(out, "property", "og:image", OG_IMAGE);
  out = upsertMeta(out, "name", "twitter:title", meta.title);
  out = upsertMeta(out, "name", "twitter:description", meta.description);
  out = upsertMeta(out, "name", "twitter:image", OG_IMAGE);

  const dates = pageDates(meta);
  if (dates.datePublished) {
    out = upsertMeta(out, "property", "article:published_time", dates.datePublished);
  }
  out = upsertMeta(out, "property", "article:modified_time", dates.dateModified);

  if (meta.noindex) {
    out = upsertMeta(out, "name", "robots", "noindex, follow");
  }

  const canonicalRe =
    /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i;
  const canonical = `<link rel="canonical" href="${escapeAttr(url)}" />`;
  out = canonicalRe.test(out)
    ? out.replace(canonicalRe, canonical)
    : out.replace(/<\/head>/i, `  ${canonical}\n</head>`);

  out = injectJsonLd(out, meta, url, path);
  return out;
}

/**
 * Static files and /.well-known/* paths. Pages answers a missing file with the
 * SPA shell (200 text/html), so anything that isn't a real file becomes a 404.
 */
async function staticOr404(context: PagesContext, path: string): Promise<Response> {
  const response = await context.next();
  const isHtml = (response.headers.get("content-type") ?? "").includes("text/html");
  if (isHtml && !/\.html?$/i.test(path)) {
    return markdownResponse(NOT_FOUND_MARKDOWN, 404);
  }
  return response;
}

/** Only social0.app may be indexed; dev.social0.app and *.pages.dev previews get noindex. */
const PRODUCTION_HOST = "social0.app";

export async function onRequest(context: PagesContext) {
  const response = await handleRequest(context);
  if (new URL(context.request.url).hostname === PRODUCTION_HOST) return response;
  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  let path = url.pathname || "/";
  const accept = context.request.headers.get("accept");

  // Trailing slash -> bare path (except "/")
  if (path.length > 1 && path.endsWith("/")) {
    const bare = path.slice(0, -1) + url.search;
    return Response.redirect(new URL(bare, url.origin).toString(), 301);
  }

  path = normalizePath(path);

  if (path === "/.well-known/mcp" || path === "/.well-known/mcp/server-card") {
    return jsonResponse(
      path.endsWith("server-card") ? MCP_SERVER_CARD : WELL_KNOWN_MCP,
    );
  }
  if (path === "/.well-known/mcp/server-card.json") {
    return jsonResponse(MCP_SERVER_CARD);
  }
  if (path === "/.well-known/ai-catalog.json") {
    return jsonResponse(AI_CATALOG);
  }
  if (path === "/.well-known/api-catalog") {
    return jsonResponse(
      API_CATALOG,
      200,
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
    );
  }

  // Leave API proxies alone
  if (path.startsWith("/api") || path.startsWith("/v1") || path.startsWith("/tools-api/")) {
    return context.next();
  }

  // Static files and other /.well-known/* files: serve if real, else 404
  if (
    path.startsWith("/.well-known/") ||
    /\.(png|jpe?g|webp|gif|svg|ico|xml|txt|md|json|js|css|map|woff2?|ttf|mp4|webm|sh)$/i.test(
      path,
    )
  ) {
    return staticOr404(context, path);
  }

  const altSlugAliases: Record<string, string> = {
    "post-bridge": "postbridge",
    "postbridge": "postbridge",
  };
  const altRedirect = path.match(/^\/alternative-to-([^/]+)$/);
  if (altRedirect) {
    const slug = altSlugAliases[altRedirect[1]] ?? altRedirect[1];
    if (ALTERNATIVE_META[slug]) {
      return Response.redirect(
        new URL(`/alternatives/${slug}${url.search}`, url.origin).toString(),
        301,
      );
    }
  }

  const altCanonicalRedirect = path.match(/^\/alternatives\/([^/]+)$/);
  if (altCanonicalRedirect) {
    const slug = altSlugAliases[altCanonicalRedirect[1]] ?? altCanonicalRedirect[1];
    if (slug !== altCanonicalRedirect[1] && ALTERNATIVE_META[slug]) {
      return Response.redirect(
        new URL(`/alternatives/${slug}${url.search}`, url.origin).toString(),
        301,
      );
    }
  }

  /** Root paths competitors use for platform scheduler PSEO (-> /features/*). */
  const FEATURE_ROOT_ALIASES: Record<string, string> = {
    "social-media-scheduler": "multi-platform-scheduler",
    "bluesky-scheduler": "bluesky-scheduling-tool",
    "x-scheduler": "twitter-scheduler",
    "twitter-scheduler": "twitter-scheduler",
    "instagram-scheduler": "instagram-scheduler",
    "linkedin-scheduler": "linkedin-scheduler",
    "tiktok-scheduler": "tiktok-scheduler",
    "youtube-scheduler": "youtube-scheduler",
    "pinterest-scheduler": "pinterest-scheduler",
    "facebook-scheduler": "facebook-scheduler",
    "threads-scheduler": "threads-scheduler",
    "social-media-calendar": "social-media-calendar",
  };
  const rootMatch = path.match(/^\/([^/]+)$/);
  if (rootMatch) {
    const featureSlug = FEATURE_ROOT_ALIASES[rootMatch[1]];
    if (featureSlug && FEATURE_META[featureSlug]) {
      return Response.redirect(
        new URL(`/features/${featureSlug}${url.search}`, url.origin).toString(),
        301,
      );
    }
  }

  // Soft-404 killer: unknown paths must not return SPA 200
  if (!isKnownPublicPath(path)) {
    // React Router matches case-insensitively, so /Pricing is a real page in
    // the SPA: send it to the canonical lower-case URL instead of a 404.
    const lower = path.toLowerCase();
    if (lower !== path && isKnownPublicPath(lower)) {
      return Response.redirect(new URL(`${lower}${url.search}`, url.origin).toString(), 301);
    }
    // Browsers get the SPA shell (its NotFoundPage is noindex and links home)
    // with a real 404 status; agents and plain HTTP clients get markdown.
    if (acceptsHtml(accept)) {
      const shell = await context.next();
      if ((shell.headers.get("content-type") ?? "").includes("text/html")) {
        const headers = withVaryAccept(new Headers(shell.headers));
        headers.set("x-robots-tag", "noindex");
        return new Response(shell.body, { status: 404, statusText: "Not Found", headers });
      }
    }
    return markdownResponse(NOT_FOUND_MARKDOWN, 404);
  }

  const meta = resolveMeta(path);

  if (prefersMarkdown(accept)) {
    const markdown =
      meta && /^\/blog\/[^/]+$/.test(path)
        ? blogMarkdown(path, meta)
        : markdownForPath(path);
    if (markdown) return markdownResponse(markdown);
  }

  const response = await context.next();

  if (!meta) return response;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const withMeta = applyRouteMeta(html, path, meta);
  const patched = injectCrawlerHtml(
    withMeta,
    CRAWLER_PAGES[path]?.html ??
      crawlerHtmlForMeta(meta.title, meta.description, path, {
        updated: pageDates(meta).dateModified,
        faqs: path === "/" || path === "/home" ? HOME_FAQS : (meta.faqs ?? []),
      }),
  );
  // "/" ships the build-time render of the landing page so the hero paints
  // before the JS bundle loads (scripts/prerender-landing.mjs).
  // Its ~1,600 words replace the shorter crawler article, so bots and people
  // get the same page and there is a single <h1>.
  const landingHtml = (landingPrerender as { html: string }).html;
  const body =
    path === "/" && landingHtml
      ? injectCrawlerHtml(withMeta, landingHtml).replace(
          '<div id="root">',
          '<div id="root" data-ssr="landing">',
        )
      : patched;
  const headers = withVaryAccept(new Headers(response.headers));
  headers.set("cache-control", "public, max-age=300");
  headers.set("Link", discoveryLinkHeader());
  // The SPA renders its own robots meta after load; the header is what counts.
  if (meta.noindex) headers.set("x-robots-tag", "noindex, follow");

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
