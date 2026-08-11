/**
 * Cloudflare Pages middleware for crawlers:
 * - 301 trailing slash → bare path
 * - inject title / description / canonical / OG
 * - hard 404 for unknown public paths (stops soft-200 SPA duplicates)
 * Humans still get the SPA for known routes.
 */

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

const FEATURE_META: Record<string, RouteMeta> = {
  "threads-scheduler": {
    title: "Threads Scheduler - Schedule Meta Threads Posts | Social0",
    description:
      "Schedule Threads posts from one dashboard. Compose text, images, and videos, pick your Threads account, and publish or schedule with Social0.",
  },
  "bluesky-scheduling-tool": {
    title: "Bluesky Scheduling Tool | Social0",
    description:
      "Schedule Bluesky posts from Social0. Connect with an app password and publish alongside your other networks.",
  },
  "tiktok-scheduler": {
    title: "TikTok Scheduler | Social0",
    description:
      "Schedule TikTok posts from one dashboard with Social0 multi-platform publishing.",
  },
  "instagram-scheduler": {
    title: "Instagram Scheduler | Social0",
    description:
      "Schedule Instagram posts from Social0. Compose once and publish across your connected accounts.",
  },
  "linkedin-scheduler": {
    title: "LinkedIn Scheduler | Social0",
    description:
      "Schedule LinkedIn posts from Social0. Publish to profiles and pages from one composer.",
  },
  "twitter-scheduler": {
    title: "X (Twitter) Scheduler | Social0",
    description:
      "Schedule posts to X from Social0. Compose once and publish across nine platforms.",
  },
  "multi-platform-scheduler": {
    title: "Multi-Platform Social Scheduler | Social0",
    description:
      "One composer for X, Instagram, LinkedIn, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest.",
  },
  "social-media-calendar": {
    title: "Social Media Calendar | Social0",
    description:
      "Plan drafts, queued, and live posts across all accounts in one calendar.",
  },
  "youtube-scheduler": {
    title: "YouTube Scheduler | Social0",
    description:
      "Schedule YouTube uploads and posts from Social0 alongside your other networks.",
  },
  "pinterest-scheduler": {
    title: "Pinterest Scheduler | Social0",
    description:
      "Schedule Pinterest pins from Social0 multi-platform publishing.",
  },
  "facebook-scheduler": {
    title: "Facebook Scheduler | Social0",
    description:
      "Schedule Facebook Page posts from Social0 from one dashboard.",
  },
};

const ALTERNATIVE_META: Record<string, RouteMeta> = {
  buffer: {
    title: "Buffer Alternative - Social0 | Multi-Platform Scheduler",
    description:
      "Looking for a Buffer alternative? Social0 lets you compose once and publish to nine platforms from one dashboard.",
  },
  hootsuite: {
    title: "Hootsuite Alternative - Social0",
    description:
      "Looking for a Hootsuite alternative? Social0 is a simpler multi-platform scheduler with API, MCP, and CLI.",
  },
  later: {
    title: "Later Alternative - Social0",
    description:
      "Looking for a Later alternative? Schedule and publish across nine platforms from Social0.",
  },
  metricool: {
    title: "Metricool Alternative - Social0",
    description:
      "Looking for a Metricool alternative? Social0 focuses on clean multi-platform publishing.",
  },
  publer: {
    title: "Publer Alternative - Social0",
    description:
      "Looking for a Publer alternative? Compose once and publish everywhere with Social0.",
  },
  "sprout-social": {
    title: "Sprout Social Alternative - Social0",
    description:
      "Looking for a Sprout Social alternative? Social0 is built for creators who want simple multi-platform publishing.",
  },
};

const STATIC_META: Record<string, RouteMeta> = {
  "/": {
    title: "Social0 — AI Agents & Multi-Platform Social Scheduling",
    description:
      "Publish and schedule across 9 platforms from one dashboard — or let ChatGPT, Claude, and your agents ship via MCP, API, and CLI. Start free.",
  },
  "/pricing": {
    title: "Pricing — Social0",
    description:
      "Simple Social0 pricing. Start free, then upgrade to Starter, Growth, or Pro. Every plan includes REST API, MCP, and CLI.",
  },
  "/mcp": {
    title: "Social0 MCP Server — Manage social media from your AI",
    description:
      "Connect Claude, Cursor, or VS Code to Social0 with the official MCP server. Publish, schedule, and track posts across every platform from natural language.",
  },
  "/features": {
    title: "Social0 — Platform features",
    description:
      "Explore Social0 features for scheduling and publishing to X, Instagram, LinkedIn, TikTok, YouTube, Pinterest, Bluesky, Threads, and Facebook.",
  },
  "/alternatives": {
    title: "Social0 alternatives and comparisons",
    description:
      "Compare Social0 with Buffer, Hootsuite, Later, and other social media schedulers.",
  },
  "/refund": {
    title: "Refund & Cancellation Policy | Social0",
    description:
      "Social0 refund and cancellation policy. Subscriptions are non-refundable except where required by law. Cancel anytime from Billing.",
  },
  "/privacy": {
    title: "Privacy Policy | Social0",
    description:
      "Social0 privacy policy. Learn how we collect, use, and protect your data when you use our social media scheduling platform.",
  },
  "/terms": {
    title: "Terms of Service | Social0",
    description:
      "Read the Social0 terms of service. Understand your rights and responsibilities when using our social media scheduling and publishing platform.",
  },
  "/data-deletion": {
    title: "Data Deletion | Social0",
    description:
      "How to delete your Social0 account or request deletion of your account data.",
  },
  "/llms.txt": {
    title: "Social0 llms.txt",
    description: "Machine-readable product summary for AI systems.",
  },
  "/home": {
    title: "Social0 — AI Agents & Multi-Platform Social Scheduling",
    description:
      "Publish and schedule across 9 platforms from one dashboard — or let ChatGPT, Claude, and your agents ship via MCP, API, and CLI. Start free.",
    noindex: true,
  },
};

const BOT_UA =
  /bot|crawl|slurp|spider|facebookexternalhit|facebot|twitterbot|linkedinbot|discordbot|whatsapp|telegrambot|slackbot|embedly|pinterest|redditbot|applebot|bingpreview|googlebot|baiduspider|yandex|duckduckbot|ia_archiver|semrush|ahrefs|mj12bot|dotbot/i;

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
  const ua = context.request.headers.get("user-agent") ?? "";
  const isBot = BOT_UA.test(ua);

  // Soft-404 killer for crawlers on junk URLs
  if (isBot && !isKnownPublicPath(path)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const meta = resolveMeta(path);
  const response = await context.next();

  if (!meta || !isBot) return response;

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
