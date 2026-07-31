import { Plus } from "lucide-react";
import {
  ClaudeIcon,
  ChatGptIcon,
  OpenClawIcon,
} from "./agent-brand-icons";

const AGENTS = [
  { name: "Claude", icon: ClaudeIcon },
  { name: "ChatGPT", icon: ChatGptIcon },
  { name: "OpenClaw", icon: OpenClawIcon },
] as const;

/** Compact pill row of MCP-compatible agents — agent-mode hero. */
export function AgentLogoStrip({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2 lg:justify-end ${className}`}
      aria-label="Compatible agents"
    >
      {AGENTS.map((agent) => (
        <div
          key={agent.name}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-[#151515]/90"
        >
          <agent.icon className="h-4 w-4 shrink-0" />
          <span>{agent.name}</span>
        </div>
      ))}
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[12px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-[#151515]/90">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-emerald-950 dark:bg-[#0d2e24]">
          <Plus
            className="h-2.5 w-2.5 text-emerald-400"
            strokeWidth={3}
            aria-hidden
          />
        </span>
        <span className="whitespace-nowrap">any MCP / CLI agent</span>
      </div>
    </div>
  );
}
