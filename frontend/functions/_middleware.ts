/**
 * Cloudflare Pages: inject path-specific title/OG for social scrapers.
 * Humans still get the SPA shell; bots get correct meta without waiting on JS.
 */

type RouteMeta = {
  title: string;
  description: string;
};

type PagesContext = {
  request: Request;
  next: () => Promise<Response>;
};

const OG_IMAGE = "https://social0.app/og-image.jpg";

const ROUTE_META: Record<string, RouteMeta> = {
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
  const url = `https://social0.app${path === "/" ? "/" : path}`;
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
  const path = normalizePath(url.pathname);

  // Leave API proxies and static build assets alone
  if (
    path.startsWith("/api") ||
    path.startsWith("/v1") ||
    /\.[a-z0-9]+$/i.test(path)
  ) {
    return context.next();
  }

  const meta = ROUTE_META[path];
  const ua = context.request.headers.get("user-agent") ?? "";

  const response = await context.next();

  if (!meta || !BOT_UA.test(ua)) return response;

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
