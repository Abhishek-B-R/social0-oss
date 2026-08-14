/**
 * Cloudflare Pages middleware for crawlers and SEO:
 * - 301 trailing slash → bare path
 * - inject title / description / canonical / OG / WebPage JSON-LD on known routes
 * - hard 404 for unknown public paths (stops soft-200 SPA duplicates)
 */

import routeMetaBundle from "./route-meta.generated.json";

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
  // App surfaces Google shouldn't index — still "known" so humans aren't 404'd
  if (
    path.startsWith("/auth") ||
    path.startsWith("/dashboard") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/oauth") ||
    path.startsWith("/invite") ||
    path.startsWith("/api") ||
    path.startsWith("/v1")
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
        sameAs: ["https://x.com/social0_app"],
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
  // Canonical always strips query (e.g. ?mode=agentic → /)
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

  // Leave API proxies and hashed static assets alone
  if (
    path.startsWith("/api") ||
    path.startsWith("/v1") ||
    /\.[a-z0-9]+$/i.test(path)
  ) {
    return context.next();
  }

  // Trailing slash → bare path (except "/")
  if (path.length > 1 && path.endsWith("/")) {
    const bare = path.slice(0, -1) + url.search;
    return Response.redirect(new URL(bare, url.origin).toString(), 301);
  }

  path = normalizePath(path);

  // Soft-404 killer: unknown paths must not return SPA 200
  if (!isKnownPublicPath(path)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const meta = resolveMeta(path);
  const response = await context.next();

  if (!meta) return response;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const patched = applyRouteMeta(html, path, meta);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=300");

  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
