import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowSquareOut,
  CircleNotch,
  Copy,
  Heart,
  EyeSlash,
  PencilSimple,
  WarningCircle,
} from "@/icons/phosphor";
import {
  likeInboxComment,
  type InboxAccount,
  type InboxComment,
} from "@/api/inbox";
import { RowActions, openComposer } from "@/components/app";
import { resolveInboxBody } from "@/lib/inbox-display";
import {
  inboxAuthorProfileUrl,
  inboxCommentPlatformUrl,
} from "@/lib/inbox-comment-url";
import {
  inboxCommentHideSupported,
  inboxCommentLikeSupported,
} from "@/lib/inbox-comment-status";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InboxAttachmentView } from "./InboxAttachmentView";
import { InboxAvatar } from "./InboxAvatar";
import { commentLikeView, type CommentLikeOverride } from "./use-comment-likes";

function quoteForComposer(comment: InboxComment): string {
  const handle = (comment.authorHandle ?? comment.authorName).replace(/^@/, "");
  const platform = PLATFORM_LABEL[comment.platform] ?? comment.platform;
  const body = comment.text.trim();
  if (!body) return "";
  return `Replying to @${handle} on ${platform}:\n\n"${body}"\n\n`;
}

function CommentBodyText({
  text,
  platform,
}: {
  text: string;
  platform: string;
}) {
  const parts = text.split(/(@[A-Za-z0-9_.]+)/g);
  return (
    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-text">
      {parts.map((part, i) => {
        if (!part.startsWith("@")) return <span key={i}>{part}</span>;
        const profileUrl = inboxAuthorProfileUrl({
          platform,
          authorHandle: part,
        });
        if (!profileUrl) {
          return (
            <span key={i} className="text-text-muted">
              {part}
            </span>
          );
        }
        return (
          <a
            key={i}
            href={profileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-text-muted transition-colors hover:text-accent"
          >
            {part}
          </a>
        );
      })}
    </p>
  );
}

const actionBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-text-muted transition-colors hover:bg-bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 touch:h-10";

export function InboxCommentCard({
  comment,
  account,
  allowReply,
  canReply,
  active,
  sending,
  failed,
  onReply,
  onRetry,
  onHide,
  likeOverride,
  onLiked,
}: {
  comment: InboxComment;
  account?: InboxAccount;
  allowReply: boolean;
  canReply: boolean;
  /** This comment is the current reply target. */
  active: boolean;
  sending: boolean;
  failed: boolean;
  onReply: () => void;
  onRetry?: () => void;
  /** Hide on the platform (parent handles the Undo window). */
  onHide?: (comment: InboxComment) => void;
  /** Page-level like state, so it survives switching threads and refetches. */
  likeOverride?: CommentLikeOverride;
  /** The platform accepted a like (true) or unlike (false). */
  onLiked: (comment: InboxComment, liked: boolean) => void;
}) {
  const when = comment.createdAt
    ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })
    : null;
  const own = Boolean(comment.isOwn);
  const avatarUrl = own
    ? account?.profileImageUrl ?? comment.authorAvatarUrl
    : comment.authorAvatarUrl;
  const body = resolveInboxBody(comment.text, comment.attachment);
  const handle = (comment.authorHandle ?? comment.authorName).replace(/^@/, "");
  const [liking, setLiking] = useState(false);
  const { liked, count: likeCount } = commentLikeView(comment, likeOverride);

  const isOptimistic = comment.id.startsWith("optimistic-");
  const canToggleLike =
    allowReply && !own && !isOptimistic && inboxCommentLikeSupported(comment.platform);
  const canHide =
    allowReply && !own && !isOptimistic && Boolean(onHide) &&
    inboxCommentHideSupported(comment.platform);

  const postUrl = inboxCommentPlatformUrl(comment);
  const authorProfileUrl = inboxAuthorProfileUrl({
    platform: comment.platform,
    authorHandle: comment.authorHandle,
  });
  const network = PLATFORM_LABEL[comment.platform] ?? comment.platform;

  const setLike = async (nextLiked: boolean, opts?: { undoable?: boolean }) => {
    if (!canToggleLike || liking) return;
    setLiking(true);
    try {
      const res = await likeInboxComment({
        publicationId: comment.publicationId,
        commentId: comment.id,
        unlike: !nextLiked,
      });
      if (!res.ok) {
        toast.error(`Couldn't ${nextLiked ? "like" : "unlike"} on ${network}: ${res.error}`);
        return;
      }
      // Recorded at page level with a functional update: the Undo toast
      // calls this from an older render.
      onLiked(comment, nextLiked);
      if (nextLiked && opts?.undoable) {
        toast(`Liked on ${network}`, {
          action: { label: "Undo", onClick: () => void setLike(false) },
        });
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : `Couldn't ${nextLiked ? "like" : "unlike"} on ${network}. Try again.`,
      );
    } finally {
      setLiking(false);
    }
  };

  const onCopyLink = async () => {
    if (!postUrl) return;
    try {
      await navigator.clipboard.writeText(postUrl);
      toast.message("Link copied");
    } catch {
      toast.error("Couldn't copy the link. Copy it from the address bar instead.");
    }
  };

  const onTurnIntoPost = () => {
    openComposer({ text: quoteForComposer(comment) });
  };

  return (
    <article
      data-comment-id={comment.id}
      className={cn(
        "group/row relative rounded-lg px-3 py-2.5 transition-colors",
        active ? "bg-accent/[0.06]" : own ? "bg-bg-subtle" : "hover:bg-bg-subtle/60",
        failed && "bg-danger-soft/50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <InboxAvatar
          profileImageUrl={avatarUrl}
          username={comment.authorHandle ?? comment.authorName}
          platform={comment.platform}
          size={32}
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-[13px] font-semibold text-text">
              {own ? "You" : comment.authorName}
            </p>
            {!own && comment.authorHandle ? (
              authorProfileUrl ? (
                <a
                  href={authorProfileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs text-text-muted transition-colors hover:text-accent"
                >
                  @{handle}
                </a>
              ) : (
                <p className="truncate text-xs text-text-muted">@{handle}</p>
              )
            ) : null}
            <p className="ml-auto flex shrink-0 items-center gap-1 text-xs tabular-nums text-text-muted">
              {sending ? (
                <>
                  <CircleNotch size={12} className="animate-spin motion-reduce:animate-none" />
                  Sending
                </>
              ) : (
                when
              )}
            </p>
          </div>
          {body.text ? <CommentBodyText text={body.text} platform={comment.platform} /> : null}
          {body.attachment ? (
            <InboxAttachmentView attachment={body.attachment} className="mt-2 max-w-sm" />
          ) : null}
          {failed && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1 rounded-md text-xs font-medium text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              <WarningCircle size={14} weight="fill" />
              Not sent · Retry
            </button>
          ) : null}
          <div className="-ml-2 mt-1.5 flex flex-wrap items-center gap-0.5">
            {canReply && allowReply && !own ? (
              <button
                type="button"
                onClick={onReply}
                aria-pressed={active}
                className={cn(actionBtn, active && "text-accent hover:text-accent")}
              >
                Reply
              </button>
            ) : null}
            {canToggleLike || liked || likeCount > 0 ? (
              <button
                type="button"
                onClick={() => void setLike(!liked, { undoable: true })}
                disabled={own || !canToggleLike || liking}
                className={cn(
                  actionBtn,
                  own && "cursor-default hover:bg-transparent",
                  (liked || liking) && "text-danger hover:text-danger",
                )}
                aria-pressed={own ? undefined : liked}
                aria-label={
                  own
                    ? `${likeCount} like${likeCount === 1 ? "" : "s"} on your reply`
                    : liked
                      ? "Unlike"
                      : "Like"
                }
              >
                {liking ? (
                  <CircleNotch size={15} className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Heart size={15} weight={liked || (own && likeCount > 0) ? "fill" : "regular"} />
                )}
                {likeCount > 0 ? <span className="tabular-nums">{likeCount}</span> : null}
                {!own ? <span className="sr-only sm:not-sr-only">{liked ? "Liked" : "Like"}</span> : null}
              </button>
            ) : null}
            <RowActions className="ml-auto gap-0.5">
            {canHide ? (
              <button
                type="button"
                onClick={() => onHide?.(comment)}
                className={actionBtn}
                title={`Hide this comment on ${network} for everyone else`}
              >
                <EyeSlash size={15} />
                <span className="sr-only sm:not-sr-only">Hide</span>
              </button>
            ) : null}
            {own && !isOptimistic ? (
              <button type="button" onClick={onTurnIntoPost} className={actionBtn}>
                <PencilSimple size={15} />
                Turn into a post
              </button>
            ) : null}
            {postUrl ? (
              <>
                <a
                  href={postUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(actionBtn, "w-8 justify-center px-0 touch:w-10")}
                  aria-label={`Open on ${network}`}
                  title={`Open on ${network}`}
                >
                  <ArrowSquareOut size={14} />
                </a>
                <button
                  type="button"
                  onClick={() => void onCopyLink()}
                  className={cn(actionBtn, "w-8 justify-center px-0 touch:w-10")}
                  aria-label="Copy link"
                  title="Copy link"
                >
                  <Copy size={14} />
                </button>
              </>
            ) : null}
            </RowActions>
          </div>
        </div>
      </div>
    </article>
  );
}
