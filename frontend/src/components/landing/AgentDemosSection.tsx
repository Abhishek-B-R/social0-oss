import { useState, type ComponentType } from "react";
import { ArrowUpRight, CodeXml } from "lucide-react";
import Link from "@/components/AppLink";
import { DOCS_API_URL, DOCS_CLI_QUICKSTART_URL, DOCS_MCP_URL } from "@/lib/docs-url";
import {
  ChatGptIcon,
  ClaudeIcon,
  OpenClawIcon,
} from "./agent-brand-icons";

/**
 * Drop muted demo clips into frontend/public/videos/:
 *   agent-chatgpt.mp4 | agent-claude.mp4 | agent-openclaw.mp4 | agent-api.mp4
 */
const capabilities: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
  cta: string;
  video: string;
  external?: boolean;
  /** Staggered layout: video at top or bottom of the card */
  media: "top" | "bottom";
}[] = [
  {
    title: "Via ChatGPT / MCP",
    description:
      "Connect Social0 as an MCP server and let ChatGPT draft, schedule, and publish for you.",
    icon: ChatGptIcon,
    href: "/mcp",
    cta: "Set up MCP",
    video: "/videos/agent-chatgpt.mp4",
    media: "bottom",
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
    media: "top",
  },
  {
    title: "Via OpenClaw",
    description:
      "Wire OpenClaw to the Social0 CLI — agent-driven posts across your accounts, same publish pipeline as the dashboard.",
    icon: OpenClawIcon,
    href: DOCS_CLI_QUICKSTART_URL,
    cta: "CLI quickstart",
    video: "/videos/agent-openclaw.mp4",
    external: true,
    media: "bottom",
  },
  {
    title: "Via Public API",
    description:
      "Call the REST API from your code — create posts, schedule, and check status with an API key.",
    icon: CodeXml,
    href: DOCS_API_URL,
    cta: "API docs",
    video: "/videos/agent-api.mp4",
    external: true,
    media: "top",
  },
];

/** 16:9 demo slot — sized by aspect ratio, not stretched to fill the card. */
function DemoVideoSlot({
  src,
  flush,
}: {
  src: string;
  flush: "top" | "bottom";
}) {
  const [failed, setFailed] = useState(false);
  const round =
    flush === "top"
      ? "rounded-t-[20px] sm:rounded-t-[24px] lg:rounded-t-[30px]"
      : "rounded-b-[20px] sm:rounded-b-[24px] lg:rounded-b-[30px]";

  if (failed) {
    return (
      <div
        className={`aspect-video w-full shrink-0 bg-muted/40 dark:bg-[#0d0d0d] ${round}`}
        aria-hidden
      />
    );
  }

  return (
    <video
      className={`aspect-video w-full shrink-0 bg-muted/40 object-cover dark:bg-[#0d0d0d] ${round}`}
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

function CapCopy({
  cap,
}: {
  cap: (typeof capabilities)[number];
}) {
  return (
    <div className="flex flex-col gap-4 px-6 py-7 sm:gap-5 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <span className="flex size-14 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background p-2.5 dark:border-white/10 dark:bg-[#151515] sm:size-16 sm:p-3">
        <cap.icon className="size-full" />
      </span>
      <div className="space-y-3">
        <h3 className="font-sans text-[clamp(26px,3vw,36px)] font-bold tracking-tight text-foreground dark:text-white">
          {cap.title}
        </h3>
        <p className="max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-[17px] sm:leading-[1.55]">
          {cap.description}
        </p>
      </div>
      <div className="pt-1">
        {cap.external ? (
          <a
            href={cap.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {cap.cta}
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        ) : (
          <Link
            href={cap.href}
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {cap.cta}
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

export function AgentDemosSection() {
  return (
    <section
      id="agent-demos"
      className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-10 flex flex-col items-center gap-3 text-center sm:mb-12 lg:mb-14">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Agent mode
          </p>
          <h2 className="max-w-3xl font-sans text-[clamp(36px,5.5vw,56px)] font-bold leading-[1.1] tracking-tight text-foreground dark:text-white">
            Power your content with AI agents
          </h2>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
            ChatGPT, Claude, OpenClaw, and the REST API — same encrypted publish
            pipeline as the dashboard.
          </p>
        </div>

        {/* Staggered pairs: text↑/video↓ then video↑/text↓ — muted shells, large demos */}
        <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2 lg:gap-7">
          {capabilities.map((cap) => (
            <article
              key={cap.title}
              className="rounded-[28px] bg-muted/60 p-[5px] dark:bg-[#1A1A1A] sm:rounded-[32px] lg:rounded-[38px]"
            >
              <div className="rounded-[24px] border border-border p-[2px] dark:border-white/10 sm:rounded-[28px] lg:rounded-[34px]">
                <div className="flex flex-col overflow-hidden rounded-[20px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111] sm:rounded-[24px] lg:rounded-[30px]">
                  {cap.media === "top" ? (
                    <>
                      <DemoVideoSlot src={cap.video} flush="top" />
                      <CapCopy cap={cap} />
                    </>
                  ) : (
                    <>
                      <CapCopy cap={cap} />
                      <DemoVideoSlot src={cap.video} flush="bottom" />
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
