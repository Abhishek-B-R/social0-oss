import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "@/components/AppLink";
import {
  ArrowLeft,
  ArrowSquareOut,
  ChatCircle,
  CircleNotch,
  WarningCircle,
} from "@/icons/phosphor";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import type { AnalyticsAccount } from "@/api/analytics";
import {
  listInboxComments,
  replyToInboxComment,
  type InboxComment,
  type InboxListResult,
  type InboxThread,
} from "@/api/inbox";
import {
  PLATFORM_LABEL,
  formatRangeLabel,
} from "@/features/dashboard/analytics/analytics-utils";
import {
  WINDOW_EMPTY_LABEL,
  windowQueryParams,
  type DateWindow,
} from "@/lib/date-window";
import {
  inboxReplyTargetId,
  inboxSupportsNestedReplies,
} from "@/lib/inbox-reply";
import { uploadFile } from "@/lib/upload-file";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InboxAttachmentView } from "./InboxAttachmentView";
import { InboxAvatar } from "./InboxAvatar";
import { InboxComposer, type InboxComposerPayload } from "./InboxComposer";
import { InboxPostCard, InboxPostThumbnail } from "./InboxPostCard";

function threadKey(thread: InboxThread): string {
  return `${thread.comment.publicationId}-${thread.comment.id}`;
}

function replyMax(platform: string): number {
  if (platform === "twitter_x") return 280;
  if (platform === "bluesky") return 300;
  if (platform === "threads") return 500;
  return 2000;
}

type RetryPayload = InboxComposerPayload & { parentCommentId: string };

function appendOptimisticReply(
  data: InboxListResult,
  args: {
    publicationId: string;
    parentCommentId: string;
    text: string;
    replyId?: string;
    accountLabel: string | null;
    accountProfileImageUrl?: string | null;
    attachment?: InboxComment["attachment"];
    sendStatus?: "sending" | "failed";
    root: InboxComment;
  },
): InboxListResult {
  const id = args.replyId ?? `optimistic-${Date.now()}`;
  const threads = data.threads.map((thread) => {
    const root = thread.comment;
    const inThread =
      root.publicationId === args.publicationId &&
      (root.id === args.parentCommentId ||
        thread.replies.some((r) => r.id === args.parentCommentId));
    if (!inThread) return thread;
    if (thread.replies.some((r) => r.id === id)) return thread;
    const next: InboxComment = {
      id,
      platform: root.platform,
      accountId: root.accountId,
      accountLabel: args.accountLabel,
      postId: root.postId,
      publicationId: args.publicationId,
      platformPostId: root.platformPostId,
      platformPostUrl: root.platformPostUrl,
      postSnippet: root.postSnippet,
      postContent: root.postContent,
      postMediaUrl: root.postMediaUrl,
      postPublishedAt: root.postPublishedAt,
      postAccountImageUrl: root.postAccountImageUrl,
      authorName: "You",
      authorHandle: args.accountLabel,
      authorAvatarUrl: args.accountProfileImageUrl,
      text: args.text,
      attachment: args.attachment,
      createdAt: new Date().toISOString(),
      parentId: args.parentCommentId,
      canReply: false,
      isOwn: true,
    };
    return { ...thread, replies: [...thread.replies, next] };
  });
  return { ...data, threads };
}

type CommentNode = {
  comment: InboxComment;
  children: CommentNode[];
};

function buildReplyTree(
  root: InboxComment,
  replies: InboxComment[],
  platform: string,
): CommentNode[] {
  const sorted = [...replies].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  if (!inboxSupportsNestedReplies(platform)) {
    return sorted.map((comment) => ({ comment, children: [] }));
  }
  const nodes = new Map<string, CommentNode>();
  for (const comment of sorted) {
    nodes.set(comment.id, { comment, children: [] });
  }
  const tops: CommentNode[] = [];
  for (const comment of sorted) {
    const node = nodes.get(comment.id)!;
    const parentId = comment.parentId;
    if (parentId && parentId !== root.id && nodes.has(parentId)) {
      nodes.get(parentId)!.children.push(node);
    } else {
      tops.push(node);
    }
  }
  return tops;
}

export function InboxCommentsPane({
  dateWindow,
  accountId,
  accounts,
  enabled,
}: {
  dateWindow: DateWindow;
  accountId: string | null;
  accounts: AnalyticsAccount[];
  enabled: boolean;
}) {
  const dash = useDashboardPath();
  const qc = useQueryClient();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [sentTick, setSentTick] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const queryKey = ["inbox-comments", dateWindow, accountId] as const;

  const inboxQuery = useQuery({
    queryKey,
    queryFn: () =>
      listInboxComments({
        ...windowQueryParams(dateWindow),
        accountId: accountId || undefined,
      }),
    enabled,
    staleTime: 30_000,
  });

  const [failedReplyIds, setFailedReplyIds] = useState<Set<string>>(new Set());
  const [sendingReplyIds, setSendingReplyIds] = useState<Set<string>>(new Set());
  const retryPayloads = useRef(new Map<string, RetryPayload>());

  const sendReply = async (
    thread: InboxThread,
    uiParentId: string,
    payload: InboxComposerPayload,
    opts?: { optimisticId?: string },
  ) => {
    const root = thread.comment;
    const apiCommentId = inboxReplyTargetId(root.platform, root.id, uiParentId);
    const optimisticId = opts?.optimisticId ?? `optimistic-${Date.now()}`;
    const account =
      accounts.find((a) => a.id === accountId) ??
      accounts.find((a) => a.id === root.accountId);
    const attachment =
      payload.file && payload.previewUrl
        ? {
            type: (payload.file.type.startsWith("video/") ? "video" : "image") as
              | "image"
              | "video",
            url: payload.previewUrl,
          }
        : null;

    if (!opts?.optimisticId) {
      retryPayloads.current.set(optimisticId, {
        ...payload,
        parentCommentId: uiParentId,
      });
      qc.setQueryData<InboxListResult>(queryKey, (old) => {
        if (!old) return old;
        return appendOptimisticReply(old, {
          publicationId: root.publicationId,
          parentCommentId: uiParentId,
          text: payload.text,
          replyId: optimisticId,
          accountLabel: account?.username ?? null,
          accountProfileImageUrl: account?.profileImageUrl,
          attachment,
          root,
        });
      });
    }
    setSendingReplyIds((s) => new Set(s).add(optimisticId));
    setFailedReplyIds((s) => {
      const next = new Set(s);
      next.delete(optimisticId);
      return next;
    });

    try {
      let mediaId: string | undefined;
      if (payload.file) {
        const uploaded = await uploadFile(payload.file, 0);
        mediaId = uploaded.id;
      }
      const res = await replyToInboxComment({
        publicationId: root.publicationId,
        commentId: apiCommentId,
        text: payload.text,
        mediaId,
      });
      if (!res.ok) {
        setFailedReplyIds((s) => new Set(s).add(optimisticId));
        toast.error(res.error);
        return;
      }
      setSentTick((n) => n + 1);
      retryPayloads.current.delete(optimisticId);
      qc.setQueryData<InboxListResult>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          threads: old.threads.map((t) => ({
            ...t,
            replies: t.replies.map((r) =>
              r.id === optimisticId ? { ...r, id: res.replyId ?? r.id } : r,
            ),
          })),
        };
      });
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["inbox-comments"] });
      }, 2500);
    } catch (e) {
      setFailedReplyIds((s) => new Set(s).add(optimisticId));
      toast.error(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setSendingReplyIds((s) => {
        const next = new Set(s);
        next.delete(optimisticId);
        return next;
      });
    }
  };

  const data = inboxQuery.data;
  const threads = (data?.threads ?? []).filter((t) => !t.comment.isOwn);

  useEffect(() => {
    if (!data?.threads?.length) {
      setPickedId(null);
      return;
    }
    const keys = data.threads.map(threadKey);
    if (!pickedId || !keys.includes(pickedId)) {
      setPickedId(keys[0] ?? null);
    }
  }, [data?.threads, pickedId]);

  const loading = inboxQuery.isLoading || inboxQuery.isFetching;
  const selected =
    threads.find((t) => threadKey(t) === pickedId) ?? threads[0] ?? null;
  const emptyRangeLabel =
    dateWindow.range === "custom"
      ? "this range"
      : WINDOW_EMPTY_LABEL[dateWindow.range];
  const showList = !mobileDetail;
  const showDetail = mobileDetail || Boolean(selected);

  return (
    <>
      {data?.accountsNeedingReconnect?.length ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <span className="font-medium">Reconnect for comments: </span>
          {data.accountsNeedingReconnect
            .map(
              (a) =>
                `${PLATFORM_LABEL[a.platform] ?? a.platform}${a.username ? ` @${a.username}` : ""}`,
            )
            .join(" · ")}
          {" · "}
          <Link
            href={dash("connections")}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Connections
          </Link>
        </div>
      ) : null}

      {inboxQuery.isError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
          {inboxQuery.error instanceof Error
            ? inboxQuery.error.message
            : "Failed to load comments"}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="h-full min-h-[20rem] animate-pulse bg-bg-muted/60" />
          <div className="hidden h-full animate-pulse bg-bg-muted/40 lg:block" />
        </div>
      ) : !data || threads.length === 0 ? (
        <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated px-6 text-center">
          <ChatCircle size={28} className="text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">No comments yet</p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Comments on Social0 posts from {emptyRangeLabel} show up here.
            Try a longer range if you just published.
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <ul
            className={cn(
              "max-h-[min(70vh,40rem)] overflow-y-auto border-border lg:max-h-none lg:border-r",
              showList ? "block" : "hidden lg:block",
            )}
          >
            {threads.map((thread) => {
              const key = threadKey(thread);
              const active = selected ? threadKey(selected) === key : false;
              const c = thread.comment;
              const when = c.createdAt
                ? formatDistanceToNow(new Date(c.createdAt), { addSuffix: false })
                : "";
              const replyCount = thread.replies.length;
              const totalInThread = replyCount + 1;
              return (
                <li key={key} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPickedId(key);
                      setMobileDetail(true);
                    }}
                    className={cn(
                      "relative flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors",
                      active
                        ? "bg-accent/10 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent"
                        : "hover:bg-bg-subtle/80",
                    )}
                  >
                    <InboxPostThumbnail
                      mediaUrl={c.postMediaUrl}
                      content={c.postContent || c.postSnippet}
                      platform={c.platform}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-text">
                          {c.authorName}
                        </span>
                        <span className="truncate text-[11px] text-text-muted">
                          {c.accountLabel
                            ? `@${c.accountLabel.replace(/^@/, "")}`
                            : PLATFORM_LABEL[c.platform]}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-text-muted">
                          {when}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-text-muted">
                        {c.text || "(No text)"}
                      </span>
                      {totalInThread > 1 ? (
                        <span className="mt-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-semibold text-white">
                          {totalInThread}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <section
            className={cn(
              "min-h-0 min-w-0 flex-col",
              showDetail ? "flex" : "hidden lg:flex",
            )}
          >
            {selected ? (
              <ConversationPane
                thread={selected}
                dash={dash}
                accounts={accounts}
                sendingReplyIds={sendingReplyIds}
                failedReplyIds={failedReplyIds}
                sentTick={sentTick}
                onBack={() => setMobileDetail(false)}
                onReply={(uiParentId, payload, optimisticId) =>
                  void sendReply(selected, uiParentId, payload, { optimisticId })
                }
                onRetryReply={(id) => {
                  const stored = retryPayloads.current.get(id);
                  if (!stored) return;
                  const { parentCommentId, ...payload } = stored;
                  void sendReply(selected, parentCommentId, payload, {
                    optimisticId: id,
                  });
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-muted">
                Select a comment
              </div>
            )}
          </section>
        </div>
      )}

      {data?.sampled ? (
        <p className="text-[11px] text-text-muted">
          Latest {data.sampleLimit} Social0 publications in this range.
        </p>
      ) : null}
      {data?.since && data?.until ? (
        <p className="sr-only">
          Showing comments for {formatRangeLabel(data.since, data.until)}
        </p>
      ) : null}
    </>
  );
}

function ConversationPane({
  thread,
  dash,
  accounts,
  sendingReplyIds,
  failedReplyIds,
  sentTick,
  onBack,
  onReply,
  onRetryReply,
}: {
  thread: InboxThread;
  dash: (path: string) => string;
  accounts: AnalyticsAccount[];
  sendingReplyIds: Set<string>;
  failedReplyIds: Set<string>;
  sentTick: number;
  onBack: () => void;
  onReply: (
    uiParentId: string,
    payload: InboxComposerPayload,
    optimisticId?: string,
  ) => void;
  onRetryReply: (optimisticId: string) => void;
}) {
  const c = thread.comment;
  const account = accounts.find((a) => a.id === c.accountId);
  const [replyingTo, setReplyingTo] = useState<InboxComment | null>(null);
  const replyTree = useMemo(
    () => buildReplyTree(c, thread.replies, c.platform),
    [c, thread.replies],
  );
  const totalComments = thread.replies.length + 1;
  const nested = inboxSupportsNestedReplies(c.platform);

  const closeInlineReply = () => setReplyingTo(null);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text lg:hidden"
          aria-label="Back to list"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-text">
            {PLATFORM_LABEL[c.platform] ?? c.platform} comment
          </p>
          <p className="text-[11px] text-text-muted">
            {totalComments} comment{totalComments === 1 ? "" : "s"}
            {!nested ? " · replies stay in one thread" : ""}
          </p>
        </div>
        <Link
          href={dash(`posts/${c.postId}`)}
          className="hidden shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-bg-subtle hover:text-text sm:inline-flex"
        >
          Open in Social0
        </Link>
        {c.platformPostUrl ? (
          <a
            href={c.platformPostUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-bg-subtle hover:text-text"
          >
            View post
            <ArrowSquareOut size={11} />
          </a>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border px-3 py-3 sm:px-4">
          <InboxPostCard
            comment={c}
            accountLabel={account?.username ?? c.accountLabel}
            accountProfileImageUrl={account?.profileImageUrl}
          />
        </div>

        <div className="px-3 py-2 sm:px-4">
          <p className="text-[12px] font-semibold text-text">
            {totalComments} comment{totalComments === 1 ? "" : "s"}
          </p>
        </div>

        <div className="space-y-0 px-3 pb-3 sm:px-4">
          <CommentCard
            comment={c}
            root={c}
            account={account}
            sendingReplyIds={sendingReplyIds}
            failedReplyIds={failedReplyIds}
            replyingTo={replyingTo}
            sentTick={sentTick}
            onStartReply={() => setReplyingTo(c)}
            onCancelReply={closeInlineReply}
            onReply={(payload, optimisticId) => {
              onReply(c.id, payload, optimisticId);
              closeInlineReply();
            }}
            onRetryReply={onRetryReply}
            isRoot
          />
          {replyTree.length > 0 ? (
            <div
              className={cn(
                "space-y-0",
                nested ? "ml-4 border-l-2 border-border/70 pl-3 sm:ml-5 sm:pl-4" : "mt-0",
              )}
            >
              {replyTree.map((node) => (
                <ReplyBranch
                  key={node.comment.id}
                  node={node}
                  root={c}
                  account={account}
                  sendingReplyIds={sendingReplyIds}
                  failedReplyIds={failedReplyIds}
                  replyingTo={replyingTo}
                  sentTick={sentTick}
                  nested={nested}
                  onStartReply={setReplyingTo}
                  onCancelReply={closeInlineReply}
                  onReply={onReply}
                  onRetryReply={onRetryReply}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {c.canReply && !replyingTo ? (
        <div className="border-t border-border">
          <p className="border-b border-border bg-bg-subtle/50 px-3 py-1.5 text-[11px] text-text-muted sm:px-4">
            Reply to{" "}
            <span className="font-medium text-text">{c.authorName}</span>
          </p>
          <InboxComposer
            key={`root-${c.id}-${sentTick}`}
            platform={c.platform}
            mode="comment"
            maxLength={replyMax(c.platform)}
            placeholder="Write a reply…"
            sending={sendingReplyIds.size > 0}
            onSend={(payload) => onReply(c.id, payload)}
          />
        </div>
      ) : !c.canReply ? (
        <p className="border-t border-border px-4 py-3 text-sm text-text-muted">
          Replies aren&apos;t available for{" "}
          {PLATFORM_LABEL[c.platform] ?? c.platform} yet.
        </p>
      ) : null}
    </>
  );
}

function ReplyBranch({
  node,
  root,
  account,
  sendingReplyIds,
  failedReplyIds,
  replyingTo,
  sentTick,
  nested,
  onStartReply,
  onCancelReply,
  onReply,
  onRetryReply,
}: {
  node: CommentNode;
  root: InboxComment;
  account?: AnalyticsAccount;
  sendingReplyIds: Set<string>;
  failedReplyIds: Set<string>;
  replyingTo: InboxComment | null;
  sentTick: number;
  nested: boolean;
  onStartReply: (comment: InboxComment) => void;
  onCancelReply: () => void;
  onReply: (
    uiParentId: string,
    payload: InboxComposerPayload,
    optimisticId?: string,
  ) => void;
  onRetryReply: (optimisticId: string) => void;
}) {
  return (
    <>
      <CommentCard
        comment={node.comment}
        root={root}
        account={account}
        sendingReplyIds={sendingReplyIds}
        failedReplyIds={failedReplyIds}
        replyingTo={replyingTo}
        sentTick={sentTick}
        onStartReply={() => onStartReply(node.comment)}
        onCancelReply={onCancelReply}
        onReply={(payload, optimisticId) => {
          onReply(node.comment.id, payload, optimisticId);
          onCancelReply();
        }}
        onRetryReply={onRetryReply}
      />
      {nested && node.children.length > 0 ? (
        <div className="ml-4 space-y-0 border-l-2 border-border/60 pl-3 sm:ml-5 sm:pl-4">
          {node.children.map((child) => (
            <ReplyBranch
              key={child.comment.id}
              node={child}
              root={root}
              account={account}
              sendingReplyIds={sendingReplyIds}
              failedReplyIds={failedReplyIds}
              replyingTo={replyingTo}
              sentTick={sentTick}
              nested={nested}
              onStartReply={onStartReply}
              onCancelReply={onCancelReply}
              onReply={onReply}
              onRetryReply={onRetryReply}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function CommentCard({
  comment,
  root,
  account,
  sendingReplyIds,
  failedReplyIds,
  replyingTo,
  sentTick,
  onStartReply,
  onCancelReply,
  onReply,
  onRetryReply,
  isRoot,
}: {
  comment: InboxComment;
  root: InboxComment;
  account?: AnalyticsAccount;
  sendingReplyIds: Set<string>;
  failedReplyIds: Set<string>;
  replyingTo: InboxComment | null;
  sentTick: number;
  onStartReply: () => void;
  onCancelReply: () => void;
  onReply: (payload: InboxComposerPayload, optimisticId?: string) => void;
  onRetryReply: (optimisticId: string) => void;
  isRoot?: boolean;
}) {
  const when = comment.createdAt
    ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })
    : null;
  const own = Boolean(comment.isOwn);
  const avatarUrl = own
    ? account?.profileImageUrl ?? comment.authorAvatarUrl
    : comment.authorAvatarUrl;
  const sending = sendingReplyIds.has(comment.id);
  const failed = failedReplyIds.has(comment.id);
  const showInlineReply = replyingTo?.id === comment.id && root.canReply;
  const mention =
    !isRoot && comment.authorHandle
      ? `@${comment.authorHandle.replace(/^@/, "")} `
      : "";

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-bg-elevated px-3 py-2.5 sm:px-4",
        !isRoot && "mt-2",
        failed && "ring-1 ring-red-500/30",
      )}
    >
      <div className="flex gap-3">
        <InboxAvatar
          profileImageUrl={avatarUrl}
          username={comment.authorHandle ?? comment.authorName}
          platform={comment.platform}
          size={32}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-semibold text-text">
              {own ? "You" : comment.authorName}
            </span>
            {!own && comment.authorHandle ? (
              <span className="text-[12px] text-text-muted">
                @{comment.authorHandle.replace(/^@/, "")}
              </span>
            ) : null}
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-muted">
              {sending ? <CircleNotch size={12} className="animate-spin" /> : null}
              {when}
            </span>
          </div>
          {comment.text ? (
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-text">
              {comment.text}
            </p>
          ) : null}
          {comment.attachment ? (
            <InboxAttachmentView attachment={comment.attachment} />
          ) : null}
          {failed && own ? (
            <button
              type="button"
              onClick={() => onRetryReply(comment.id)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-400"
            >
              <WarningCircle size={14} weight="fill" />
              Failed to send · Tap to retry
            </button>
          ) : null}
          {root.canReply && !own && !showInlineReply ? (
            <button
              type="button"
              onClick={onStartReply}
              className="mt-2 text-[11px] font-medium text-text-muted hover:text-accent"
            >
              Reply
            </button>
          ) : null}
        </div>
      </div>

      {showInlineReply ? (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-text-muted">
              Replying to{" "}
              <span className="font-medium text-text">{comment.authorName}</span>
            </p>
            <button
              type="button"
              onClick={onCancelReply}
              className="text-[11px] text-text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
          <InlineReplyComposer
            key={`inline-${comment.id}-${sentTick}`}
            platform={root.platform}
            mention={mention}
            maxLength={replyMax(root.platform)}
            sending={sendingReplyIds.size > 0}
            onSend={onReply}
          />
        </div>
      ) : null}
    </article>
  );
}

function InlineReplyComposer({
  platform,
  mention,
  maxLength,
  sending,
  onSend,
}: {
  platform: string;
  mention: string;
  maxLength: number;
  sending: boolean;
  onSend: (payload: InboxComposerPayload) => void;
}) {
  return (
    <InboxComposer
      platform={platform}
      mode="comment"
      maxLength={maxLength}
      placeholder="Write a reply…"
      sending={sending}
      initialText={mention}
      variant="embedded"
      onSend={(payload) => {
        const text = mention && !payload.text.startsWith(mention)
          ? `${mention}${payload.text}`.trim()
          : payload.text;
        onSend({ ...payload, text });
      }}
    />
  );
}
