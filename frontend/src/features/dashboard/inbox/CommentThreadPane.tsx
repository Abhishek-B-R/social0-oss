import { useMemo, useState, type RefObject } from "react";
import { EyeSlash, Eye } from "@/icons/phosphor";
import type { InboxAccount, InboxComment } from "@/api/inbox";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { formatInboxReplyText, inboxReplyDraftMax } from "@/lib/inbox-reply";
import {
  flattenInboxThread,
  treeFromFlatInbox,
  type InboxCommentTree,
} from "@/lib/inbox-thread";
import { AiDraftCard } from "./AiDraftCard";
import { useInboxAiDraft } from "./ai-draft";
import { InboxAvatar } from "./InboxAvatar";
import { InboxCommentCard } from "./InboxCommentCard";
import { InboxComposer, type InboxComposerPayload } from "./InboxComposer";
import { InboxPinnedPost } from "./InboxPostCard";
import { commentLikeKey, type CommentLikeOverride } from "./use-comment-likes";
import { ThreadHeader, headerBtn } from "./ThreadHeader";
import { atHandle, type CommentItem } from "./inbox-items";

function replyMax(platform: string): number {
  if (platform === "twitter_x") return 280;
  if (platform === "bluesky") return 300;
  if (platform === "threads") return 500;
  return 2000;
}

type Branch = InboxCommentTree<InboxComment>;

function CommentBranch({
  node,
  account,
  allowReply,
  canReply,
  targetId,
  sendingReplyIds,
  failedReplyIds,
  onPickTarget,
  onRetryReply,
  onHide,
  likeOverrides,
  onLiked,
}: {
  node: Branch;
  account?: InboxAccount;
  allowReply: boolean;
  canReply: boolean;
  targetId: string;
  sendingReplyIds: ReadonlySet<string>;
  failedReplyIds: ReadonlySet<string>;
  onPickTarget: (comment: InboxComment) => void;
  onRetryReply: (id: string) => void;
  onHide: (comment: InboxComment) => void;
  likeOverrides: ReadonlyMap<string, CommentLikeOverride>;
  onLiked: (comment: InboxComment, liked: boolean) => void;
}) {
  const comment = node.comment;
  return (
    <div>
      <InboxCommentCard
        comment={comment}
        account={account}
        allowReply={allowReply}
        canReply={canReply}
        active={targetId === comment.id}
        sending={sendingReplyIds.has(comment.id)}
        failed={failedReplyIds.has(comment.id)}
        onReply={() => onPickTarget(comment)}
        onHide={onHide}
        likeOverride={likeOverrides.get(commentLikeKey(comment))}
        onLiked={onLiked}
        onRetry={
          comment.isOwn && failedReplyIds.has(comment.id)
            ? () => onRetryReply(comment.id)
            : undefined
        }
      />
      {node.children.length > 0 ? (
        <div className="ml-4 mt-2 flex flex-col gap-2 border-l border-border pl-3 sm:ml-5 sm:pl-4">
          {node.children.map((child) => (
            <CommentBranch
              key={child.comment.id}
              node={child}
              account={account}
              allowReply={allowReply}
              canReply={canReply}
              targetId={targetId}
              sendingReplyIds={sendingReplyIds}
              failedReplyIds={failedReplyIds}
              onPickTarget={onPickTarget}
              onRetryReply={onRetryReply}
              onHide={onHide}
              likeOverrides={likeOverrides}
              onLiked={onLiked}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Right pane for a comment thread: the original post pinned on top, the
 * thread, then the reply bar naming where the reply goes.
 */
export function CommentThreadPane({
  item,
  account,
  allowReply,
  sendingReplyIds,
  failedReplyIds,
  hiddenCommentIds,
  likeOverrides,
  onLiked,
  done,
  canToggleDone,
  postHidden,
  postStats,
  replyInputRef,
  onToggleDone,
  onTogglePostHidden,
  onShowPostComments,
  onSend,
  onRetryReply,
  onHide,
  onBack,
}: {
  item: CommentItem;
  account?: InboxAccount;
  allowReply: boolean;
  sendingReplyIds: ReadonlySet<string>;
  failedReplyIds: ReadonlySet<string>;
  hiddenCommentIds: ReadonlySet<string>;
  likeOverrides: ReadonlyMap<string, CommentLikeOverride>;
  onLiked: (comment: InboxComment, liked: boolean) => void;
  done: boolean;
  canToggleDone: boolean;
  /** Post is hidden from Needs reply. */
  postHidden: boolean;
  postStats: { count: number; needsReply: number };
  replyInputRef: RefObject<HTMLTextAreaElement | null>;
  onToggleDone: () => void;
  onTogglePostHidden: () => void;
  onShowPostComments?: () => void;
  onSend: (uiParentId: string, payload: InboxComposerPayload) => void;
  onRetryReply: (id: string) => void;
  onHide: (comment: InboxComment) => void;
  onBack: () => void;
}) {
  const root = item.thread.comment;
  const network = PLATFORM_LABEL[root.platform] ?? root.platform;
  const brand = atHandle(account?.username ?? root.accountLabel);
  const destination = `Reply as ${brand ?? "your account"} on ${network}`;
  const [pickedTargetId, setPickedTargetId] = useState<string | null>(null);
  const draft = useInboxAiDraft(item.key);

  const replies = useMemo(
    () => item.thread.replies.filter((r) => !hiddenCommentIds.has(r.id)),
    [item.thread.replies, hiddenCommentIds],
  );
  const rootHidden = hiddenCommentIds.has(root.id);
  const tree = useMemo(
    () => treeFromFlatInbox(flattenInboxThread(root, replies)),
    [root, replies],
  );

  const all = [root, ...replies].filter((c) => !hiddenCommentIds.has(c.id));
  const defaultTarget =
    (!item.latest.isOwn && all.find((c) => c.id === item.latest.id)) ||
    (!root.isOwn && !rootHidden ? root : null) ||
    all.find((c) => !c.isOwn) ||
    null;
  const target =
    (pickedTargetId ? all.find((c) => c.id === pickedTargetId && !c.isOwn) : null) ??
    defaultTarget;
  const sending = [...sendingReplyIds].some((id) => all.some((c) => c.id === id));
  const canSend = root.canReply && allowReply && Boolean(target);
  const targetHandle = target
    ? `@${(target.authorHandle ?? target.authorName).replace(/^@/, "")}`
    : null;

  const pickTarget = (c: InboxComment) => {
    if (c.isOwn) return;
    setPickedTargetId(c.id);
    // Hand focus to the reply bar so typing goes there.
    requestAnimationFrame(() => replyInputRef.current?.focus());
  };

  const send = (text: string, extra?: Omit<InboxComposerPayload, "text">) => {
    if (!target) return;
    const formatted = formatInboxReplyText({
      platform: root.platform,
      targetHandle: target.authorHandle,
      isRoot: false,
      text,
    });
    onSend(target.id, { ...extra, text: formatted });
  };

  return (
    <>
      <ThreadHeader
        avatar={
          <InboxAvatar
            profileImageUrl={item.latest.authorAvatarUrl}
            username={item.latest.authorHandle ?? item.latest.authorName}
            platform={root.platform}
            size={32}
          />
        }
        title={item.latest.isOwn ? "Your reply" : item.latest.authorName}
        subtitle={`Comment · ${network}${brand ? ` · ${brand}` : ""}`}
        done={done}
        replied={item.answered}
        canToggleDone={canToggleDone}
        onToggleDone={onToggleDone}
        onBack={onBack}
      >
        <button
          type="button"
          onClick={onTogglePostHidden}
          className={headerBtn}
          title={
            postHidden
              ? "Show this post's comments in Needs reply again"
              : "Stop showing this post's comments in Needs reply"
          }
        >
          {postHidden ? <Eye size={15} aria-hidden /> : <EyeSlash size={15} aria-hidden />}
          <span className="sr-only">
            {postHidden ? "Show post in Needs reply" : "Hide post from Needs reply"}
          </span>
        </button>
      </ThreadHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-3 p-2 sm:p-3">
          <InboxPinnedPost
            comment={root}
            accountLabel={account?.username ?? root.accountLabel}
            commentCount={postStats.count}
            needsReplyCount={postStats.needsReply}
            onShowAllComments={onShowPostComments}
          />
          {postHidden ? (
            <p className="px-3 text-xs text-text-muted">
              This post is hidden from Needs reply. Its comments still show under All.
            </p>
          ) : null}
          {rootHidden && replies.length === 0 ? (
            <p className="px-3 text-sm text-text-muted">You hid this comment.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {tree.map((node) =>
                rootHidden && node.comment.id === root.id ? (
                  <div key={node.comment.id} className="flex flex-col gap-2">
                    <p className="px-3 text-xs text-text-muted">You hid the first comment.</p>
                    {node.children.map((child) => (
                      <CommentBranch
                        key={child.comment.id}
                        node={child}
                        account={account}
                        allowReply={allowReply}
                        canReply={root.canReply}
                        targetId={target?.id ?? ""}
                        sendingReplyIds={sendingReplyIds}
                        failedReplyIds={failedReplyIds}
                        onPickTarget={pickTarget}
                        onRetryReply={onRetryReply}
                        onHide={onHide}
                        likeOverrides={likeOverrides}
                        onLiked={onLiked}
                      />
                    ))}
                  </div>
                ) : (
                  <CommentBranch
                    key={node.comment.id}
                    node={node}
                    account={account}
                    allowReply={allowReply}
                    canReply={root.canReply}
                    targetId={target?.id ?? ""}
                    sendingReplyIds={sendingReplyIds}
                    failedReplyIds={failedReplyIds}
                    onPickTarget={pickTarget}
                    onRetryReply={onRetryReply}
                    onHide={onHide}
                    likeOverrides={likeOverrides}
                    onLiked={onLiked}
                  />
                ),
              )}
            </div>
          )}
          <AiDraftCard
            draft={canSend ? draft : null}
            destination={destination}
            sending={sending}
            onApprove={(text) => send(text)}
            onDiscard={() => undefined}
          />
        </div>
      </div>

      {canSend && target ? (
        <InboxComposer
          key={item.key}
          platform={root.platform}
          mode="comment"
          inputRef={replyInputRef}
          maxLength={inboxReplyDraftMax({
            platform: root.platform,
            targetHandle: target.authorHandle,
            isRoot: false,
            limit: replyMax(root.platform),
          })}
          placeholder={`Reply to ${targetHandle}…`}
          sending={sending}
          destination={
            <>
              Reply as <span className="font-medium text-text">{brand ?? "your account"}</span>{" "}
              on {network}
            </>
          }
          replyTo={
            pickedTargetId && pickedTargetId !== defaultTarget?.id && targetHandle
              ? { name: targetHandle, onClear: () => setPickedTargetId(null) }
              : null
          }
          onSend={(payload) => send(payload.text, { file: payload.file, previewUrl: payload.previewUrl })}
        />
      ) : (
        <p className="shrink-0 border-t border-border px-4 py-3 text-sm text-text-muted">
          {!allowReply
            ? "Your role can read this thread but not reply. Ask a workspace admin for Member or Community access."
            : !root.canReply
              ? `Replying to ${network} comments from Social0 isn't available yet. Open the post on ${network} to reply there.`
              : "There's no comment from someone else to reply to here."}
        </p>
      )}
    </>
  );
}
