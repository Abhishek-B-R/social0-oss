import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowSquareOut, NoteBlank } from "@/icons/phosphor";
import { AccountPlatformMark } from "@/components/PlatformIcon";
import { PLATFORM_LABEL } from "@/lib/platforms";
import type { InboxComment } from "@/api/inbox";
import { cn } from "@/lib/utils";

export function InboxPostThumbnail({
  mediaUrl,
  content,
  platform,
  className,
  showMark = true,
}: {
  mediaUrl?: string | null;
  content?: string | null;
  platform: string;
  className?: string;
  showMark?: boolean;
}) {
  const isVideo = mediaUrl?.match(/\.(mp4|mov|webm)(\?|$)/i);
  return (
    <div className={cn("relative h-12 w-12 shrink-0", className)}>
      <div className="flex h-full w-full overflow-hidden rounded-lg border border-border bg-bg-muted">
        {mediaUrl ? (
          isVideo ? (
            <video src={mediaUrl} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img
              src={mediaUrl}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          )
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-text-subtle"
            title={content?.slice(0, 120) || "Text post"}
          >
            <NoteBlank size={18} weight="regular" aria-hidden />
            <span className="sr-only">Text post</span>
          </span>
        )}
      </div>
      {showMark ? <AccountPlatformMark platform={platform} compact /> : null}
    </div>
  );
}

/**
 * The post a comment thread belongs to, pinned above the thread for
 * context. Long captions collapse; "Show all" expands in place.
 */
export function InboxPinnedPost({
  comment,
  accountLabel,
  commentCount,
  needsReplyCount,
  onShowAllComments,
  className,
}: {
  comment: InboxComment;
  accountLabel?: string | null;
  /** Comment threads on this post currently loaded. */
  commentCount?: number;
  needsReplyCount?: number;
  /** Filter the list to this post's comments. */
  onShowAllComments?: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const network = PLATFORM_LABEL[comment.platform] ?? comment.platform;
  const when = comment.postPublishedAt
    ? formatDistanceToNow(new Date(comment.postPublishedAt), { addSuffix: true })
    : null;
  const handle = (accountLabel ?? comment.accountLabel ?? "").replace(/^@/, "");
  const caption = (comment.postContent || comment.postSnippet || "").trim();
  const long = caption.length > 140 || caption.split("\n").length > 2;

  return (
    <article
      aria-label="Original post"
      className={cn("flex gap-3 border-b border-border px-3 pb-4", className)}
    >
      {comment.postMediaUrl ? (
        <InboxPostThumbnail
          mediaUrl={comment.postMediaUrl}
          content={caption}
          platform={comment.platform}
          className="h-14 w-14"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-muted">
          Comment on your post
          {when ? ` · published ${when}` : ""}
        </p>
        {caption ? (
          <p
            className={cn(
              "mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-snug text-text",
              !expanded && "line-clamp-2",
            )}
          >
            {caption}
          </p>
        ) : (
          <p className="mt-0.5 text-[13px] text-text-muted">(No caption)</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          <span>
            {network}
            {handle ? ` · @${handle}` : ""}
          </span>
          {long ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="font-medium text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              {expanded ? "Show less" : "Show all"}
            </button>
          ) : null}
          {onShowAllComments && commentCount && commentCount > 1 ? (
            <button
              type="button"
              onClick={onShowAllComments}
              className="font-medium text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              All {commentCount} comments on this post
              {needsReplyCount
                ? ` · ${needsReplyCount} ${needsReplyCount === 1 ? "needs" : "need"} a reply`
                : ""}
            </button>
          ) : null}
        </div>
      </div>
      {comment.platformPostUrl ? (
        <a
          href={comment.platformPostUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 shrink-0 items-center gap-1 self-start rounded-lg px-2 text-xs font-medium text-text-muted transition-colors hover:bg-bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Open
          <ArrowSquareOut size={12} aria-hidden />
          <span className="sr-only">post on {network}</span>
        </a>
      ) : null}
    </article>
  );
}
