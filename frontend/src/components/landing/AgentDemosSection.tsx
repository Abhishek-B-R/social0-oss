import { useState, type ComponentType } from "react";
import { ArrowUpRight } from "lucide-react";
import Link from "@/components/AppLink";
import { DOCS_API_URL, DOCS_MCP_URL } from "@/lib/docs-url";
import {
  ChatGptIcon,
  ClaudeIcon,
  OpenClawIcon,
  PostmanIcon,
} from "./agent-brand-icons";

/**
 * Drop muted demo clips into frontend/public/videos/:
 *   agent-chatgpt.mp4 | agent-claude.mp4 | agent-openclaw.mp4 | agent-postman.mp4
 */
const capabilities: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
  cta: string;
  video: string;
  external?: boolean;
}[] = [
  {
    title: "Via ChatGPT / MCP",
    description:
      "Connect Social0 as an MCP server and let ChatGPT draft, schedule, and publish for you.",
    icon: ChatGptIcon,
    href: "/mcp",
    cta: "Set up MCP",
    video: "/videos/agent-chatgpt.mp4",
  },
  {
    title: "Via Claude",
    description:
      "Point Claude at Social0 — ask it to post updates, queue threads, or check status.",
    icon: ClaudeIcon,
    href: DOCS_MCP_URL,
    cta: "MCP docs",
    video: "/videos/agent-claude.mp4",
    external: true,
  },
  {
    title: "Via OpenClaw",
    description:
      "Run OpenClaw against Social0’s MCP — same publish pipeline, agent-driven posts across your accounts.",
    icon: OpenClawIcon,
    href: "/mcp",
    cta: "MCP setup",
    video: "/videos/agent-openclaw.mp4",
  },
  {
    title: "Via Postman / API",
    description:
      "Call the REST API from Postman or your code — create posts, schedule, and check status with an API key.",
    icon: PostmanIcon,
    href: DOCS_API_URL,
    cta: "API docs",
    video: "/videos/agent-postman.mp4",
    external: true,
  },
];

/** Reserved 16:9 slot — plays when file exists, keeps layout when it doesn't. */
function DemoVideoSlot({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="aspect-video w-full rounded-2xl border border-border/60 bg-muted/30 dark:border-white/5 dark:bg-[#0d0d0d]"
        aria-hidden
      />
    );
  }

  return (
    <video
      className="aspect-video w-full rounded-2xl border border-border/60 bg-muted/30 object-cover dark:border-white/5 dark:bg-[#0d0d0d]"
      src={src}
      muted
      playsInline
      loop
      autoPlay
      preload="metadata"
      onError={() => setFailed(true)}
    />
  );
}

export function AgentDemosSection() {
  return (
    <section
      id="agent-demos"
      className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Agent mode
          </p>
          <h2 className="max-w-lg font-serif text-[clamp(28px,4vw,40px)] italic leading-tight text-muted-foreground">
            Power your content with AI agents
          </h2>
          <p className="max-w-md text-[14px] leading-relaxed text-muted-foreground">
            ChatGPT, Claude, OpenClaw, and the REST API — same encrypted publish
            pipeline as the dashboard.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="group relative overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 transition-transform duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-[#1A1A1A]"
            >
              <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-5 dark:border-white/5 dark:bg-[#111111] sm:p-6">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background dark:border-white/10 dark:bg-[#151515]">
                    <cap.icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-serif text-xl tracking-tight text-foreground">
                    {cap.title}
                  </h3>
                </div>
                <p className="mb-4 text-[14px] leading-relaxed text-muted-foreground">
                  {cap.description}
                </p>
                <DemoVideoSlot src={cap.video} />
                <div className="mt-4">
                  {cap.external ? (
                    <a
                      href={cap.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      {cap.cta}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : (
                    <Link
                      href={cap.href}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      {cap.cta}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
