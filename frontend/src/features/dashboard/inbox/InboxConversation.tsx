import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowSquareOut } from "@/icons/phosphor";
import type { InboxAccount, InboxComment, InboxThread } from "@/api/inbox";
import { PLATFORM_LABEL } from "@/lib/platforms";
import {
  formatInboxReplyText,
  inboxReplyDraftMax,
} from "@/lib/inbox-reply";
import {
  visibleInboxComments,
  type InboxCommentStatusFilter,
} from "@/lib/inbox-comment-status";
import {
  flattenInboxThread,
  treeFromFlatInbox,
  type InboxCommentTree,
} from "@/lib/inbox-thread";
import { InboxAvatar } from "./InboxAvatar";
import { InboxCommentCard } from "./InboxCommentCard";
import { InboxComposer, type InboxComposerPayload } from "./InboxComposer";
import { InboxPostCard } from "./InboxPostCard";

function replyMax(platform: string): number {
  if (platform === "twitter_x") return 280;
  if (platform === "bluesky") return 300;
  if (platform === "threads") return 500;
  return 2000;
}

type BranchNode = InboxCommentTree<InboxComment>;

function CommentBranch({
  node,
  account,
  allowReply,
  canReply,
  replyTargetId,
  sendingReplyIds,
  failedReplyIds,
  composer,
  onReply,
  onRetryReply,
}: {
  node: BranchNode;
  account?: InboxAccount;
  allowReply: boolean;
  canReply: boolean;
  replyTargetId: string;
  sendingReplyIds: Set<string>;
  failedReplyIds: Set<string>;
  composer: ReactNode;
  onReply: (comment: InboxComment) => void;
  onRetryReply: (id: string) => void;
}) {
  const comment = node.comment;
  const showTail = node.children.length > 0 || comment.id === replyTargetId;
  return (
    <div>
      <InboxCommentCard
        comment={comment}
        account={account}
        allowReply={allowReply}
        canReply={canReply}
        active={replyTargetId === comment.id}
        sending={sendingReplyIds.has(comment.id)}
        failed={failedReplyIds.has(comment.id)}
        onReply={() => onReply(comment)}
        onRetry={
          comment.isOwn && failedReplyIds.has(comment.id)
            ? () => onRetryReply(comment.id)
            : undefined
        }
      />
      {showTail ? (
        <div className="relative ml-[18px] border-l border-border/80 pl-5 pt-3">
          {node.children.length > 0 ? (
            <div className="flex flex-col gap-3">
              {node.children.map((child) => (
                <CommentBranch
                  key={child.comment.id}
                  node={child}
                  account={account}
                  allowReply={allowReply}
                  canReply={canReply}
                  replyTargetId={replyTargetId}
                  sendingReplyIds={sendingReplyIds}
                  failedReplyIds={failedReplyIds}
                  composer={composer}
                  onReply={onReply}
                  onRetryReply={onRetryReply}
                />
              ))}
            </div>
          ) : null}
          {comment.id === replyTargetId ? (
            <div className={node.children.length ? "mt-3" : ""}>{composer}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function defaultReplyTarget(threads: InboxThread[]): InboxComment | null {
  return (
    threads.find((t) => !t.comment.isOwn && !t.replies.some((r) => r.isOwn))
      ?.comment ??
    threads[0]?.comment ??
    null
  );
}

function commentsIn(threads: InboxThread[]): InboxComment[] {
  return threads.flatMap((t) => [t.comment, ...t.replies]);
}

export function InboxConversation({
  threads,
  accounts,
  allowReply,
  statusFilter,
  seen,
  sendingReplyIds,
  failedReplyIds,
  highlightCommentId,
  onBack,
  onReply,
  onRetryReply,
}: {
  threads: InboxThread[];
  accounts: InboxAccount[];
  allowReply: boolean;
  statusFilter: InboxCommentStatusFilter;
  seen: { seeded: boolean; ids: ReadonlySet<string> };
  sendingReplyIds: Set<string>;
  failedReplyIds: Set<string>;
  highlightCommentId?: string | null;
  onBack: () => void;
  onReply: (
    uiParentId: string,
    payload: InboxComposerPayload,
    optimisticId?: string,
  ) => void;
  onRetryReply: (optimisticId: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const root = threads[0]?.comment;
  const account = root
    ? accounts.find((a) => a.id === root.accountId)
    : undefined;
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const fallbackTarget = defaultReplyTarget(threads);
  const target =
    commentsIn(threads).find((c) => c.id === replyTargetId) ?? fallbackTarget;

  useEffect(() => {
    if (!highlightCommentId) return;
    highlightRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [highlightCommentId, reduceMotion]);

  const totalComments = threads.reduce(
    (n, t) => n + 1 + t.replies.length,
    0,
  );
  const repliedCount = threads.filter(
    (t) => t.comment.isOwn || t.replies.some((r) => r.isOwn),
  ).length;
  const sending = sendingReplyIds.size > 0;

  if (!root || !target) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-muted">
        Select a post
      </div>
    );
  }

  const composer =
    root.canReply && allowReply ? (
      <InboxComposer
        key={`${root.publicationId}-${target.id}`}
        platform={root.platform}
        mode="comment"
        variant="thread"
        avatar={
          <InboxAvatar
            profileImageUrl={account?.profileImageUrl}
            username={account?.username ?? root.accountLabel}
            platform={root.platform}
            size={32}
          />
        }
        maxLength={inboxReplyDraftMax({
          platform: root.platform,
          targetHandle: target.authorHandle,
          isRoot: false,
          limit: replyMax(root.platform),
        })}
        placeholder={`Reply to @${(target.authorHandle ?? target.authorName).replace(/^@/, "")}...`}
        sending={sending}
        replyTo={{
          name: `@${(target.authorHandle ?? target.authorName).replace(/^@/, "")}`,
          onClear: () => setReplyTargetId(fallbackTarget?.id ?? root.id),
        }}
        onSend={(payload) => {
          const text = formatInboxReplyText({
            platform: root.platform,
            targetHandle: target.authorHandle,
            isRoot: false,
            text: payload.text,
          });
          onReply(target.id, { ...payload, text });
        }}
      />
    ) : null;

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/80 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-subtle hover:text-text active:scale-[0.97] lg:hidden"
          aria-label="Back to list"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold tracking-tight text-text">
            {PLATFORM_LABEL[root.platform] ?? root.platform}
            {root.accountLabel
              ? ` · @${root.accountLabel.replace(/^@/, "")}`
              : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {repliedCount} replied / {totalComments} total comments
            {` · Includes replies via ${PLATFORM_LABEL[root.platform] ?? root.platform}`}
          </p>
        </div>
        {root.platformPostUrl ? (
          <a
            href={root.platformPostUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-subtle hover:text-accent active:scale-[0.97]"
            aria-label="View post"
          >
            <ArrowSquareOut size={14} />
          </a>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border/80 p-3 sm:p-4">
          <InboxPostCard
            comment={root}
            accountLabel={account?.username ?? root.accountLabel}
            accountProfileImageUrl={account?.profileImageUrl}
          />
        </div>

        <div className="flex flex-col gap-6 px-3 py-4 sm:px-4">
          {threads.map((thread) => {
            const flat = flattenInboxThread(thread.comment, thread.replies);
            const visible = visibleInboxComments(flat, statusFilter, seen);
            if (!visible.length) return null;
            const tree = treeFromFlatInbox(visible);
            return (
              <div
                key={thread.comment.id}
                ref={
                  highlightCommentId === thread.comment.id
                    ? highlightRef
                    : undefined
                }
              >
                {tree.map((node) => (
                  <CommentBranch
                    key={node.comment.id}
                    node={node}
                    account={account}
                    allowReply={allowReply}
                    canReply={root.canReply}
                    replyTargetId={target.id}
                    sendingReplyIds={sendingReplyIds}
                    failedReplyIds={failedReplyIds}
                    composer={composer}
                    onReply={(comment) => {
                      if (comment.isOwn) return;
                      setReplyTargetId(comment.id);
                    }}
                    onRetryReply={onRetryReply}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {root.canReply && allowReply ? null : (
        <p className="shrink-0 border-t border-border px-4 py-3 text-sm text-text-muted">
          {allowReply
            ? `Replies aren't available for ${PLATFORM_LABEL[root.platform] ?? root.platform} yet.`
            : "Your role can view this thread but not reply."}
        </p>
      )}
    </>
  );
}
