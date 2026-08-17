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

function mentionPrefix(comment: InboxComment, rootId: string): string {
  if (comment.id === rootId || !comment.authorHandle) return "";
  return `@${comment.authorHandle.replace(/^@/, "")} `;
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

type FlatComment = { comment: InboxComment; depth: number };

function flattenThread(
  root: InboxComment,
  replies: InboxComment[],
  platform: string,
): FlatComment[] {
  const sorted = [...replies].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  const nested = inboxSupportsNestedReplies(platform);
  const out: FlatComment[] = [{ comment: root, depth: 0 }];

  if (!nested) {
    for (const c of sorted) out.push({ comment: c, depth: 1 });
    return out;
  }

  const nodes = new Map<string, { comment: InboxComment; children: InboxComment[] }>();
  for (const c of sorted) nodes.set(c.id, { comment: c, children: [] });
  const tops: InboxComment[] = [];
  for (const c of sorted) {
    const parentId = c.parentId;
    if (parentId && parentId !== root.id && nodes.has(parentId)) {
      nodes.get(parentId)!.children.push(c);
    } else {
      tops.push(c);
    }
  }
  function walk(list: InboxComment[], depth: number) {
    for (const c of list) {
      out.push({ comment: c, depth });
      const kids = nodes.get(c.id)?.children ?? [];
      if (kids.length) walk(kids, depth + 1);
    }
  }
  walk(tops, 1);
  return out;
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
          {" · "}
          <a
            href="https://github.com/Abhishek-B-R/social0/blob/main/docs/PLATFORM_PERMISSIONS.md"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Permissions guide
          </a>
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
        <div className="grid min-h-[24rem] flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[17.5rem_minmax(0,1fr)]">
          <div className="h-full animate-pulse bg-bg-muted/60" />
          <div className="hidden h-full animate-pulse bg-bg-muted/40 lg:block" />
        </div>
      ) : !data || threads.length === 0 ? (
        <div className="flex min-h-[24rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated px-6 text-center">
          <ChatCircle size={28} className="text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">No comments yet</p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Comments on Social0 posts from {emptyRangeLabel} show up here.
            Try a longer range if you just published.
          </p>
        </div>
      ) : (
        <div className="grid min-h-[24rem] flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[17.5rem_minmax(0,1fr)]">
          <ul
            className={cn(
              "overflow-y-auto border-border lg:border-r",
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
              const needsReply = !thread.replies.some((r) => r.isOwn);
              const pageLabel = c.accountLabel
                ? `@${c.accountLabel.replace(/^@/, "")}`
                : PLATFORM_LABEL[c.platform] ?? c.platform;

              return (
                <li key={key} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPickedId(key);
                      setMobileDetail(true);
                    }}
                    className={cn(
                      "relative flex w-full gap-2.5 px-3 py-3 text-left transition-colors",
                      active
                        ? "bg-accent/[0.08] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent"
                        : "hover:bg-bg-subtle/70",
                    )}
                  >
                    <InboxPostThumbnail
                      mediaUrl={c.postMediaUrl}
                      content={c.postContent || c.postSnippet}
                      platform={c.platform}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-text">
                          {pageLabel}
                        </span>
                        {needsReply ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        ) : null}
                        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-text-muted">
                          {when}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-[11px] font-medium text-text">
                        {c.authorName}: {c.text || "(No text)"}
                      </span>
                      {replyCount > 0 ? (
                        <span className="mt-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sky-500/90 px-1 text-[10px] font-semibold text-white">
                          {replyCount + 1}
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
                Select a comment thread
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
  onBack,
  onReply,
  onRetryReply,
}: {
  thread: InboxThread;
  dash: (path: string) => string;
  accounts: AnalyticsAccount[];
  sendingReplyIds: Set<string>;
  failedReplyIds: Set<string>;
  onBack: () => void;
  onReply: (
    uiParentId: string,
    payload: InboxComposerPayload,
    optimisticId?: string,
  ) => void;
  onRetryReply: (optimisticId: string) => void;
}) {
  const root = thread.comment;
  const account = accounts.find((a) => a.id === root.accountId);
  const [replyTarget, setReplyTarget] = useState<InboxComment>(root);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReplyTarget(root);
  }, [root.id]);

  const flat = useMemo(
    () => flattenThread(root, thread.replies, root.platform),
    [root, thread.replies],
  );

  const composerPrefix = mentionPrefix(replyTarget, root.id);
  const sending = sendingReplyIds.size > 0;

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text lg:hidden"
          aria-label="Back to list"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">
            {root.accountLabel
              ? `@${root.accountLabel.replace(/^@/, "")}`
              : "Your post"}
          </p>
          <p className="text-[11px] text-text-muted">
            {PLATFORM_LABEL[root.platform] ?? root.platform} · {flat.length}{" "}
            comment{flat.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href={dash(`posts/${root.postId}`)}
          className="hidden shrink-0 text-[11px] font-medium text-accent hover:underline sm:inline"
        >
          Social0
        </Link>
        {root.platformPostUrl ? (
          <a
            href={root.platformPostUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-text-muted hover:text-accent"
          >
            View
            <ArrowSquareOut size={11} />
          </a>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border p-3 sm:p-4">
          <InboxPostCard
            comment={root}
            accountLabel={account?.username ?? root.accountLabel}
            accountProfileImageUrl={account?.profileImageUrl}
          />
        </div>

        <div className="divide-y divide-border">
          {flat.map(({ comment, depth }) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              depth={depth}
              root={root}
              account={account}
              active={replyTarget.id === comment.id}
              sending={sendingReplyIds.has(comment.id)}
              failed={failedReplyIds.has(comment.id)}
              onReply={() => {
                if (comment.isOwn) return;
                setReplyTarget(comment);
                composerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
              onRetry={
                comment.isOwn && failedReplyIds.has(comment.id)
                  ? () => onRetryReply(comment.id)
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {root.canReply ? (
        <div ref={composerRef} className="shrink-0">
          <InboxComposer
            platform={root.platform}
            mode="comment"
            maxLength={replyMax(root.platform)}
            placeholder="Write a reply…"
            sending={sending}
            initialText={composerPrefix}
            replyTo={
              replyTarget.id !== root.id
                ? {
                    name: replyTarget.authorName,
                    onClear: () => setReplyTarget(root),
                  }
                : null
            }
            onSend={(payload) => {
              const text =
                composerPrefix && !payload.text.startsWith(composerPrefix)
                  ? `${composerPrefix}${payload.text}`.trim()
                  : payload.text;
              onReply(replyTarget.id, { ...payload, text });
            }}
          />
        </div>
      ) : (
        <p className="shrink-0 border-t border-border px-4 py-3 text-sm text-text-muted">
          Replies aren&apos;t available for{" "}
          {PLATFORM_LABEL[root.platform] ?? root.platform} yet.
        </p>
      )}
    </>
  );
}

function CommentRow({
  comment,
  depth,
  root,
  account,
  active,
  sending,
  failed,
  onReply,
  onRetry,
}: {
  comment: InboxComment;
  depth: number;
  root: InboxComment;
  account?: AnalyticsAccount;
  active: boolean;
  sending: boolean;
  failed: boolean;
  onReply: () => void;
  onRetry?: () => void;
}) {
  const when = comment.createdAt
    ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })
    : null;
  const own = Boolean(comment.isOwn);
  const avatarUrl = own
    ? account?.profileImageUrl ?? comment.authorAvatarUrl
    : comment.authorAvatarUrl;

  return (
    <article
      className={cn(
        "px-3 py-3 sm:px-4",
        active && "bg-accent/[0.04]",
        own && "bg-bg-subtle/30",
        failed && "bg-red-500/[0.04]",
      )}
    >
      <div className="flex gap-2.5" style={{ marginLeft: depth * 16 }}>
        <InboxAvatar
          profileImageUrl={avatarUrl}
          username={comment.authorHandle ?? comment.authorName}
          platform={comment.platform}
          size={depth === 0 ? 36 : 30}
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
            {depth === 0 ? (
              <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                Top comment
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
            <InboxAttachmentView attachment={comment.attachment} className="max-w-sm" />
          ) : null}
          {failed && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-400"
            >
              <WarningCircle size={14} weight="fill" />
              Failed · Retry
            </button>
          ) : null}
          {root.canReply && !own ? (
            <button
              type="button"
              onClick={onReply}
              className={cn(
                "mt-2 text-[11px] font-semibold",
                active ? "text-accent" : "text-text-muted hover:text-accent",
              )}
            >
              Reply
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
