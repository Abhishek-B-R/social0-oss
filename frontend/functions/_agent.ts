/**
 * Agent/crawler helpers for Cloudflare Pages middleware.
 * Underscore prefix so this file is not published as a Pages Function route.
 */

export const SITE = "https://social0.app";

const PRODUCT_BLURB =
  "Social0 is a multi-platform social media scheduler for creators, founders, and AI agents. Compose once and publish or schedule to X (Twitter), LinkedIn, Instagram, TikTok, YouTube, Facebook Pages, Threads, Bluesky, and Pinterest from one dashboard - or automate the same pipeline with MCP, the REST API, and the social0 CLI. Start on the free plan; no credit card required.";

export const HOMEPAGE_MARKDOWN = `# Social0 - AI agents and multi-platform social scheduling

${PRODUCT_BLURB}

## When to use Social0

Use Social0 when you need to publish or schedule the same post to several networks, connect ChatGPT / Claude / Cursor to social accounts via MCP, or drive posting from a REST API or CLI. Social0 is a fit for Buffer / Later / Hootsuite alternatives, Threads and Bluesky scheduling, bulk image or video queues, and team social workflows.

Do not use Social0 for social listening, inbox management as a primary product, or analytics-only dashboards - those are out of scope.

## How agents should call Social0

1. Create an API key at ${SITE}/dashboard/api-keys (or connect the hosted MCP at https://mcp.social0.app with OAuth).
2. Connect social accounts at ${SITE}/dashboard/connections.
3. Publish with MCP tools (\`publish_now\`, \`schedule_content\`) or REST \`POST /v1/posts/publish\`.
4. Poll \`GET /v1/jobs/{tracking_id}\` until status is completed, failed, or partial.

## Developer resources

- Agent index: ${SITE}/llms.txt
- OpenAPI: https://api.social0.app/openapi.json
- REST docs: https://docs.social0.app/api
- MCP docs: ${SITE}/mcp
- CLI: ${SITE}/tools/cli
- Pricing: ${SITE}/pricing
- Sitemap: ${SITE}/sitemap.xml
`;

export const NOT_FOUND_MARKDOWN = `# Not found

This path does not exist on Social0.

Where to look next:

- Sitemap: ${SITE}/sitemap.xml
- Agent index (llms.txt): ${SITE}/llms.txt
- Agent instructions: ${SITE}/agent.txt
- Documentation: https://docs.social0.app
- REST API (OpenAPI): https://api.social0.app/openapi.json
- MCP server: https://mcp.social0.app
- Homepage: ${SITE}/
`;

const PAGE_MARKDOWN: Record<string, string> = {
  "/": HOMEPAGE_MARKDOWN,
  "/home": HOMEPAGE_MARKDOWN,
  "/pricing": `# Social0 pricing

Social0 has a free plan and paid tiers (Starter, Growth, Pro, Max). Every plan includes the dashboard, REST API, hosted MCP, and CLI.

See the full breakdown at ${SITE}/pricing.md or ${SITE}/pricing.

${PRODUCT_BLURB}
`,
  "/mcp": `# Social0 MCP server

Connect Claude, ChatGPT, Cursor, or any MCP host to Social0. Hosted endpoint: https://mcp.social0.app/mcp (OAuth). Local stdio package: \`npx -y @social0/mcp\` with \`SOCIAL0_API_KEY\`.

Tools cover listing accounts, drafts, publishing, scheduling, media upload, and job status.

Docs: https://docs.social0.app/mcp · Product page: ${SITE}/mcp

${PRODUCT_BLURB}
`,
  "/about": `# About Social0

${PRODUCT_BLURB}

Social0 is built by Abhishek (@abhitwt) as an independent product. We operate a remote-first software business. Support is handled by email at support@social0.app.

More: ${SITE}/about
`,
  "/contact": `# Contact Social0

Email support@social0.app for product help, legal@social0.app for legal requests, and privacy@social0.app for privacy requests. X/Twitter: https://x.com/social0_app

Include your account email, the platforms involved, and any tracking_id from a publish job.

${PRODUCT_BLURB}
`,
  "/developers": `# Social0 developer resources

Programmatic publishing for agents and apps:

- OpenAPI spec: https://api.social0.app/openapi.json
- REST docs: https://docs.social0.app/api
- Hosted MCP: https://mcp.social0.app
- npm MCP: @social0/mcp
- CLI: npm i -g social0
- API keys: ${SITE}/dashboard/api-keys
- Versioning policy: ${SITE}/api-versioning.md

${PRODUCT_BLURB}
`,
  "/features": `# Social0 features

Schedule and publish to X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest. Content types: text, image, video, threads, collections. Calendar, drafts, queue, bulk tools, auto-repost, auto-plug, teams.

Index: ${SITE}/features

${PRODUCT_BLURB}
`,
  "/tools": `# Social0 tools and integrations

API, MCP, CLI, webhooks, bulk image/video, calendar, queue, ChatGPT/Claude/Cursor connectors.

Index: ${SITE}/tools

${PRODUCT_BLURB}
`,
  "/alternatives": `# Social0 alternatives and comparisons

Compare Social0 with Buffer, Hootsuite, Later, Metricool, and 60+ other social schedulers.

Index: ${SITE}/alternatives

${PRODUCT_BLURB}
`,
  "/privacy": `# Social0 privacy policy

How Social0 collects, uses, and protects account and connected-platform data.

Full policy: ${SITE}/privacy

${PRODUCT_BLURB}
`,
  "/terms": `# Social0 terms of service

Terms for using the Social0 scheduling, API, MCP, and CLI products.

Full terms: ${SITE}/terms

${PRODUCT_BLURB}
`,
};

export function markdownForPath(path: string): string | null {
  if (PAGE_MARKDOWN[path]) return PAGE_MARKDOWN[path];
  if (path.startsWith("/features/")) {
    return `# Social0 feature\n\n${PRODUCT_BLURB}\n\nThis page: ${SITE}${path}\nAll features: ${SITE}/features\n`;
  }
  if (path.startsWith("/alternatives/")) {
    return `# Social0 alternative comparison\n\n${PRODUCT_BLURB}\n\nThis page: ${SITE}${path}\nAll comparisons: ${SITE}/alternatives\n`;
  }
  if (path.startsWith("/tools/")) {
    return `# Social0 tool\n\n${PRODUCT_BLURB}\n\nThis page: ${SITE}${path}\nAll tools: ${SITE}/tools\n`;
  }
  return null;
}

export function homepageCrawlerHtml(): string {
  return `<article id="prerender" style="max-width:48rem;margin:2rem auto;padding:0 1.25rem;font-family:system-ui,sans-serif;line-height:1.55;color:#111">
  <h1>Social0 - AI agents and multi-platform social scheduling</h1>
  <p>${escapeHtml(PRODUCT_BLURB)}</p>
  <h2>When to use Social0</h2>
  <p>Use Social0 when you need to publish or schedule one post to several networks, connect ChatGPT, Claude, or Cursor via MCP, or drive posting from a REST API or CLI. It is a fit for Buffer, Later, and Hootsuite alternatives, Threads and Bluesky scheduling, bulk image or video queues, and team social workflows.</p>
  <h2>How agents should call Social0</h2>
  <ol>
    <li>Create an API key at <a href="${SITE}/dashboard/api-keys">${SITE}/dashboard/api-keys</a> or connect the hosted MCP at <a href="https://mcp.social0.app">https://mcp.social0.app</a>.</li>
    <li>Connect social accounts at <a href="${SITE}/dashboard/connections">${SITE}/dashboard/connections</a>.</li>
    <li>Publish with MCP <code>publish_now</code> / <code>schedule_content</code> or REST <code>POST /v1/posts/publish</code>.</li>
    <li>Poll <code>GET /v1/jobs/{tracking_id}</code> until the job is completed, failed, or partial.</li>
  </ol>
  <p>Developer resources: <a href="${SITE}/llms.txt">llms.txt</a>, <a href="https://api.social0.app/openapi.json">OpenAPI</a>, <a href="https://docs.social0.app">docs</a>, <a href="${SITE}/mcp">MCP</a>, <a href="${SITE}/developers">developers</a>, <a href="${SITE}/pricing">pricing</a>, <a href="${SITE}/about">about</a>, <a href="${SITE}/contact">contact</a>.</p>
</article>`;
}

export function crawlerHtmlForMeta(title: string, description: string, path: string): string {
  if (path === "/" || path === "/home") return homepageCrawlerHtml();
  return `<article id="prerender" style="max-width:48rem;margin:2rem auto;padding:0 1.25rem;font-family:system-ui,sans-serif;line-height:1.55;color:#111">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <p>${escapeHtml(PRODUCT_BLURB)}</p>
  <p>Agent index: <a href="${SITE}/llms.txt">${SITE}/llms.txt</a>. Docs: <a href="https://docs.social0.app">https://docs.social0.app</a>. OpenAPI: <a href="https://api.social0.app/openapi.json">https://api.social0.app/openapi.json</a>.</p>
</article>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function prefersMarkdown(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false;
  const parts = acceptHeader.split(",").map((p) => p.trim().toLowerCase());
  let mdQ = -1;
  let htmlQ = -1;
  for (const part of parts) {
    const [typeRaw, ...params] = part.split(";").map((s) => s.trim());
    const type = typeRaw ?? "";
    const qParam = params.find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(q)) continue;
    if (type === "text/markdown" || type === "text/x-markdown") {
      mdQ = Math.max(mdQ, q);
    }
    if (type === "text/html" || type === "application/xhtml+xml") {
      htmlQ = Math.max(htmlQ, q);
    }
  }
  if (mdQ < 0) return false;
  if (htmlQ < 0) return true;
  return mdQ >= htmlQ;
}

export function withVaryAccept(headers: Headers): Headers {
  const existing = headers.get("vary");
  const tokens = new Set(
    (existing ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.toLowerCase()),
  );
  tokens.add("accept");
  tokens.add("accept-encoding");
  const ordered = ["Accept", "Accept-Encoding"].filter((name) =>
    tokens.has(name.toLowerCase()),
  );
  for (const token of tokens) {
    if (token !== "accept" && token !== "accept-encoding") {
      ordered.push(token);
    }
  }
  headers.set("Vary", ordered.join(", "));
  return headers;
}

export function markdownResponse(body: string, status = 200): Response {
  const headers = withVaryAccept(
    new Headers({
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300",
    }),
  );
  return new Response(body, { status, headers });
}

export function injectCrawlerHtml(html: string, article: string): string {
  if (html.includes('id="prerender"')) {
    return html.replace(
      /<article id="prerender"[\s\S]*?<\/article>/i,
      article,
    );
  }
  if (/<div id="root">/i.test(html)) {
    return html.replace(
      /<div id="root">[\s\S]*?<\/div>/i,
      `<div id="root">${article}</div>`,
    );
  }
  return html.replace(/<body([^>]*)>/i, `<body$1>\n${article}\n`);
}

export const WELL_KNOWN_MCP = {
  name: "Social0 MCP",
  description:
    "Publish and schedule to Instagram, TikTok, YouTube, X, LinkedIn, Facebook, Threads, Bluesky, and Pinterest from Claude, ChatGPT, Cursor, or any MCP host.",
  version: "0.4.0",
  serverUrl: "https://mcp.social0.app/mcp",
  documentation: "https://social0.app/mcp",
  transport: "streamable-http",
};

export const MCP_SERVER_CARD = {
  name: "Social0 MCP",
  description:
    "Publish and schedule to Instagram, TikTok, YouTube, X, LinkedIn, Facebook, Threads, Bluesky, and Pinterest from Claude, ChatGPT, Cursor, or any MCP host.",
  version: "0.4.0",
  serverUrl: "https://mcp.social0.app/mcp",
  documentationUrl: "https://docs.social0.app/mcp",
  tools: [
    { name: "list_accounts", description: "List connected social accounts." },
    { name: "create_draft", description: "Create an unpublished draft." },
    { name: "update_draft", description: "Update an unpublished draft or schedule." },
    { name: "delete_draft", description: "Delete an unpublished draft or schedule." },
    { name: "list_posts", description: "List drafts, scheduled, and published posts." },
    { name: "get_post", description: "Get a post and per-platform publication status." },
    { name: "publish_post", description: "Publish an existing draft immediately." },
    { name: "schedule_post", description: "Schedule an existing draft." },
    { name: "upload_media", description: "Upload image or video media." },
    { name: "publish_now", description: "Create and publish in one step." },
    { name: "schedule_content", description: "Create and schedule in one step." },
    { name: "get_publish_status", description: "Poll a publish job by tracking_id." },
    { name: "suggest_best_platforms", description: "Recommend platforms for a caption." },
  ],
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
