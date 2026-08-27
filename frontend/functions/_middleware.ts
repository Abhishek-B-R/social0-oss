/**
 * Cloudflare Pages middleware for crawlers and SEO:
 * - 301 trailing slash -> bare path
 * - inject title / description / canonical / OG / WebPage JSON-LD on known routes
 * - hard 404 for unknown public paths (stops soft-200 SPA duplicates)
 */

import routeMetaBundle from "./route-meta.generated.json";
import {
  crawlerHtmlForMeta,
  injectCrawlerHtml,
  jsonResponse,
  markdownForPath,
  markdownResponse,
  AI_CATALOG,
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
  /** When set, emit noindex (app / utility URLs). */
  noindex?: boolean;
};

type PagesContext = {
  request: Request;
  next: () => Promise<Response>;
};

const OG_IMAGE = "https://social0.app/og-image.jpg";
const SITE = "https://social0.app";

const STATIC_META = routeMetaBundle.static as Record<string, RouteMeta>;
const FEATURE_META = routeMetaBundle.features as Record<string, RouteMeta>;
const ALTERNATIVE_META = routeMetaBundle.alternatives as Record<string, RouteMeta>;
const TOOL_META = routeMetaBundle.tools as Record<string, RouteMeta>;

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

  return null;
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
    path === "/developers" ||
    path.startsWith("/.well-known/")
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

function injectJsonLd(html: string, meta: RouteMeta, url: string, path: string): string {
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: meta.title,
    description: meta.description,
    url,
    isPartOf: {
      "@type": "WebSite",
      name: "Social0",
      url: SITE,
    },
  };

  const graph: object[] = [webPage];

  if (path === "/") {
    graph.push(
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Social0",
        url: SITE,
        logo: OG_IMAGE,
        sameAs: [
          "https://x.com/social0_app",
          "https://www.linkedin.com/company/social0/",
        ],
        email: "support@social0.app",
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
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free plan available; paid tiers for teams and bulk tools",
        },
      },
    );
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
  out = upsertMeta(out, "property", "og:image", OG_IMAGE);
  out = upsertMeta(out, "name", "twitter:title", meta.title);
  out = upsertMeta(out, "name", "twitter:description", meta.description);
  out = upsertMeta(out, "name", "twitter:image", OG_IMAGE);

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

export async function onRequest(context: PagesContext) {
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

  // Leave API proxies and hashed static assets alone
  if (
    path.startsWith("/api") ||
    path.startsWith("/v1") ||
    /\.(png|jpe?g|webp|gif|svg|ico|xml|txt|md|json|js|css|map|woff2?|ttf|mp4|webm|sh)$/i.test(
      path,
    )
  ) {
    return context.next();
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
    return markdownResponse(NOT_FOUND_MARKDOWN, 404);
  }

  if (prefersMarkdown(accept)) {
    const markdown = markdownForPath(path);
    if (markdown) return markdownResponse(markdown);
  }

  const meta = resolveMeta(path);
  const response = await context.next();

  if (!meta) return response;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const withMeta = applyRouteMeta(html, path, meta);
  const patched = injectCrawlerHtml(
    withMeta,
    crawlerHtmlForMeta(meta.title, meta.description, path),
  );
  const headers = withVaryAccept(new Headers(response.headers));
  headers.set("cache-control", "public, max-age=300");
  headers.set("Link", discoveryLinkHeader());

  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
