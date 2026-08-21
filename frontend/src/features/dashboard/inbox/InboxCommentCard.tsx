import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowSquareOut,
  CircleNotch,
  Copy,
  Heart,
  PencilSimple,
  WarningCircle,
  X,
} from "@/icons/phosphor";
import {
  hideInboxComment,
  likeInboxComment,
  type InboxAccount,
  type InboxComment,
} from "@/api/inbox";
import { resolveInboxBody } from "@/lib/inbox-display";
import {
  inboxCommentHideSupported,
  inboxCommentLikeSupported,
} from "@/lib/inbox-comment-status";
import { setComposerPayload } from "@/lib/composer-bridge";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InboxAttachmentView } from "./InboxAttachmentView";
import { InboxAvatar } from "./InboxAvatar";

function quoteForComposer(comment: InboxComment): string {
  const handle = (comment.authorHandle ?? comment.authorName).replace(/^@/, "");
  const platform = PLATFORM_LABEL[comment.platform] ?? comment.platform;
  const body = comment.text.trim();
  if (!body) return "";
  return `Replying to @${handle} on ${platform}:\n\n"${body}"\n\n`;
}

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
  onHidden,
}: {
  comment: InboxComment;
  account?: InboxAccount;
  allowReply: boolean;
  canReply: boolean;
  active: boolean;
  sending: boolean;
  failed: boolean;
  onReply: () => void;
  onRetry?: () => void;
  onHidden?: (commentId: string) => void;
}) {
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const when = comment.createdAt
    ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })
    : null;
  const own = Boolean(comment.isOwn);
  const avatarUrl = own
    ? account?.profileImageUrl ?? comment.authorAvatarUrl
    : comment.authorAvatarUrl;
  const body = resolveInboxBody(comment.text, comment.attachment);
  const handle = (comment.authorHandle ?? comment.authorName).replace(/^@/, "");
  const [likeOverride, setLikeOverride] = useState<{
    id: string;
    liked: boolean;
    count: number;
  } | null>(null);
  const [liking, setLiking] = useState(false);
  const [hiding, setHiding] = useState(false);
  const liked =
    likeOverride?.id === comment.id
      ? likeOverride.liked
      : Boolean(comment.likedByMe);
  const likeCount =
    likeOverride?.id === comment.id
      ? likeOverride.count
      : (comment.likeCount ?? 0);

  const canLike =
    allowReply &&
    !own &&
    inboxCommentLikeSupported(comment.platform) &&
    !liked;

  const canHide =
    allowReply &&
    !own &&
    inboxCommentHideSupported(comment.platform);

  const postUrl = comment.platformPostUrl;

  const onLike = async () => {
    if (!canLike || liking) return;
    setLiking(true);
    try {
      const res = await likeInboxComment({
        publicationId: comment.publicationId,
        commentId: comment.id,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setLikeOverride({
        id: comment.id,
        liked: true,
        count: (comment.likeCount ?? 0) + 1,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Like failed");
    } finally {
      setLiking(false);
    }
  };

  const onHide = async () => {
    if (!canHide || hiding) return;
    setHiding(true);
    try {
      const res = await hideInboxComment({
        publicationId: comment.publicationId,
        commentId: comment.id,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.message("Comment hidden", {
        description: "Hidden on the platform for other viewers.",
      });
      onHidden?.(comment.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hide failed");
    } finally {
      setHiding(false);
    }
  };

  const onCopyLink = async () => {
    if (!postUrl) return;
    try {
      await navigator.clipboard.writeText(postUrl);
      toast.message("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const onCreatePost = () => {
    const text = quoteForComposer(comment);
    setComposerPayload({ text, isThread: false, media: [] });
    navigate(dash("/create/text"));
  };

  return (
    <article
      className={cn(
        "relative rounded-2xl border bg-bg-elevated p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,border-color,box-shadow] duration-150 ease-out",
        active
          ? "border-accent/25 bg-accent/[0.04]"
          : "border-black/[0.06] dark:border-white/[0.08]",
        own && !active && "bg-bg-subtle/40",
        failed && "border-red-500/25 bg-red-500/[0.04]",
      )}
    >
      {canHide ? (
        <button
          type="button"
          onClick={() => void onHide()}
          disabled={hiding}
          className="absolute -left-2 -top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-muted shadow-sm transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-subtle hover:text-text active:scale-[0.97] disabled:opacity-60"
          aria-label="Hide comment"
          title="Hide comment on platform"
        >
          {hiding ? (
            <CircleNotch size={12} className="animate-spin" />
          ) : (
            <X size={12} weight="bold" />
          )}
        </button>
      ) : null}
      <div className="flex min-w-0 flex-col">
        <div className="flex items-start gap-2.5">
          <InboxAvatar
            profileImageUrl={avatarUrl}
            username={comment.authorHandle ?? comment.authorName}
            platform={comment.platform}
            size={36}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-[13px] font-semibold tracking-tight text-text">
                {own ? "You" : comment.authorName}
              </p>
              {!own && comment.authorHandle ? (
                <p className="truncate text-[12px] text-text-muted">
                  @{handle}
                </p>
              ) : null}
              {own ? (
                <button
                  type="button"
                  onClick={onCreatePost}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-accent transition-[background-color,transform] duration-150 ease-out hover:bg-accent/10 active:scale-[0.97]"
                >
                  <PencilSimple size={12} />
                  Create a Post
                </button>
              ) : null}
              <p className="ml-auto flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-text-muted">
                {sending ? (
                  <CircleNotch size={12} className="animate-spin" />
                ) : null}
                {when}
              </p>
            </div>
            {body.text ? (
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-[1.45] tracking-[-0.01em] text-text">
                {body.text}
              </p>
            ) : null}
            {body.attachment ? (
              <InboxAttachmentView
                attachment={body.attachment}
                className="mt-2 max-w-sm"
              />
            ) : null}
            {failed && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-red-500 transition-[transform,color] duration-150 ease-out hover:text-red-400 active:scale-[0.97]"
              >
                <WarningCircle size={14} weight="fill" />
                Failed · Retry
              </button>
            ) : null}
            <div className="mt-2.5 flex items-center gap-1">
              {canLike || liked || likeCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void onLike()}
                  disabled={own || !canLike || liking}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-1.5 text-text-muted transition-[transform,color,background-color] duration-150 ease-out",
                    own
                      ? "cursor-default"
                      : "hover:bg-rose-500/10 hover:text-rose-500 active:scale-[0.97]",
                    liked && "text-rose-500",
                  )}
                  aria-label={
                    own
                      ? `${likeCount} like${likeCount === 1 ? "" : "s"} on your reply`
                      : liked
                        ? "Liked"
                        : "Like comment"
                  }
                >
                  {liking ? (
                    <CircleNotch size={16} className="animate-spin" />
                  ) : (
                    <Heart
                      size={16}
                      weight={
                        liked || (own && likeCount > 0) ? "fill" : "regular"
                      }
                    />
                  )}
                  {likeCount > 0 ? (
                    <span className="text-[12px] tabular-nums">{likeCount}</span>
                  ) : null}
                </button>
              ) : null}
              {canReply && allowReply && !own ? (
                <button
                  type="button"
                  onClick={onReply}
                  className={cn(
                    "h-8 rounded-full px-2.5 text-[13px] font-semibold transition-[transform,color,background-color] duration-150 ease-out active:scale-[0.97]",
                    active
                      ? "text-accent"
                      : "text-text-muted hover:bg-bg-subtle hover:text-text",
                  )}
                >
                  Reply
                </button>
              ) : null}
              <span className="ml-auto flex items-center gap-0.5">
                {postUrl ? (
                  <>
                    <a
                      href={postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-subtle hover:text-accent active:scale-[0.97]"
                      aria-label="Open post"
                      title="Open post"
                    >
                      <ArrowSquareOut size={14} />
                    </a>
                    <button
                      type="button"
                      onClick={() => void onCopyLink()}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-subtle hover:text-text active:scale-[0.97]"
                      aria-label="Copy link"
                      title="Copy link"
                    >
                      <Copy size={14} />
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
