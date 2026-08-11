import { useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowUpRight, CodeXml } from "lucide-react";
import Link from "@/components/AppLink";
import {
  DOCS_API_URL,
  DOCS_CLI_QUICKSTART_URL,
  DOCS_MCP_URL,
} from "@/lib/docs-url";
import { ChatGptIcon, ClaudeIcon, OpenClawIcon } from "./agent-brand-icons";

/**
 * Drop muted demo clips into frontend/public/videos/:
 *   agent-chatgpt.mp4 | agent-claude.mp4 | agent-openclaw.mp4 | agent-api.mp4
 * Optional stills in frontend/public/demos/ (used when video is missing).
 */
const capabilities: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
  cta: string;
  video: string;
  poster?: string;
  external?: boolean;
  media: "top" | "bottom";
  /** Where object-cover anchors — OpenClaw keeps the UI chrome at the bottom. */
  object?: "top" | "bottom";
}[] = [
  {
    title: "Via ChatGPT / any chat interface",
    description:
      "Connect Social0 as an MCP server and ask ChatGPT to draft, schedule, and publish posts for you.",
    icon: ChatGptIcon,
    href: "/mcp",
    cta: "Set up MCP",
    video: "/videos/agent-chatgpt.mp4",
    poster: "/demos/chatgpt-mcp-accounts.png",
    media: "bottom",
  },
  {
    title: "Via Claude Code",
    description:
      "Give Claude a task and let it create, schedule, and manage your social posts directly.",
    icon: ClaudeIcon,
    href: DOCS_MCP_URL,
    cta: "MCP docs",
    video: "/videos/agent-claude.mp4",
    poster: "/demos/claude-code-preview.png",
    media: "top",
  },
  {
    title: "Via OpenClaw / Hermes agents",
    description:
      "Tell your agent what you want to publish, or give it a workflow to handle recurring social tasks through Social0.",
    icon: OpenClawIcon,
    href: DOCS_CLI_QUICKSTART_URL,
    cta: "CLI quickstart",
    video: "/videos/agent-openclaw.mp4",
    poster: "/demos/openclaw-preview.png",
    external: true,
    media: "bottom",
    object: "bottom",
  },
  {
    title: "Via Public API",
    description:
      "Call the REST API from your code — create posts, schedule, and check status with an API key.",
    icon: CodeXml,
    href: DOCS_API_URL,
    cta: "API docs",
    video: "/videos/agent-api.mp4",
    poster: "/demos/api-postman-preview.png",
    external: true,
    media: "top",
  },
];

/** 16:9 demo slot — inset from card edges so media doesn't kiss the border. */
function DemoVideoSlot({
  src,
  poster,
  flush = "bottom",
  object = "top",
}: {
  src: string;
  poster?: string;
  flush?: "top" | "bottom";
  object?: "top" | "bottom";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const pad =
    flush === "top"
      ? "px-3 pt-3 pb-1 sm:px-4 sm:pt-4 sm:pb-1.5"
      : "px-3 pt-1 pb-3 sm:px-4 sm:pt-1.5 sm:pb-4";
  const fit =
    object === "bottom"
      ? "aspect-video w-full object-cover object-bottom"
      : "aspect-video w-full object-cover object-top";

  // ponytail: pause off-screen / hidden tab / reduced-motion so decode doesn't burn CPU
  useEffect(() => {
    const el = videoRef.current;
    if (!el || failed) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      el.pause();
      return;
    }

    let inView = false;
    const sync = () => {
      if (inView && !document.hidden) void el.play().catch(() => {});
      else el.pause();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        sync();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      el.pause();
    };
  }, [failed, src]);

  const media = failed ? (
    poster ? (
      <img
        src={poster}
        alt=""
        className={`${fit} dark:bg-[#0d0d0d]`}
        loading="lazy"
        decoding="async"
      />
    ) : (
      <div
        className="aspect-video w-full bg-muted/40 dark:bg-[#0d0d0d]"
        aria-hidden
      />
    )
  ) : (
    <video
      ref={videoRef}
      className={`${fit} bg-muted/40 dark:bg-[#0d0d0d]`}
      src={src}
      poster={poster}
      muted
      playsInline
      loop
      preload="metadata"
      onError={() => setFailed(true)}
    />
  );

  return (
    <div className={`shrink-0 ${pad}`}>
      <div className="overflow-hidden rounded-xl border border-border/50 dark:border-white/8 sm:rounded-2xl">
        {media}
      </div>
    </div>
  );
}

function CapCopy({ cap }: { cap: (typeof capabilities)[number] }) {
  return (
    <div className="flex h-full flex-col gap-3 px-5 py-5 sm:gap-3.5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
      <span className="flex size-12 items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-2 dark:border-white/10 dark:bg-[#151515] sm:size-14 sm:rounded-2xl sm:p-2.5">
        <cap.icon className="size-full" />
      </span>
      <div className="space-y-2">
        <h3 className="font-sans text-[clamp(22px,2.6vw,30px)] font-bold tracking-tight text-[#333C4D] dark:text-white">
          {cap.title}
        </h3>
        <p className="max-w-lg text-[14px] leading-relaxed text-muted-foreground sm:text-[15px] sm:leading-[1.5]">
          {cap.description}
        </p>
      </div>
      <div className="mt-auto pt-0.5">
        {cap.external ? (
          <a
            href={cap.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {cap.cta}
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        ) : (
          <Link
            href={cap.href}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
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
      className="px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10 lg:px-8 lg:pb-24 lg:pt-6"
    >
      <div className="mx-auto w-full max-w-350">
        <div className="mb-10 flex flex-col items-center gap-3 text-center sm:mb-12 lg:mb-14">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Agent mode
          </p>
          <h2 className="max-w-3xl font-sans text-[clamp(36px,5.5vw,56px)] font-bold leading-[1.1] tracking-tight text-[#333C4D] dark:text-white">
            Power your content with AI agents
          </h2>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
            ChatGPT, Claude, OpenClaw, REST API, and more — all connected to the
            same Social0 publishing engine.
          </p>
        </div>

        {/* Staggered pairs: text↑/video↓ then video↑/text↓ — muted shells, large demos */}
        <div className="grid grid-cols-1 items-stretch gap-5 sm:gap-6 lg:grid-cols-2 lg:gap-7">
          {capabilities.map((cap) => (
            <article
              key={cap.title}
              className="flex h-full flex-col rounded-[28px] bg-muted/60 p-1.25 dark:bg-[#1A1A1A] sm:rounded-[32px] lg:rounded-[38px]"
            >
              <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-border p-0.5 dark:border-white/10 sm:rounded-[28px] lg:rounded-[34px]">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111] sm:rounded-[24px] lg:rounded-[30px]">
                  {cap.media === "top" ? (
                    <>
                      <DemoVideoSlot
                        src={cap.video}
                        poster={cap.poster}
                        flush="top"
                        object={cap.object}
                      />
                      <div className="flex min-h-0 flex-1 flex-col">
                        <CapCopy cap={cap} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex min-h-0 flex-1 flex-col">
                        <CapCopy cap={cap} />
                      </div>
                      <DemoVideoSlot
                        src={cap.video}
                        poster={cap.poster}
                        flush="bottom"
                        object={cap.object}
                      />
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
