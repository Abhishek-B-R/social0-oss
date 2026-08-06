import { useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PlatformStrip } from "@/components/landing/PlatformStrip";
import { SeoHead } from "@/components/seo/SeoHead";
import { Button } from "@/components/ui/button";
import {
  DOCS_CLI_QUICKSTART_URL,
  DOCS_CONNECTIONS_URL,
  DOCS_MCP_QUICKSTART_URL,
  DOCS_MCP_URL,
} from "@/lib/docs-url";
import { absoluteUrl } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Bot,
  Calendar,
  Check,
  Copy,
  Layers,
  LineChart,
  MessageSquare,
  Sparkles,
  Terminal,
  Upload,
  Zap,
} from "lucide-react";

type HostId =
  | "chatgpt"
  | "claude"
  | "cursor"
  | "claude-desktop"
  | "vscode"
  | "openclaw"
  | "hermes";

const HOSTED_MCP_URL = "https://mcp.social0.app/mcp";
const OPENCLAW_SKILL_INSTALL = "openclaw skills install @abhishek-b-r/social0";
const SKILLS_CLI_INSTALL = "npx skills add abhishek-b-r/social0-cli";

const MCP_TOOLS = [
  "list_accounts",
  "create_draft",
  "update_draft",
  "delete_draft",
  "publish_post",
  "publish_now",
  "schedule_post",
  "schedule_content",
  "upload_media",
  "get_publish_status",
  "list_posts",
  "get_post",
  "suggest_best_platforms",
] as const;

const FEATURES = [
  {
    icon: Zap,
    title: "Publish from chat",
    description:
      "Draft, schedule, or publish to every connected platform without opening the dashboard.",
  },
  {
    icon: Layers,
    title: "Multi-platform fan-out",
    description:
      "One prompt fans out to LinkedIn, X, YouTube, and more in parallel. Poll status until done.",
  },
  {
    icon: Upload,
    title: "Media upload",
    description:
      "Pass a public URL, base64 data, or a local file path. Social0 handles presign, upload, and attach.",
  },
  {
    icon: Calendar,
    title: "Schedule in natural language",
    description:
      '"Post tomorrow at 9 AM on LinkedIn and X" — your assistant converts timezones to UTC.',
  },
  {
    icon: LineChart,
    title: "Track publish progress",
    description:
      "get_publish_status returns per-platform phases: queued, uploading, success, or failed.",
  },
  {
    icon: Sparkles,
    title: "Platform suggestions",
    description:
      "suggest_best_platforms recommends where your caption and media fit best.",
  },
] as const;

const FAQ = [
  {
    q: "What is MCP?",
    a: "Model Context Protocol is an open standard that lets AI assistants call tools on your behalf. Social0's MCP server exposes posting, scheduling, and account tools to Claude, Cursor, VS Code, and other hosts.",
  },
  {
    q: "Do I need an API key?",
    a: "Not for ChatGPT / Claude.ai remote connectors — use https://mcp.social0.app/mcp and sign in with Social0 OAuth. OpenClaw / Hermes: install the skill, then social0 login. Cursor / Claude Desktop / VS Code still use npx with a sk_live_ API key.",
  },
  {
    q: "Do I need a separate Social0 plan?",
    a: "No. MCP uses your existing account and the same posting limits as the dashboard.",
  },
  {
    q: "Can MCP connect my Instagram or Facebook?",
    a: "Not directly. Connect platforms in the dashboard first, then MCP can publish to those accounts.",
  },
  {
    q: "Is my API key / OAuth safe?",
    a: "Remote MCP uses OAuth and creates a dedicated connector API key you can revoke in Dashboard → API keys. Local npx configs keep your key in the AI host env and send it only to api.social0.app.",
  },
  {
    q: "What if one platform fails?",
    a: "Multi-platform jobs can finish as partial — some platforms succeed, others fail. Check get_publish_status errors and retry from the dashboard if needed.",
  },
] as const;

const sectionEyebrow =
  "mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground";
const sectionTitle =
  "font-sans text-[clamp(28px,4vw,40px)] font-bold leading-tight tracking-tight text-foreground dark:text-white";
const cardShell =
  "rounded-2xl border border-border bg-card dark:border-white/10 dark:bg-[#1A1A1A]";
const ctaPrimary =
  "inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-emerald-500 px-6 py-3.5 text-[15px] font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:w-auto active:scale-[0.98]";
const ctaSecondary =
  "inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-background px-6 py-3.5 text-[15px] font-medium text-foreground transition-colors hover:bg-muted sm:w-auto dark:border-white/10 dark:bg-[#151515] dark:hover:bg-white/5";

function buildMcpConfig(host: HostId, apiKey: string) {
  if (host === "chatgpt" || host === "claude") return HOSTED_MCP_URL;
  if (host === "openclaw") {
    return [OPENCLAW_SKILL_INSTALL, "social0 login"].join("\n");
  }
  if (host === "hermes") {
    return [SKILLS_CLI_INSTALL, "npm install -g social0", "social0 login"].join("\n");
  }

  const key = apiKey.trim() || "sk_live_your_key_here";
  const env = { SOCIAL0_API_KEY: key };

  if (host === "vscode") {
    return JSON.stringify(
      {
        servers: {
          social0: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@social0/mcp"],
            env,
          },
        },
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      mcpServers: {
        social0: {
          command: "npx",
          args: ["-y", "@social0/mcp"],
          env,
        },
      },
    },
    null,
    2,
  );
}

function McpConfigPanel() {
  const [host, setHost] = useState<HostId>("chatgpt");
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);

  const config = useMemo(() => buildMcpConfig(host, apiKey), [host, apiKey]);
  const isRemote = host === "chatgpt" || host === "claude";
  const isSkill = host === "openclaw" || host === "hermes";
  const needsApiKey = !isRemote && !isSkill;

  const copyConfig = () => {
    void navigator.clipboard.writeText(config);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const hosts: { id: HostId; label: string; hint: string }[] = [
    {
      id: "chatgpt",
      label: "ChatGPT (web)",
      hint: "Paste the remote MCP URL in ChatGPT connectors and authorize with Social0. No API key.",
    },
    {
      id: "claude",
      label: "Claude (web)",
      hint: "Paste the remote MCP URL in Claude.ai connectors and authorize with Social0. No API key.",
    },
    {
      id: "cursor",
      label: "Cursor",
      hint: "Settings → MCP, or project .cursor/mcp.json (needs Node.js + API key)",
    },
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      hint: "macOS: ~/Library/Application Support/Claude/claude_desktop_config.json",
    },
    {
      id: "vscode",
      label: "VS Code",
      hint: "Copilot / MCP settings (stdio server)",
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      hint: "Install the Social0 skill from ClawHub, then log in with the CLI.",
    },
    {
      id: "hermes",
      label: "Hermes",
      hint: "Add the Social0 CLI skill with npx skills, then social0 login.",
    },
  ];

  return (
    <div className={`${cardShell} p-6 sm:p-8`}>
      <div className="mb-6 flex flex-wrap gap-2">
        {hosts.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setHost(h.id)}
            className={cn(
              "rounded-[10px] px-4 py-2 text-[13px] font-medium transition-colors",
              host === h.id
                ? "bg-emerald-500 text-[#04140c]"
                : "bg-muted text-muted-foreground hover:text-foreground dark:bg-[#151515]",
            )}
          >
            {h.label}
          </button>
        ))}
      </div>

      <p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
        {hosts.find((h) => h.id === host)?.hint}
      </p>

      {isRemote ? (
        <ol className="mb-6 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-muted-foreground">
          <li>
            {host === "chatgpt"
              ? "Open ChatGPT → Settings → Connectors / MCP"
              : "Open Claude.ai → Settings → Connectors"}
          </li>
          <li>
            Add a remote server with URL{" "}
            <code className="rounded bg-muted px-1 text-[13px] text-foreground dark:bg-[#151515]">
              {HOSTED_MCP_URL}
            </code>
          </li>
          <li>Connect and approve Social0 in your browser (OAuth)</li>
          <li>Ask: “Show my connected Social0 accounts”</li>
        </ol>
      ) : isSkill ? (
        <ol className="mb-6 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-muted-foreground">
          {host === "openclaw" ? (
            <>
              <li>
                Run{" "}
                <code className="rounded bg-muted px-1 text-[13px] text-foreground dark:bg-[#151515]">
                  {OPENCLAW_SKILL_INSTALL}
                </code>
              </li>
              <li>
                Install the CLI if needed:{" "}
                <code className="rounded bg-muted px-1 text-[13px] text-foreground dark:bg-[#151515]">
                  npm install -g social0
                </code>
                , then{" "}
                <code className="rounded bg-muted px-1 text-[13px] text-foreground dark:bg-[#151515]">
                  social0 login
                </code>
              </li>
              <li>Ask your agent to post or list Social0 accounts</li>
            </>
          ) : (
            <>
              <li>
                Run{" "}
                <code className="rounded bg-muted px-1 text-[13px] text-foreground dark:bg-[#151515]">
                  {SKILLS_CLI_INSTALL}
                </code>
              </li>
              <li>
                Install + auth:{" "}
                <code className="rounded bg-muted px-1 text-[13px] text-foreground dark:bg-[#151515]">
                  npm install -g social0 && social0 login
                </code>
              </li>
              <li>Use the skill in Hermes (or any host that loads Agent Skills)</li>
            </>
          )}
        </ol>
      ) : (
        <div className="mb-4">
          <label className="block max-w-md">
            <span className="mb-1.5 block text-[13px] font-medium text-foreground">
              API key
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk_live_…"
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2.5 text-[14px] outline-none ring-emerald-500/30 focus:ring-2 dark:border-white/10 dark:bg-[#111111]"
            />
          </label>
        </div>
      )}

      <div className="relative">
        <pre className="max-h-[280px] overflow-auto rounded-xl border border-border bg-[#0d1117] p-4 text-[12px] leading-relaxed text-[#e6edf3] dark:border-white/10 sm:text-[13px]">
          {config}
        </pre>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute right-3 top-3 gap-1.5"
          onClick={copyConfig}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        {isRemote ? (
          <>
            Same remote URL for ChatGPT (web) and Claude (web):{" "}
            <code className="rounded bg-muted px-1 dark:bg-[#151515]">
              {HOSTED_MCP_URL}
            </code>{" "}
            — OAuth only, no npx.
          </>
        ) : isSkill ? (
          host === "openclaw" ? (
            <>
              ClawHub package:{" "}
              <code className="rounded bg-muted px-1 dark:bg-[#151515]">
                @abhishek-b-r/social0
              </code>
              . Prefer the CLI skill over wiring MCP by hand when your agent has a
              shell.
            </>
          ) : (
            <>
              Works anywhere Agent Skills are supported — Hermes and similar hosts.
              Same skill lives in{" "}
              <a
                href="https://github.com/Abhishek-B-R/social0-cli"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
              >
                social0-cli
              </a>
              .
            </>
          )
        ) : needsApiKey ? (
          <>
            Paste into your host, save, and restart if needed. Uses{" "}
            <code className="rounded bg-muted px-1 dark:bg-[#151515]">
              npx -y @social0/mcp
            </code>{" "}
            (Node.js 20+). Package:{" "}
            <a
              href="https://www.npmjs.com/package/@social0/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              @social0/mcp
            </a>
            .
          </>
        ) : null}
      </p>
    </div>
  );
}

export default function McpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <MarketingPageLayout showCta={false}>
      <SeoHead
        title="Social0 MCP Server — Manage social media accounts from your AI"
        description="Connect ChatGPT, Claude, Cursor, VS Code, OpenClaw, or Hermes to Social0. Remote OAuth, ClawHub skill, or local npx — create posts, publish, and schedule from natural language."
        path="/mcp"
        keywords={[
          "Social0 MCP",
          "Model Context Protocol",
          "Claude social media",
          "ChatGPT MCP",
          "Cursor MCP",
          "AI social scheduling",
        ]}
        canonical={absoluteUrl("/mcp")}
      />

      {/* Hero */}
      <section className="px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pt-20">
        <div className="mx-auto max-w-[1120px] text-center">
          <PlatformStrip variant="hero" className="mb-8" />

          <p className="mb-4 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            <Bot className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Official Model Context Protocol server
          </p>

          <h1 className="mx-auto max-w-3xl font-sans text-[clamp(36px,5.5vw,56px)] font-bold leading-[1.08] tracking-tight text-foreground dark:text-white">
            Manage social media accounts{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              from your AI
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
            Add{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[14px] dark:bg-[#151515]">
              https://mcp.social0.app/mcp
            </code>{" "}
            in any AI that supports remote MCP, then authorize with Social0. Or
            use{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[14px] dark:bg-[#151515]">
              npx @social0/mcp
            </code>{" "}
            locally in Cursor and Desktop. Draft, publish, and schedule across
            every connected platform from chat.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={DOCS_MCP_QUICKSTART_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={ctaPrimary}
            >
              View setup docs
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link href="/dashboard/api-keys" className={ctaSecondary}>
              Get API keys
            </Link>
            <a
              href={DOCS_CLI_QUICKSTART_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={ctaSecondary}
            >
              Prefer the terminal? CLI docs
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Real captures — add more srcs as you send them */}
      <section className="border-y border-border px-4 py-16 sm:px-6 sm:py-20 lg:px-8 dark:border-white/8">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-10 text-center">
            <p className={`${sectionEyebrow} inline-flex items-center gap-2`}>
              <MessageSquare className="h-3.5 w-3.5" />
              Live example
            </p>
            <h2 className={sectionTitle}>Just tell your AI what to do</h2>
            <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
              Real Claude/ChatGPT session with Social0 MCP — list accounts,
              publish, same pipeline as the dashboard.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className={`${cardShell} overflow-hidden p-1.5 sm:p-2`}>
              <img
                src="/demos/chatgpt-mcp-post.png"
                alt="ChatGPT using Social0 MCP to publish a post to X"
                className="w-full rounded-[14px] object-cover object-top"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className={`${cardShell} overflow-hidden p-1.5 sm:p-2`}>
              <img
                src="/demos/claude-mcp-accounts.png"
                alt="Claude using Social0 MCP to list connected social accounts"
                className="w-full rounded-[14px] object-cover object-top"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3 steps */}
      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-12 text-center">
            <p className={sectionEyebrow}>Get started</p>
            <h2 className={sectionTitle}>Setup in 3 steps</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Connect your accounts",
                body: "Link platforms in the Social0 dashboard. MCP publishes to accounts you've already connected.",
                href: DOCS_CONNECTIONS_URL,
                link: "Connections guide",
              },
              {
                step: "02",
                title: "Add Social0 to your AI",
                body: "ChatGPT: paste https://mcp.social0.app/mcp and authorize. OpenClaw: openclaw skills install @abhishek-b-r/social0. Hermes / others: npx skills add abhishek-b-r/social0-cli. Cursor / Desktop: npx config + API key below.",
                href: DOCS_MCP_QUICKSTART_URL,
                link: "Setup guide",
              },
              {
                step: "03",
                title: "Ask in chat",
                body: "Try “Show my connected Social0 accounts” or “Post this to LinkedIn and X.”",
                href: DOCS_MCP_URL,
                link: "Full MCP docs",
              },
            ].map((item) => (
              <div key={item.step} className={`${cardShell} p-6`}>
                <span className="text-[12px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  {item.step}
                </span>
                <h3 className="mt-3 font-sans text-[18px] font-bold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {item.link}
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Config */}
      <section className="border-y border-border bg-muted/30 px-4 py-16 sm:px-6 sm:py-20 dark:border-white/8 dark:bg-muted/10 lg:px-8">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-10 text-center">
            <p className={sectionEyebrow}>Connect in under a minute</p>
            <h2 className={sectionTitle}>One URL for remote AIs</h2>
          </div>
          <McpConfigPanel />
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-12 text-center">
            <p className={sectionEyebrow}>Capabilities</p>
            <h2 className={sectionTitle}>
              Everything you need. Zero extra UI.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              13 tools covering accounts, posts, media, publish, schedule, and
              status.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className={`${cardShell} p-6`}>
                <f.icon className="mb-4 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-sans text-[16px] font-bold text-foreground">
                  {f.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {MCP_TOOLS.map((tool) => (
              <code
                key={tool}
                className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground dark:border-white/10 dark:bg-[#151515]"
              >
                {tool}
              </code>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture note */}
      <section className="border-y border-border px-4 py-12 sm:px-6 dark:border-white/8 lg:px-8">
        <div className="mx-auto max-w-[1120px]">
          <div
            className={`${cardShell} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center`}
          >
            <Terminal className="h-8 w-8 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="font-sans text-[16px] font-bold text-foreground">
                Three ways to connect
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-muted-foreground">
                <li>
                  <strong className="font-medium text-foreground">
                    Remote MCP:
                  </strong>{" "}
                  Any host that accepts a remote MCP URL uses{" "}
                  <code className="rounded bg-muted px-1 text-[13px] dark:bg-[#151515]">
                    https://mcp.social0.app/mcp
                  </code>{" "}
                  with Social0 OAuth (no API key in config).
                </li>
                <li>
                  <strong className="font-medium text-foreground">
                    Local MCP:
                  </strong>{" "}
                  Cursor and Desktop can run{" "}
                  <code className="rounded bg-muted px-1 text-[13px] dark:bg-[#151515]">
                    npx @social0/mcp
                  </code>{" "}
                  with a{" "}
                  <code className="rounded bg-muted px-1 text-[13px] dark:bg-[#151515]">
                    sk_live_
                  </code>{" "}
                  key.
                </li>
                <li>
                  <strong className="font-medium text-foreground">CLI:</strong>{" "}
                  <code className="rounded bg-muted px-1 text-[13px] dark:bg-[#151515]">
                    npm install -g social0
                  </code>{" "}
                  then{" "}
                  <code className="rounded bg-muted px-1 text-[13px] dark:bg-[#151515]">
                    social0 login
                  </code>
                  .
                </li>
              </ul>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                All call the same Social0 REST API — poll{" "}
                <code className="rounded bg-muted px-1 text-[13px] dark:bg-[#151515]">
                  get_publish_status
                </code>{" "}
                after multi-platform publishes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-[800px]">
          <div className="mb-10 text-center">
            <p className={sectionEyebrow}>FAQ</p>
            <h2 className={sectionTitle}>Frequently asked questions</h2>
          </div>
          <div className="overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
            <div className="divide-y divide-border overflow-hidden rounded-[22px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111]">
              {FAQ.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left md:px-8"
                      onClick={() => setOpenFaq(open ? null : i)}
                      aria-expanded={open}
                    >
                      <span className="text-[15px] font-medium text-foreground">
                        {item.q}
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-lg text-muted-foreground transition-transform duration-200 dark:bg-muted/60 ${open ? "rotate-45" : ""}`}
                      >
                        +
                      </span>
                    </button>
                    {open ? (
                      <p className="px-6 pb-5 pr-10 text-[14px] leading-relaxed text-muted-foreground md:px-8">
                        {item.a}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA — matches landing FinalCTA emerald panel */}
      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="relative mx-auto max-w-[1120px] overflow-hidden rounded-[28px] border border-emerald-600/25 bg-gradient-to-br from-emerald-700 via-emerald-600 to-[#047857]">
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(0,0,0,0.14) 12px, rgba(0,0,0,0.14) 24px)",
            }}
            aria-hidden
          />
          <div className="relative z-10 px-8 py-16 text-center sm:px-12 sm:py-20">
            <h2 className="mb-4 font-sans text-[clamp(28px,4vw,44px)] font-bold leading-tight tracking-tight text-white">
              Ready to post from AI?
            </h2>
            <p className="mx-auto mb-8 max-w-md text-[16px] leading-relaxed text-white/85">
              Connect once, then manage every platform from natural language.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={DOCS_MCP_QUICKSTART_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[11px] bg-white px-8 py-3.5 text-[15px] font-semibold text-emerald-700 transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)] sm:w-auto active:scale-[0.97]"
              >
                View setup docs
                <span aria-hidden>→</span>
              </a>
              <Link
                href="/auth"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[11px] border border-white/40 px-8 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/10 sm:w-auto"
              >
                Try it out for free
              </Link>
            </div>
            <p className="mt-4 text-[12px] text-white/70">
              Free to start · 10 posts · No credit card
            </p>
          </div>
        </div>
      </section>
    </MarketingPageLayout>
  );
}
