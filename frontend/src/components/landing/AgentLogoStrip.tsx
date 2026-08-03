import { Plus } from "lucide-react";
import { ClaudeIcon, ChatGptIcon, OpenClawIcon } from "./agent-brand-icons";

const AGENTS = [
  { name: "Claude", icon: ClaudeIcon },
  { name: "ChatGPT", icon: ChatGptIcon },
  { name: "OpenClaw", icon: OpenClawIcon },
] as const;

/** Desktop “Supported by” under iso; also used centered on mobile agent hero. */
export function AgentLogoStrip({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-2 bg-transparent ${className}`}
      aria-label="Supported by"
    >
      <span className="shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground">
        Supported by
      </span>
      <div className="flex flex-wrap items-center gap-1.5 bg-transparent max-lg:justify-center lg:justify-end">
        {AGENTS.map((agent) => (
          <div
            key={agent.name}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-foreground dark:border-white/15"
          >
            <agent.icon className="h-3.5 w-3.5 shrink-0" />
            <span>{agent.name}</span>
          </div>
        ))}
        <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:border-white/15">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-emerald-600/15 dark:bg-[#0d2e24]/80">
            <Plus
              className="h-2 w-2 text-emerald-700 dark:text-emerald-400"
              strokeWidth={3}
              aria-hidden
            />
          </span>
          <span className="whitespace-nowrap">any MCP / CLI agent</span>
        </div>
      </div>
    </div>
  );
}
