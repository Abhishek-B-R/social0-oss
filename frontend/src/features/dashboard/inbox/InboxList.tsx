import { useEffect, useRef } from "react";
import { Check } from "@/icons/phosphor";
import { NetworkIcon } from "@/components/app";
import { relativeTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { InboxAvatar } from "./InboxAvatar";
import { itemAuthor, itemPreview, type InboxItem } from "./inbox-items";

export type InboxListRow = {
  item: InboxItem;
  needsReply: boolean;
};

/**
 * Left pane: one row per comment thread or DM conversation, newest first.
 * Rows are buttons in a listbox-like list; J/K (bound by the page) and
 * arrow keys move the selection.
 */
export function InboxList({
  rows,
  selectedKey,
  showStateMarks,
  onSelect,
  onMove,
}: {
  rows: InboxListRow[];
  selectedKey: string | null;
  /** In Replied/All views, mark which rows still need a reply. */
  showStateMarks: boolean;
  onSelect: (key: string) => void;
  onMove: (delta: 1 | -1) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the selected row in view when J/K moves past the edge.
  useEffect(() => {
    if (!selectedKey) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-item-key="${CSS.escape(selectedKey)}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  return (
    <ul
      ref={listRef}
      aria-label="Conversations"
      className="divide-y divide-border/70"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onMove(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          onMove(-1);
        }
      }}
    >
      {rows.map(({ item, needsReply }) => {
        const active = item.key === selectedKey;
        const author = itemAuthor(item);
        const handle = author.handle?.replace(/^@/, "") ?? null;
        const name = author.name?.trim() || (handle ? `@${handle}` : "Someone");
        const showHandle = handle && name.replace(/^@/, "").toLowerCase() !== handle.toLowerCase();
        const preview = itemPreview(item);
        const ago = relativeTime(item.at, { compact: true });
        const postLine =
          item.kind === "comment"
            ? (item.thread.comment.postSnippet || item.thread.comment.postContent || "").trim()
            : "";
        return (
          <li key={item.key}>
            <button
              type="button"
              data-item-key={item.key}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(item.key)}
              className={cn(
                "relative flex w-full gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
                active
                  ? "bg-accent/[0.08] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent"
                  : "hover:bg-bg-subtle",
              )}
            >
              <InboxAvatar
                profileImageUrl={author.avatarUrl}
                username={author.handle ?? author.name}
                platform={item.platform}
                size={32}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "min-w-0 truncate text-[13px] text-text",
                      needsReply ? "font-semibold" : "font-medium",
                    )}
                  >
                    {name}
                    {showHandle ? (
                      <span className="ml-1 font-normal text-text-muted">@{handle}</span>
                    ) : null}
                  </span>
                  <NetworkIcon network={item.platform} size={12} className="shrink-0 opacity-80" />
                  {item.kind === "dm" ? (
                    <span className="shrink-0 text-xs text-text-muted" title="Direct message">
                      DM
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 pl-1 text-xs tabular-nums text-text-muted">
                    {ago}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 line-clamp-2 text-[13px] leading-snug",
                    needsReply ? "text-text" : "text-text-muted",
                  )}
                >
                  {preview}
                </span>
                {postLine || (showStateMarks && !needsReply) ? (
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                    {showStateMarks && !needsReply ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5">
                        <Check size={12} weight="bold" aria-hidden />
                        Done
                      </span>
                    ) : null}
                    {postLine ? <span className="min-w-0 truncate">On “{postLine}”</span> : null}
                  </span>
                ) : null}
              </span>
              {showStateMarks && needsReply ? (
                <>
                  <span
                    aria-hidden
                    className="absolute right-4 bottom-3.5 h-2 w-2 rounded-full bg-accent"
                  />
                  <span className="sr-only">Needs reply</span>
                </>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
