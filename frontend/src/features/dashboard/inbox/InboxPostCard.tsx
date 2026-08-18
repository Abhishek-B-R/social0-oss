import { formatDistanceToNow } from "date-fns";
import { ArrowSquareOut } from "@/icons/phosphor";
import { PlatformIcon } from "@/components/PlatformIcon";
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
      className={cn(
        "relative flex h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-bg-muted",
        className,
      )}
    >
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
        <span className="line-clamp-3 p-1 text-[8px] leading-tight text-text-muted">
          {content?.slice(0, 60) || "Post"}
        </span>
      )}
      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-bg bg-bg-elevated shadow-sm">
        <PlatformIcon platform={platform} size={10} />
      </span>
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
        "rounded-xl border border-border bg-bg-subtle/40 p-3 sm:p-4",
        className,
      )}
    >
      <div className="flex gap-3">
        <InboxPostThumbnail
          mediaUrl={comment.postMediaUrl}
          content={comment.postContent}
          platform={comment.platform}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <InboxAvatar
              profileImageUrl={accountProfileImageUrl ?? comment.postAccountImageUrl}
              username={handle}
              platform={comment.platform}
              size={24}
            />
            <span className="text-[13px] font-semibold text-text">
              {handle ? `@${handle.replace(/^@/, "")}` : "Your post"}
            </span>
            <span className="text-[11px] text-text-muted">
              {PLATFORM_LABEL[comment.platform] ?? comment.platform}
            </span>
            {when ? <span className="text-[11px] text-text-muted">· {when}</span> : null}
            {comment.platformPostUrl ? (
              <a
                href={comment.platformPostUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-text-muted hover:text-accent"
              >
                View post
                <ArrowSquareOut size={11} />
              </a>
            ) : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-text">
            {comment.postContent || comment.postSnippet}
          </p>
        </div>
      </div>
    </article>
  );
}
