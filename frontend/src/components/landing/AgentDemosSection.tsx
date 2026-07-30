import { useState } from "react";
import { Bot, Code2, Terminal, Webhook } from "lucide-react";

/**
 * Drop muted demo clips into frontend/public/videos/:
 *   agent-mcp.mp4 | agent-claude.mp4 | agent-cli.mp4 | agent-api.mp4
 */
const demos = [
  {
    title: "Via Cursor / MCP",
    description:
      "Connect Social0 as an MCP server and let Cursor draft, schedule, and publish for you.",
    icon: Bot,
    src: "/videos/agent-mcp.mp4",
    label: "MCP",
  },
  {
    title: "Via Claude",
    description:
      "Point Claude at Social0 — ask it to post updates, queue threads, or check status.",
    icon: Bot,
    src: "/videos/agent-claude.mp4",
    label: "Claude",
  },
  {
    title: "Via CLI",
    description:
      "Ship from the terminal with the official social0 CLI — same publish pipeline as the app.",
    icon: Terminal,
    src: "/videos/agent-cli.mp4",
    label: "CLI",
  },
  {
    title: "Via API / Zapier / n8n",
    description:
      "Automate with the REST API, webhooks, or your favorite no-code stack.",
    icon: Webhook,
    src: "/videos/agent-api.mp4",
    label: "API",
  },
] as const;

function DemoVideo({
  src,
  label,
}: {
  src: string;
  label: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 dark:border-white/10 dark:bg-[#0d0d0d]"
        aria-hidden
      >
        <Code2 className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
        <p className="text-[11px] text-muted-foreground/70">
          Add <span className="font-mono">{label}</span> video
        </p>
      </div>
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
            Watch muted demos of agents posting through MCP, Claude, CLI, and
            API — same pipeline as the dashboard.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {demos.map((demo) => (
            <div
              key={demo.src}
              className="group relative overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 transition-transform duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-[#1A1A1A]"
            >
              <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-5 dark:border-white/5 dark:bg-[#111111] sm:p-6">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
                  <demo.icon
                    className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="mb-2 font-serif text-xl tracking-tight text-foreground">
                  {demo.title}
                </h3>
                <p className="mb-5 text-[14px] leading-relaxed text-muted-foreground">
                  {demo.description}
                </p>
                <DemoVideo src={demo.src} label={demo.label} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
