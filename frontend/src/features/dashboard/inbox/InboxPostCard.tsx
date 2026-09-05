import { formatDistanceToNow } from "date-fns";
import { ArrowSquareOut, NoteBlank } from "@/icons/phosphor";
import { AccountPlatformMark } from "@/components/PlatformIcon";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { InboxAvatar } from "./InboxAvatar";
import type { InboxComment } from "@/api/inbox";
import { cn } from "@/lib/utils";

export function InboxPostThumbnail({
  mediaUrl,
  content,
  platform,
  className,
}: {
  mediaUrl?: string | null;
  content?: string | null;
  platform: string;
  className?: string;
}) {
  const isVideo = mediaUrl?.match(/\.(mp4|mov|webm)(\?|$)/i);
  return (
    <div
      className={cn("relative h-12 w-12 shrink-0", className)}
    >
      <div className="flex h-full w-full overflow-hidden rounded-lg border border-border bg-bg-muted">
        {mediaUrl ? (
          isVideo ? (
            <video
              src={mediaUrl}
              className="h-full w-full object-cover"
              muted
              playsInline
            />
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
      <AccountPlatformMark platform={platform} compact />
    </div>
  );
}

export function InboxPostCard({
  comment,
  accountLabel,
  accountProfileImageUrl,
  className,
}: {
  comment: InboxComment;
  accountLabel?: string | null;
  accountProfileImageUrl?: string | null;
  className?: string;
}) {
  const when = comment.postPublishedAt
    ? formatDistanceToNow(new Date(comment.postPublishedAt), { addSuffix: true })
    : null;
  const handle = accountLabel ?? comment.accountLabel;

  return (
    <article
      className={cn(
        "rounded-2xl border border-black/[0.06] bg-bg-elevated p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.08]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <InboxAvatar
          profileImageUrl={accountProfileImageUrl ?? comment.postAccountImageUrl}
          username={handle}
          platform={comment.platform}
          size={36}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-[13px] font-semibold tracking-tight text-text">
              {handle ? `@${handle.replace(/^@/, "")}` : "Your post"}
            </p>
            {when ? (
              <p className="ml-auto shrink-0 text-[11px] tabular-nums text-text-muted">
                {when}
              </p>
            ) : null}
          </div>
          <p className="text-[11px] text-text-muted">
            {PLATFORM_LABEL[comment.platform] ?? comment.platform}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-[1.45] tracking-[-0.01em] text-text">
            {comment.postContent || comment.postSnippet}
          </p>
          {comment.postMediaUrl ? (
            <div className="mt-3 max-w-[12rem]">
              <InboxPostThumbnail
                mediaUrl={comment.postMediaUrl}
                content={comment.postContent}
                platform={comment.platform}
                className="h-24 w-full rounded-xl"
              />
            </div>
          ) : null}
          {comment.platformPostUrl ? (
            <a
              href={comment.platformPostUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-medium text-text-muted transition-colors hover:text-accent"
            >
              View post
              <ArrowSquareOut size={11} />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
