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
- REST docs: https://docs.social0.app/docs/api
- MCP docs: ${SITE}/mcp
- CLI: ${SITE}/tools/cli
- Pricing: ${SITE}/pricing
- Sitemap: ${SITE}/sitemap.xml
`;

/**
 * Plan prices for crawlers and agents. Mirrors `src/lib/plan-pricing.ts` and
 * `public/pricing.md` (Pages Functions build apart from the SPA, so the numbers
 * are repeated here). Update all three together.
 */
const PRICING_UPDATED = "2026-11";
const PRICING_ROWS = [
  { plan: "Free", monthly: "$0", yearly: "$0", accounts: "3 (10 lifetime posts)", api: "60" },
  { plan: "Creator", monthly: "$29.90", yearly: "$299", accounts: "15", api: "1,000" },
  {
    plan: "Agency",
    monthly: "$59.90 + $1 per account above 59",
    yearly: "$599 + $10 per account above 59",
    accounts: "59 included, no cap",
    api: "5,000",
  },
] as const;

const PRICING_MARKDOWN = `# Social0 pricing

Updated: ${PRICING_UPDATED}. Two paid plans priced by connected social accounts; each connected profile counts once. Yearly is 10x monthly (2 months free). Every plan posts to all 9 networks with unlimited posts, the REST API, MCP and CLI.

| Plan | Monthly | Yearly | Connected accounts | API requests / hour |
| --- | ---: | ---: | ---: | ---: |
${PRICING_ROWS.map((r) => `| ${r.plan} | ${r.monthly} | ${r.yearly} | ${r.accounts} | ${r.api} |`).join("\n")}

Agency never blocks a connect: each account over 59 is added to the bill automatically ($1/mo, $10/yr on yearly), and disconnecting one lowers the next bill. Creator and Agency both include bulk image and video tools, auto-repost, auto-plug, webhooks and multiple workspaces. Agency adds teammates and shared workspaces. Starter, Growth, Pro and Max are closed to new customers; existing subscribers keep them.

Full breakdown: ${SITE}/pricing.md · Page: ${SITE}/pricing

${PRODUCT_BLURB}
`;

export function pricingCrawlerHtml(): string {
  const rows = PRICING_ROWS.map(
    (r) =>
      `<tr><th scope="row">${escapeHtml(r.plan)}</th><td>${escapeHtml(r.monthly)}</td><td>${escapeHtml(r.yearly)}</td><td>${escapeHtml(r.accounts)}</td><td>${escapeHtml(r.api)}</td></tr>`,
  ).join("\n      ");
  return `<article id="prerender">
  <h1>Social0 pricing</h1>
  <p>Updated ${PRICING_UPDATED}. One price per account. Two plans. Every plan posts to X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky and Pinterest, with unlimited posts, the API, MCP and CLI. Yearly billing is 2 months free.</p>
  <table>
    <thead><tr><th>Plan</th><th>Monthly</th><th>Yearly</th><th>Connected accounts</th><th>API requests / hour</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p>Agency price = $59.90 + $1 for each account above 59 per month (x10 yearly), with no cap. Agency never blocks a connect: each account over 59 is added to the bill automatically, and disconnecting one lowers the next bill. Creator and Agency both include bulk image and video tools, auto-repost, auto-plug, webhooks and multiple workspaces; Agency adds teammates and shared workspaces.</p>
  <p>Start free with 3 accounts and 10 posts, no card needed. Markdown: <a href="${SITE}/pricing.md">${SITE}/pricing.md</a>.</p>
</article>`;
}

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
  "/pricing": PRICING_MARKDOWN,
  "/mcp": `# Social0 MCP server

Connect Claude, ChatGPT, Cursor, or any MCP host to Social0. Hosted endpoint: https://mcp.social0.app/mcp (OAuth). Local stdio package: \`npx -y @social0/mcp\` with \`SOCIAL0_API_KEY\`.

Tools cover listing accounts, drafts, publishing, scheduling, media upload, and job status.

Docs: https://docs.social0.app/docs/integrations/mcp · Product page: ${SITE}/mcp

${PRODUCT_BLURB}
`,
  "/about": `# About Social0

Social0 is a social media scheduler with a REST API, MCP server and CLI that lets creators, agencies and AI agents publish one post to nine networks from one place.

${PRODUCT_BLURB}

Social0 is built and run by Abhishek BR, an independent developer in India (GitHub: https://github.com/Abhishek-B-R, site: https://abhishekbr.com). Priced per connected account with unlimited posts on paid plans; API, MCP and CLI on every plan. Support: support@social0.app.

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
- REST docs: https://docs.social0.app/docs/api
- Hosted MCP: https://mcp.social0.app
- npm MCP: @social0/mcp
- CLI: npm i -g social0
- API keys: ${SITE}/dashboard/api-keys
- Auth docs: ${SITE}/auth.md
- Versioning policy: ${SITE}/api-versioning.md
- AI catalog: ${SITE}/.well-known/ai-catalog.json
- API catalog: ${SITE}/.well-known/api-catalog

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

/** Blog markdown carries the post's real title and description (from route meta). */
export function blogMarkdown(
  path: string,
  meta: { title: string; description: string },
): string {
  return `# ${meta.title}\n\n${meta.description}\n\nRead the full guide: ${SITE}${path}\nAll guides: ${SITE}/blog\n\n---\n\n${PRODUCT_BLURB}\n`;
}

type CrawlerFaq = { question: string; answer: string };
type CrawlerOpts = { updated?: string; faqs?: CrawlerFaq[] };

function updatedLine(updated?: string): string {
  if (!updated) return "";
  const day = updated.slice(0, 10);
  return `<p>By <a href="${SITE}/about">Social0</a> · Updated <time datetime="${escapeHtml(updated)}">${escapeHtml(day)}</time></p>`;
}

function faqHtml(faqs: CrawlerFaq[] = []): string {
  if (!faqs.length) return "";
  const items = faqs
    .map((f) => `  <h3>${escapeHtml(f.question)}</h3>\n  <p>${escapeHtml(f.answer)}</p>`)
    .join("\n");
  return `\n  <h2 id="faq">Frequently asked questions</h2>\n${items}`;
}

export function homepageCrawlerHtml(opts: CrawlerOpts = {}): string {
  return `<article id="prerender">
  <h1>Social0 - AI agents and multi-platform social scheduling</h1>
  ${updatedLine(opts.updated)}
  <p>${escapeHtml(PRODUCT_BLURB)}</p>
  <h2>What Social0 does</h2>
  <p>Social0 publishes one post to up to 9 social networks in parallel: X (Twitter), LinkedIn, Instagram, TikTok, YouTube, Facebook Pages, Threads, Bluesky, and Pinterest. Every post goes out through each platform's official API, and you see which networks succeeded and which failed, per account.</p>
  <h3>Compose once, publish everywhere</h3>
  <p>Write text, images, videos, threads, or carousels in one composer. Publish now or schedule on a calendar with drafts and queue slots. Bulk tools schedule whole folders of images or videos, and auto-repost and auto-plug keep good posts working after they go live.</p>
  <h3>Built for AI agents</h3>
  <p>The same publishing pipeline is open to software. Remote assistants such as ChatGPT and Claude connect to the hosted <a href="https://modelcontextprotocol.io">Model Context Protocol</a> server at mcp.social0.app over OAuth. Agents with a terminal use the <code>social0</code> CLI from npm. Developers call the REST API at api.social0.app/v1, described by an <a href="https://www.openapis.org">OpenAPI</a> spec, and receive post.published and post.failed webhooks.</p>
  <h3>Teams and analytics</h3>
  <p>Workspaces keep separate brands and clients apart, teammates get admin, member, community, or analyst roles, and analytics plus a unified inbox cover the posts you published through Social0.</p>
  <h2>Pricing</h2>
  <p>Free: 3 connected accounts and 10 posts, no credit card. Creator: $29.90 a month or $299 a year for 15 accounts. Agency: $59.90 a month or $599 a year for 59 accounts, then $1 a month per extra account. The API, MCP server, and CLI are included on every plan. Details: <a href="${SITE}/pricing">pricing</a>.</p>
  <h2>When to use Social0</h2>
  <p>Use Social0 when you need to publish or schedule one post to several networks, connect ChatGPT, Claude, or Cursor via MCP, or drive posting from a REST API or CLI. It fits creators, founders, agencies, and developers building AI agents that post on their behalf.</p>${faqHtml(opts.faqs)}
  <h2>Resources</h2>
  <p><a href="${SITE}/llms.txt">llms.txt</a>, <a href="https://api.social0.app/openapi.json">OpenAPI</a>, <a href="https://docs.social0.app">docs</a>, <a href="${SITE}/mcp">MCP</a>, <a href="${SITE}/developers">developers</a>, <a href="${SITE}/blog">blog</a>, <a href="${SITE}/feed.xml">RSS</a>, <a href="${SITE}/about">about</a>, <a href="${SITE}/contact">contact</a>, <a href="https://x.com/social0_app">X</a>, <a href="https://www.linkedin.com/company/social0/">LinkedIn</a>.</p>
</article>`;
}

/** /mcp for crawlers: the page's facts, including the "schedule posts with MCP" steps people search for. */
export function mcpCrawlerHtml(opts: CrawlerOpts = {}): string {
  return `<article id="prerender">
  <h1>The social media MCP server for Claude, ChatGPT and Cursor</h1>
  ${updatedLine(opts.updated)}
  <p>Social0's official Model Context Protocol server lets AI assistants schedule and publish social media posts. Add <code>https://mcp.social0.app/mcp</code> in ChatGPT, Claude or Cursor, sign in with Social0 (OAuth, no API key), and post to X (Twitter), LinkedIn, Instagram, TikTok, YouTube, Facebook Pages, Threads, Bluesky and Pinterest from chat.</p>
  <h2>How to schedule social media posts with MCP</h2>
  <ol>
    <li><strong>Connect your accounts</strong> in the Social0 dashboard. MCP publishes to accounts you have already connected.</li>
    <li><strong>Add Social0 to your AI.</strong> ChatGPT or Claude: paste https://mcp.social0.app/mcp and authorize. Cursor: add an http MCP server with that URL. VS Code and other local hosts: <code>npx -y @social0/mcp</code> with SOCIAL0_API_KEY. OpenClaw: <code>openclaw skills install @abhishek-b-r/social0</code>.</li>
    <li><strong>Ask in plain words</strong>, for example "Schedule this for tomorrow 9 AM on LinkedIn and X". The assistant converts the time to UTC and calls schedule_post.</li>
  </ol>
  <h2>What the MCP server can do</h2>
  <ul>
    <li>Publish now or schedule to every connected platform in parallel, with per-platform status (queued, uploading, success, failed).</li>
    <li>Upload media from a public URL, base64 data or a local file path.</li>
    <li>Create, update and delete drafts; list and read posts.</li>
    <li>Suggest which platforms fit a caption and media.</li>
  </ul>
  <p>Tools: list_accounts, create_draft, update_draft, delete_draft, publish_post, publish_now, schedule_post, schedule_content, upload_media, get_publish_status, list_posts, get_post, suggest_best_platforms.</p>${faqHtml(opts.faqs)}
  <p>MCP, the REST API and the CLI are on every plan, including Free. <a href="${SITE}/pricing">Pricing</a> · <a href="https://docs.social0.app/docs/integrations/mcp">MCP docs</a> · <a href="${SITE}/developers">Developers</a> · <a href="${SITE}/">Social0</a></p>
</article>`;
}

export function aboutCrawlerHtml(opts: CrawlerOpts = {}): string {
  return `<article id="prerender">
  <h1>About Social0</h1>
  ${updatedLine(opts.updated)}
  <p>Social0 is a social media scheduler with a REST API, MCP server and CLI that lets creators, agencies and AI agents publish one post to nine networks from one place: X (Twitter), LinkedIn, Instagram, TikTok, YouTube, Facebook Pages, Threads, Bluesky and Pinterest.</p>
  <h2>What makes Social0 different</h2>
  <ul>
    <li>Priced by connected accounts with unlimited posts on paid plans: Creator $29.90/month for 15 accounts; Agency $59.90/month for 59 accounts plus $1 per extra account.</li>
    <li>The REST API, hosted MCP server and CLI are on every plan, including Free (3 accounts, 10 posts, no card).</li>
    <li>One post goes out to every selected network in parallel, with per-network, per-account success or failure.</li>
  </ul>
  <h2>Who uses Social0</h2>
  <p>Creators and founders who post the same thing everywhere, agencies managing many client accounts, and developers whose AI agents need a real publishing API.</p>
  <h2>Who builds Social0</h2>
  <p>Social0 is built and run by Abhishek BR, an independent developer in India who writes the code, answers support and ships updates himself. <a href="https://github.com/Abhishek-B-R">GitHub</a> · <a href="https://abhishekbr.com">abhishekbr.com</a> · support@social0.app</p>
  <p><a href="${SITE}/pricing">Pricing</a> · <a href="${SITE}/mcp">MCP server</a> · <a href="${SITE}/developers">Developers</a> · <a href="${SITE}/">Social0</a></p>
</article>`;
}

export function crawlerHtmlForMeta(
  title: string,
  description: string,
  path: string,
  opts: CrawlerOpts = {},
): string {
  if (path === "/" || path === "/home") return homepageCrawlerHtml(opts);
  if (path === "/pricing") return pricingCrawlerHtml();
  if (path === "/mcp") return mcpCrawlerHtml(opts);
  if (path === "/about") return aboutCrawlerHtml(opts);
  return `<article id="prerender">
  <h1>${escapeHtml(title)}</h1>
  ${updatedLine(opts.updated)}
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

/**
 * Replace/inject the crawler prerender noscript without spanning other
 * <noscript> blocks (e.g. font fallback in <head>). A greedy cross-block
 * match previously wiped </head>, Vite assets, and #root -> blank white page.
 */
const PRERENDER_NOSCRIPT_RE =
  /<noscript>(?:(?!<\/noscript>)[\s\S])*?\bid=["']prerender["'](?:(?!<\/noscript>)[\s\S])*?<\/noscript>/i;

/**
 * Put the crawler article inside #root so HTML-only readers (search and AI
 * crawlers) see real content. Humans never see it: index.html adds a `js`
 * class in <head> that hides #prerender, and createRoot() replaces #root's
 * children on mount. <noscript> copies are dropped (most parsers skip them).
 */
export function injectCrawlerHtml(html: string, article: string): string {
  let out = html.replace(PRERENDER_NOSCRIPT_RE, "");
  out = out.replace(
    /<div id="root">\s*<article\s[^>]*id="prerender"[\s\S]*?<\/article>\s*<\/div>/i,
    `<div id="root"></div>`,
  );
  if (/<div id="root">\s*<\/div>/i.test(out)) {
    return out.replace(/<div id="root">\s*<\/div>/i, `<div id="root">${article}</div>`);
  }
  return out.replace(/<\/body>/i, `    ${article}\n  </body>`);
}

export const WELL_KNOWN_MCP = {
  name: "Social0 MCP",
  description:
    "Publish and schedule to Instagram, TikTok, YouTube, X, LinkedIn, Facebook, Threads, Bluesky, and Pinterest from Claude, ChatGPT, Cursor, or any MCP host.",
  version: "0.4.2",
  serverUrl: "https://mcp.social0.app/mcp",
  documentation: "https://social0.app/mcp",
  transport: "streamable-http",
  icon: "https://social0.app/logo.png",
};

export const MCP_SERVER_CARD = {
  name: "Social0 MCP",
  description:
    "Publish and schedule to Instagram, TikTok, YouTube, X, LinkedIn, Facebook, Threads, Bluesky, and Pinterest from Claude, ChatGPT, Cursor, or any MCP host.",
  version: "0.4.2",
  serverUrl: "https://mcp.social0.app/mcp",
  documentationUrl: "https://docs.social0.app/docs/integrations/mcp",
  icon: "https://social0.app/logo.png",
  icons: [
    {
      src: "https://social0.app/logo.png",
      mimeType: "image/png",
      sizes: ["any"],
    },
  ],
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

export const AI_CATALOG = {
  specVersion: "1.0",
  host: {
    displayName: "Social0",
    identifier: "did:web:social0.app",
  },
  entries: [
    {
      identifier: "urn:air:social0.app:mcp:social0",
      displayName: "Social0 MCP server",
      type: "application/mcp-server-card+json",
      url: "https://social0.app/.well-known/mcp/server-card.json",
    },
    {
      identifier: "urn:air:social0.app:api:openapi",
      displayName: "Social0 REST API OpenAPI spec",
      type: "application/openapi+json",
      url: "https://api.social0.app/openapi.json",
    },
    {
      identifier: "urn:air:social0.app:docs:developers",
      displayName: "Social0 developer resources",
      type: "text/html",
      url: "https://social0.app/developers",
    },
    {
      identifier: "urn:air:social0.app:docs:auth",
      displayName: "Social0 API authentication",
      type: "text/markdown",
      url: "https://social0.app/auth.md",
    },
    {
      identifier: "urn:air:social0.app:docs:webhooks",
      displayName: "Social0 webhooks",
      type: "text/html",
      url: "https://social0.app/tools/webhooks",
    },
    {
      identifier: "urn:air:social0.app:skill:social0",
      displayName: "Social0 agent skill",
      type: "text/markdown",
      url: "https://social0.app/.well-known/agent-skills/index.json",
    },
  ],
};

export const API_CATALOG = {
  linkset: [
    {
      anchor: "https://api.social0.app/",
      "service-desc": [
        { href: "https://api.social0.app/openapi.json", type: "application/json" },
        { href: "https://social0.app/openapi.json", type: "application/json" },
      ],
      "service-doc": [
        { href: "https://docs.social0.app/docs/api", type: "text/html" },
        { href: "https://social0.app/developers", type: "text/html" },
        { href: "https://social0.app/auth.md", type: "text/markdown" },
      ],
      status: [{ href: "https://api.social0.app/health", type: "application/json" }],
    },
    {
      anchor: "https://mcp.social0.app/mcp",
      "service-desc": [
        {
          href: "https://social0.app/.well-known/mcp/server-card.json",
          type: "application/json",
        },
      ],
      "service-doc": [
        { href: "https://social0.app/mcp", type: "text/html" },
        { href: "https://docs.social0.app/docs/integrations/mcp", type: "text/html" },
      ],
    },
  ],
};

export function discoveryLinkHeader(): string {
  return [
    `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"; profile="https://www.rfc-editor.org/info/rfc9727"`,
    `</.well-known/ai-catalog.json>; rel="describedby"; type="application/json"`,
    `</llms.txt>; rel="describedby"; type="text/plain"`,
    `<https://api.social0.app/openapi.json>; rel="service-desc"; type="application/json"`,
    `</auth.md>; rel="describedby"; type="text/markdown"`,
    `</developers>; rel="service-doc"; type="text/html"`,
  ].join(", ");
}

export function jsonResponse(
  body: unknown,
  status = 200,
  contentType = "application/json; charset=utf-8",
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=300",
    },
  });
}
