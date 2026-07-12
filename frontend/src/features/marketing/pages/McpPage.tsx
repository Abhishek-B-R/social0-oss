import { useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import {
  BlueskyIcon,
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  PinterestIcon,
  ThreadsIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/landing/PlatformIcons";
import { SeoHead } from "@/components/seo/SeoHead";
import { Button } from "@/components/ui/button";
import {
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

type HostId = "cursor" | "claude" | "chatgpt" | "vscode";

const MCP_TOOLS = [
  "list_accounts",
  "create_post",
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

const CHAT_EXAMPLES = [
  {
    user: "Show my connected Social0 accounts.",
    assistant:
      "You have 6 active accounts: LinkedIn, X, Instagram, YouTube, Threads, and Bluesky. All tokens are healthy.",
  },
  {
    user: "Publish a launch update to LinkedIn and X with ./assets/hero.png",
    assistant:
      "Uploaded hero.png, created the post, and started publishing. Tracking ID: 8f2a… — X and LinkedIn are uploading now.",
  },
  {
    user: "Schedule Friday's newsletter teaser for 9 AM UTC on all platforms.",
    assistant:
      "Scheduled for 2026-07-17T09:00:00.000Z across 6 platforms. I'll remind you when it's live.",
  },
] as const;

const FAQ = [
  {
    q: "What is MCP?",
    a: "Model Context Protocol is an open standard that lets AI assistants call tools on your behalf. Social0's MCP server exposes posting, scheduling, and account tools to Claude, Cursor, VS Code, and other hosts.",
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
    q: "Where do I get an API key?",
    a: "Create one at Dashboard → API keys. Keys start with sk_live_. Legacy s0_live_ keys still work.",
  },
  {
    q: "Is my API key safe?",
    a: "Your key stays in your AI host's MCP config. The server runs via npx on your machine and sends the key only to api.social0.app — same as any API client.",
  },
  {
    q: "What if one platform fails?",
    a: "Multi-platform jobs can finish as partial — some platforms succeed, others fail. Check get_publish_status errors and retry from the dashboard if needed.",
  },
] as const;

const PLATFORM_ICONS = [
  { Icon: XIcon, label: "X" },
  { Icon: LinkedInIcon, label: "LinkedIn" },
  { Icon: InstagramIcon, label: "Instagram" },
  { Icon: YouTubeIcon, label: "YouTube" },
  { Icon: TikTokIcon, label: "TikTok" },
  { Icon: FacebookIcon, label: "Facebook" },
  { Icon: ThreadsIcon, label: "Threads" },
  { Icon: BlueskyIcon, label: "Bluesky" },
  { Icon: PinterestIcon, label: "Pinterest" },
] as const;

function buildMcpConfig(host: HostId, apiKey: string) {
  const key = apiKey.trim() || "sk_live_your_key_here";
  const env = { SOCIAL0_API_KEY: key };

  if (host === "chatgpt") {
    return JSON.stringify(
      {
        name: "social0",
        command: "npx",
        args: ["-y", "social0-mcp"],
        env,
      },
      null,
      2,
    );
  }

  if (host === "vscode") {
    return JSON.stringify(
      {
        servers: {
          social0: {
            type: "stdio",
            command: "npx",
            args: ["-y", "social0-mcp"],
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
          args: ["-y", "social0-mcp"],
          env,
        },
      },
    },
    null,
    2,
  );
}

function TerminalWindow({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-[#0d1117] text-[#e6edf3] shadow-lg",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[12px] text-white/50">{title}</span>
      </div>
      <div className="p-4 font-mono text-[12px] leading-relaxed sm:text-[13px]">
        {children}
      </div>
    </div>
  );
}

function ChatBubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("flex", role === "user" ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[90%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed",
          role === "user"
            ? "rounded-br-md bg-foreground text-background"
            : "rounded-bl-md border border-border bg-muted/60 text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function McpConfigPanel() {
  const [host, setHost] = useState<HostId>("cursor");
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);

  const config = useMemo(() => buildMcpConfig(host, apiKey), [host, apiKey]);

  const copyConfig = () => {
    void navigator.clipboard.writeText(config);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const hosts: { id: HostId; label: string; hint: string }[] = [
    {
      id: "cursor",
      label: "Cursor",
      hint: "Settings → MCP, or project .cursor/mcp.json",
    },
    {
      id: "claude",
      label: "Claude Desktop",
      hint: "macOS: ~/Library/Application Support/Claude/claude_desktop_config.json",
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      hint: "Settings → Connectors / MCP (Desktop; wording varies)",
    },
    {
      id: "vscode",
      label: "VS Code",
      hint: "Copilot / MCP settings (stdio server)",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex flex-wrap gap-2">
        {hosts.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setHost(h.id)}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
              host === h.id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {h.label}
          </button>
        ))}
      </div>

      <p className="mb-6 text-[13px] text-muted-foreground">
        {hosts.find((h) => h.id === host)?.hint}
      </p>

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
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] outline-none ring-emerald-500/30 focus:ring-2"
          />
        </label>
      </div>

      <div className="relative">
        <pre className="max-h-[280px] overflow-auto rounded-xl border border-border bg-[#0d1117] p-4 text-[12px] leading-relaxed text-[#e6edf3] sm:text-[13px]">
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

      <p className="mt-4 text-[12px] text-muted-foreground">
        Paste into your host, save, and restart if needed. Uses{" "}
        <code className="rounded bg-muted px-1">npx -y social0-mcp</code>{" "}
        (Node.js 20+). Package:{" "}
        <a
          href="https://www.npmjs.com/package/social0-mcp"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          social0-mcp
        </a>
        .
      </p>
    </div>
  );
}

export default function McpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <MarketingPageLayout showCta={false}>
      <SeoHead
        title="Social0 MCP Server — Manage social media from your AI"
        description="Connect Claude, Cursor, or VS Code to Social0 with the official MCP server. Create posts, publish to multiple platforms, schedule content, and track progress — all from natural language."
        path="/mcp"
        keywords={[
          "Social0 MCP",
          "Model Context Protocol",
          "Claude social media",
          "Cursor MCP",
          "AI social scheduling",
        ]}
        canonical={absoluteUrl("/mcp")}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border px-6 pb-20 pt-14 lg:px-8 lg:pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(26,107,74,0.12),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,255,119,0.08),transparent)]" />
        <div className="relative mx-auto max-w-[1100px] text-center">
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            {PLATFORM_ICONS.map(({ Icon, label }) => (
              <span
                key={label}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/80 text-foreground shadow-sm"
                title={label}
              >
                <Icon className="h-4 w-4" />
              </span>
            ))}
          </div>

          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[12px] font-medium text-emerald-800 dark:text-emerald-300">
            <Bot className="h-3.5 w-3.5" />
            Official Model Context Protocol server
          </p>

          <h1 className="mx-auto max-w-3xl font-serif text-[clamp(36px,6vw,56px)] leading-[1.08] tracking-tight text-foreground">
            Manage social media{" "}
            <em className="text-[#1a6b4a] dark:text-[#00ff77]">from your AI</em>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            Open-source MCP server for Social0. Let Claude, Cursor, or ChatGPT
            draft posts, publish to every platform, upload media, and track
            progress — no dashboard required.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={DOCS_MCP_QUICKSTART_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-foreground px-6 py-3.5 text-[15px] font-medium text-background transition-all hover:-translate-y-px hover:opacity-90 sm:w-auto dark:bg-[#ffffff] dark:text-[#0a0a0a]"
            >
              View setup docs
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/dashboard/api-keys"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-background px-6 py-3.5 text-[15px] font-medium text-foreground transition-all hover:bg-muted sm:w-auto"
            >
              Get API keys
            </Link>
          </div>
        </div>
      </section>

      {/* Demo */}
      <section className="border-b border-border px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1100px]">
          <p className="mb-2 text-center text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Live workflow
          </p>
          <h2 className="mb-10 text-center font-serif text-[clamp(28px,4vw,40px)] tracking-tight text-foreground">
            This is what it looks like
          </h2>

          <div className="grid gap-6 lg:grid-cols-2">
            <TerminalWindow title="You → Claude">
              <p className="text-white/50">$</p>
              <p className="mt-1 text-emerald-400">
                Post our v2 launch to LinkedIn and X with ./assets/hero.png
              </p>
              <p className="mt-4 text-white/40">↓ social0.upload_media</p>
              <p className="text-white/40">↓ social0.publish_now</p>
            </TerminalWindow>

            <TerminalWindow title="social0 → list_accounts">
              <pre className="whitespace-pre-wrap text-[#8b949e]">
                {`platform      username        status
linkedin      acme-co         active
twitter_x     acme            active
instagram     acme.official   active
youtube       AcmeChannel     active
threads       acme            active
bluesky       acme.bsky       active`}
              </pre>
            </TerminalWindow>
          </div>
        </div>
      </section>

      {/* Chat examples */}
      <section className="border-b border-border bg-muted/30 px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[720px]">
          <div className="mb-8 flex items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="h-5 w-5" />
            <h2 className="font-serif text-[clamp(24px,3vw,32px)] tracking-tight text-foreground">
              Just tell your AI what to do
            </h2>
          </div>
          <div className="space-y-4">
            {CHAT_EXAMPLES.map((ex, i) => (
              <div key={i} className="space-y-3">
                <ChatBubble role="user">{ex.user}</ChatBubble>
                <ChatBubble role="assistant">{ex.assistant}</ChatBubble>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 steps */}
      <section className="border-b border-border px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-12 text-center font-serif text-[clamp(28px,4vw,40px)] tracking-tight text-foreground">
            Setup in 3 steps
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Connect your accounts",
                body: "Link platforms in the Social0 dashboard. MCP publishes to accounts you've already connected.",
                href: DOCS_CONNECTIONS_URL,
                link: "Connections guide",
                external: true,
              },
              {
                step: "2",
                title: "Create an API key",
                body: "Generate a sk_live_ key from Dashboard → API keys. One key per AI assistant is recommended.",
                href: "/dashboard/api-keys",
                link: "Open API keys",
                external: false,
              },
              {
                step: "3",
                title: "Add MCP to your AI",
                body: "Paste the npx config below into Cursor, Claude Desktop, ChatGPT, or VS Code. Restart the host and try list_accounts.",
                href: DOCS_MCP_URL,
                link: "Full MCP docs",
                external: true,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 font-serif text-lg text-emerald-800 dark:text-emerald-300">
                  {item.step}
                </span>
                <h3 className="mt-4 font-serif text-xl text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                {item.external ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {item.link}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {item.link}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Config */}
      <section className="border-b border-border px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-10 text-center">
            <p className="mb-2 text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Connect in under a minute
            </p>
            <h2 className="font-serif text-[clamp(28px,4vw,40px)] tracking-tight text-foreground">
              Copy your MCP config
            </h2>
          </div>
          <McpConfigPanel />
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-3 text-center font-serif text-[clamp(28px,4vw,40px)] tracking-tight text-foreground">
            Everything you need. Zero extra UI.
          </h2>
          <p className="mx-auto mb-12 max-w-xl text-center text-muted-foreground">
            13 tools covering accounts, posts, media, publish, schedule, and
            status.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-emerald-500/30"
              >
                <f.icon className="mb-4 h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                <h3 className="font-medium text-foreground">{f.title}</h3>
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
                className="rounded-full border border-border bg-muted/50 px-3 py-1 font-mono text-[11px] text-muted-foreground"
              >
                {tool}
              </code>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture note */}
      <section className="border-b border-border bg-muted/20 px-6 py-12 lg:px-8">
        <div className="mx-auto flex max-w-[1100px] flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center">
          <Terminal className="h-8 w-8 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <div>
            <h3 className="font-medium text-foreground">Thin by design</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
              The MCP server has no database or OAuth — it translates tool calls
              to the Social0 REST API using your API key. Multi-platform
              publishes fan out in parallel; use{" "}
              <code className="rounded bg-muted px-1 text-[13px]">
                get_publish_status
              </code>{" "}
              to poll until each platform finishes.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[720px]">
          <h2 className="mb-8 text-center font-serif text-[clamp(28px,4vw,36px)] tracking-tight text-foreground">
            Frequently asked questions
          </h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {FAQ.map((item, i) => (
              <div key={item.q}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-foreground"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  {item.q}
                  <span className="text-muted-foreground">
                    {openFaq === i ? "−" : "+"}
                  </span>
                </button>
                {openFaq === i ? (
                  <p className="px-5 pb-4 text-[14px] leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — avoid bg-white (remapped to --card in dark mode) */}
      <section className="border-t border-border bg-foreground px-6 py-16 text-center dark:bg-[#0A0A0A] lg:px-8">
        <div className="mx-auto max-w-xl">
          <h2 className="font-serif text-[clamp(28px,4vw,36px)] tracking-tight text-background dark:text-white">
            Ready to post from AI?
          </h2>
          <p className="mt-3 text-[16px] text-background/70 dark:text-white/70">
            Connect once, then manage every platform from natural language.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={DOCS_MCP_QUICKSTART_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-background px-6 py-3.5 text-[15px] font-medium text-foreground transition-all hover:-translate-y-px hover:opacity-90 sm:w-auto dark:bg-[#ffffff] dark:text-[#0a0a0a]"
            >
              View setup docs
            </a>

            <Link
              href="/auth"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-background/40 px-6 py-3.5 text-[15px] font-medium text-background transition-all hover:bg-background/10 sm:w-auto dark:border-white/40 dark:text-white dark:hover:bg-white/10"
            >
              Get started free
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageLayout>
  );
}
