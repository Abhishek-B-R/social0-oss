import { Bot, Key, Terminal, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSelfSource, type PostSourceInfo } from "./post-source";
import { usePostSource } from "./use-post-source";

const ICON = {
  user: User,
  teammate: User,
  api_key: Key,
  cli: Terminal,
  mcp: Bot,
} as const;

type SourceChipBaseProps = {
  className?: string;
  /** Hide the leading icon (dense tables). */
  iconless?: boolean;
  /**
   * Render "You" too. Off by default: the signed-in user's own posts carry
   * no chip anywhere (lists, detail, activity, calendar).
   */
  showSelf?: boolean;
};

/**
 * Presentational chip for an already-resolved source. Renders nothing for
 * the current user. Agents (MCP / CLI / API key) get a soft violet tint;
 * teammates are plain muted text with an icon.
 */
export function SourceChipView({
  source,
  className,
  iconless,
  showSelf = false,
}: SourceChipBaseProps & { source: PostSourceInfo }) {
  if (!showSelf && isSelfSource(source)) return null;
  const Icon = ICON[source.kind];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate text-xs font-medium leading-5",
        source.isAgent ? "rounded-md bg-agent-soft px-1.5 text-agent" : "text-text-muted",
        className,
      )}
      title={`Created by ${source.label}`}
    >
      {iconless ? null : <Icon aria-hidden className="h-3 w-3 shrink-0" />}
      <span className="truncate">{source.label}</span>
    </span>
  );
}

/**
 * Teammate / "ChatGPT · MCP" / "CLI · key" / "API · key" chip; nothing for
 * the signed-in user. Reads `post.metadata.source`; no source means "You".
 */
export function SourceChip({
  post,
  teammateName,
  className,
  iconless,
  showSelf,
}: SourceChipBaseProps & {
  post: { metadata?: unknown; createdByUserId?: string | null };
  teammateName?: string | null;
}) {
  const source = usePostSource(post, { teammateName });
  return (
    <SourceChipView
      source={source}
      className={className}
      iconless={iconless}
      showSelf={showSelf}
    />
  );
}
