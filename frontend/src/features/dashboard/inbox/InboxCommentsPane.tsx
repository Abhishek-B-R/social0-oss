import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ArrowSquareOut,
  ChatCircle,
  CircleNotch,
  WarningCircle,
} from "@/icons/phosphor";
import type { InboxAccount } from "@/api/inbox";
import {
  listInboxComments,
  replyToInboxComment,
  type InboxComment,
  type InboxThread,
} from "@/api/inbox";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { formatRangeLabel } from "@/features/dashboard/analytics/analytics-utils";
import {
  WINDOW_EMPTY_LABEL,
  type DateWindow,
} from "@/lib/date-window";
import {
  inboxReplyTargetId,
  formatInboxReplyText,
  inboxReplyDraftMax,
  inboxReplyTextsMatch,
} from "@/lib/inbox-reply";
import { uploadFile } from "@/lib/upload-file";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InboxAttachmentView } from "./InboxAttachmentView";
import { InboxAvatar } from "./InboxAvatar";
import { InboxComposer, type InboxComposerPayload } from "./InboxComposer";
import { InboxPostCard, InboxPostThumbnail } from "./InboxPostCard";
import { InboxScrollSentinel } from "./InboxScrollSentinel";
import { InboxStatusBanners } from "./InboxStatusBanners";
import { inboxMetaFromPages } from "./inbox-meta";
import { resolveInboxBody } from "@/lib/inbox-display";
import { flattenInboxThread } from "@/lib/inbox-thread";
import { useSession } from "@/lib/auth-client";
import { listWorkspaces } from "@/api/team";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import {
  initialInboxPageParam,
  nextInboxPageParam,
  refreshInboxInfiniteFirstPage,
} from "@/lib/inbox-infinite";
import {
  PAGE_LIVE_POLL_MS,
  useVisibilityPoll,
} from "@/lib/use-visibility-poll";
import { PAGE_LIVE_QUERY } from "@/lib/page-live-query";

function threadLastActivity(thread: InboxThread): string {
  const times = [
    thread.comment.createdAt,
    ...thread.replies.map((r) => r.createdAt),
  ].filter(Boolean) as string[];
  return times.sort().at(-1) ?? "";
}

function threadKey(thread: InboxThread): string {
  return `${thread.comment.publicationId}-${thread.comment.id}`;
}

function replyMax(platform: string): number {
  if (platform === "twitter_x") return 280;
  if (platform === "bluesky") return 300;
  if (platform === "threads") return 500;
  return 2000;
}

function replyLooksSent(
  server: InboxComment,
  pending: InboxComment,
  platform: string,
): boolean {
  if (server.id === pending.id) return true;
  if (!server.isOwn) return false;
  if (
    !inboxReplyTextsMatch(
      platform,
      server.text || "",
      pending.text || "",
      pending.authorHandle ?? server.authorHandle,
    )
  ) {
    return false;
  }
  const dt = Math.abs(
    new Date(server.createdAt ?? 0).getTime() -
      new Date(pending.createdAt ?? 0).getTime(),
  );
  return dt < 120_000;
}

function mergePendingReplies(
  threads: InboxThread[],
  pending: InboxComment[],
): InboxThread[] {
  if (!pending.length) return threads;
  return threads.map((thread) => {
    const extras = pending.filter((p) => {
      if (p.publicationId !== thread.comment.publicationId) return false;
      const inThread =
        thread.comment.id === p.parentId ||
        thread.replies.some((r) => r.id === p.parentId);
      if (!inThread) return false;
      if (thread.replies.some((r) => replyLooksSent(r, p, thread.comment.platform))) return false;
      if (replyLooksSent(thread.comment, p, thread.comment.platform)) return false;
      return true;
    });
    return extras.length
      ? { ...thread, replies: [...thread.replies, ...extras] }
      : thread;
  });
}

type RetryPayload = InboxComposerPayload & { parentCommentId: string };

export function InboxCommentsPane({
  dateWindow,
  accountId,
  accounts,
  enabled,
  allowReply = true,
}: {
  dateWindow: DateWindow;
  accountId: string | null;
  accounts: InboxAccount[];
  enabled: boolean;
  allowReply?: boolean;
}) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const workspacesQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: Boolean(session),
  });
  const workspaceReady = workspacesQuery.isSuccess || workspacesQuery.isError;
  const workspaceId =
    workspacesQuery.data?.workspaces.find((w) => w.isActive)?.id ?? "main";
  const [searchParams, setSearchParams] = useSearchParams();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const queryKey = ["inbox-comments", workspaceId, dateWindow, accountId] as const;

  const inboxQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      listInboxComments({
        ...pageParam,
        accountId: accountId || undefined,
      }),
    initialPageParam: initialInboxPageParam(dateWindow),
    getNextPageParam: (last) =>
      nextInboxPageParam({
        hasMore: last.hasMore,
        sampled: last.sampled,
        nextBefore: last.nextBefore,
        since: last.since,
        until: last.until,
        itemCount: last.threads.length,
      }),
    enabled: enabled && workspaceReady,
    ...PAGE_LIVE_QUERY,
    maxPages: 24,
  });

  const pollComments = useCallback(() => {
    void refreshInboxInfiniteFirstPage(qc, queryKey, () =>
      listInboxComments({
        ...initialInboxPageParam(dateWindow),
        accountId: accountId || undefined,
      }),
    );
  }, [qc, queryKey, dateWindow, accountId]);

  useVisibilityPoll(pollComments, PAGE_LIVE_POLL_MS, enabled && workspaceReady);

  useEffect(() => {
    return () => {
      void qc.cancelQueries({ queryKey });
    };
  }, [qc, queryKey]);

  const fetchNextComments = inboxQuery.fetchNextPage;
  const hasNextComments = Boolean(inboxQuery.hasNextPage);
  const fetchingNextComments = inboxQuery.isFetchingNextPage;
  const loadOlderComments = useCallback(() => {
    if (hasNextComments && !fetchingNextComments) {
      void fetchNextComments();
    }
  }, [fetchNextComments, fetchingNextComments, hasNextComments]);

  const [pendingReplies, setPendingReplies] = useState<InboxComment[]>([]);
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
      const next: InboxComment = {
        id: optimisticId,
        platform: root.platform,
        accountId: root.accountId,
        accountLabel: account?.username ?? null,
        postId: root.postId,
        publicationId: root.publicationId,
        platformPostId: root.platformPostId,
        platformPostUrl: root.platformPostUrl,
        postSnippet: root.postSnippet,
        postContent: root.postContent,
        postMediaUrl: root.postMediaUrl,
        postPublishedAt: root.postPublishedAt,
        postAccountImageUrl: root.postAccountImageUrl,
        authorName: "You",
        authorHandle: account?.username ?? null,
        authorAvatarUrl: account?.profileImageUrl,
        text: payload.text,
        attachment,
        createdAt: new Date().toISOString(),
        parentId: uiParentId,
        canReply: false,
        isOwn: true,
      };
      setPendingReplies((p) => [...p, next]);
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
      setPendingReplies((p) =>
        p.map((r) =>
          r.id === optimisticId ? { ...r, id: res.replyId ?? r.id } : r,
        ),
      );
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refreshInboxInfiniteFirstPage(qc, queryKey, () =>
          listInboxComments({
            ...initialInboxPageParam(dateWindow),
            accountId: accountId || undefined,
          }),
        );
      }, 8000);
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

  const mergedThreads = useMemo(() => {
    const seen = new Set<string>();
    const out: InboxThread[] = [];
    for (const page of inboxQuery.data?.pages ?? []) {
      for (const t of page.threads) {
        const k = threadKey(t);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
    }
    out.sort((a, b) =>
      threadLastActivity(b).localeCompare(threadLastActivity(a)),
    );
    return out;
  }, [inboxQuery.data]);

  const data = inboxQuery.data?.pages[0];
  const inboxMeta = inboxMetaFromPages(inboxQuery.data?.pages);
  const threads = mergePendingReplies(
    mergedThreads.filter((t) => {
      if (!t.comment.isOwn) return true;
      return t.replies.some((r) => !r.isOwn);
    }),
    pendingReplies,
  );

  useEffect(() => {
    if (!mergedThreads.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingReplies((prev) =>
      prev.filter((p) => {
        const thread = mergedThreads.find(
          (t) =>
            t.comment.publicationId === p.publicationId &&
            (t.comment.id === p.parentId ||
              t.replies.some((r) => r.id === p.parentId)),
        );
        if (!thread) return true;
        return !thread.replies.some((r) => replyLooksSent(r, p, thread.comment.platform));
      }),
    );
  }, [mergedThreads]);

  useEffect(() => {
    if (!threads.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPickedId(null);
      return;
    }
    const keys = threads.map(threadKey);
    const fromUrl = searchParams.get("thread");
    const match = fromUrl
      ? threads.find((t) => t.comment.id === fromUrl)
      : null;
    if (match) {
      setPickedId(threadKey(match));
      return;
    }
    if (!pickedId || !keys.includes(pickedId)) {
      setPickedId(keys[0] ?? null);
    }
  }, [threads, pickedId, searchParams]);

  const loading = inboxQuery.isPending;

  useEffect(() => {
    if (!enabled || loading || fetchingNextComments) return;
    if (mergedThreads.length === 0 && threads.length === 0 && hasNextComments) {
      void fetchNextComments();
    }
  }, [
    enabled,
    loading,
    fetchingNextComments,
    mergedThreads.length,
    threads.length,
    hasNextComments,
    fetchNextComments,
  ]);

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
      {inboxQuery.isError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
          {inboxQuery.error instanceof Error
            ? inboxQuery.error.message
            : "Failed to load comments"}
        </div>
      ) : null}

      <InboxStatusBanners {...inboxMeta} />

      {loading && !data ? (
        <div className="grid min-h-[24rem] flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[17.5rem_minmax(0,1fr)]">
          <div className="h-full animate-pulse bg-bg-muted/60" />
          <div className="hidden h-full animate-pulse bg-bg-muted/40 lg:block" />
        </div>
      ) : !data || (threads.length === 0 && !hasNextComments) ? (
        <div className="flex min-h-[24rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated px-6 text-center">
          <ChatCircle size={28} className="text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">No comments yet</p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Comments on Social0 posts from {emptyRangeLabel} show up here.
            Try a longer range if you just published.
          </p>
        </div>
      ) : threads.length === 0 && hasNextComments ? (
        <div className="flex min-h-[24rem] flex-1 flex-col items-center justify-center rounded-xl border border-border bg-bg-elevated px-6">
          <CircleNotch size={24} className="animate-spin text-text-muted" />
          <p className="mt-3 text-sm text-text-muted">Loading older posts...</p>
        </div>
      ) : (
        <div className="grid min-h-[24rem] flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[17.5rem_minmax(0,1fr)]">
          <ul
            className={cn(
              "max-h-[min(70vh,40rem)] min-h-0 overflow-y-auto border-border lg:max-h-none lg:border-r",
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
              const via = c.accountLabel
                ? `@${c.accountLabel.replace(/^@/, "")}`
                : PLATFORM_LABEL[c.platform] ?? c.platform;

              return (
                <li key={key} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPickedId(key);
                      setMobileDetail(true);
                      setSearchParams(
                        (prev) => {
                          const next = new URLSearchParams(prev);
                          next.set("thread", c.id);
                          return next;
                        },
                        { replace: true },
                      );
                    }}
                    className={cn(
                      "relative flex w-full gap-2.5 px-3 py-2.5 text-left transition-[background-color,transform] duration-150 ease-out active:scale-[0.995]",
                      active
                        ? "bg-accent/[0.08] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent"
                        : "hover:bg-bg-subtle/80",
                    )}
                  >
                    <InboxPostThumbnail
                      mediaUrl={c.postMediaUrl}
                      content={c.postContent || c.postSnippet}
                      platform={c.platform}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-text">
                          {c.authorName}
                        </span>
                        {needsReply ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        ) : null}
                        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-text-muted">
                          {when}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-text-muted">
                        {c.text ||
                          (c.attachment?.type === "video"
                            ? "Video"
                            : c.attachment
                              ? "Photo"
                              : "(No text)")}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
                        <span>
                          {PLATFORM_LABEL[c.platform] ?? c.platform} · {via}
                        </span>
                        {replyCount > 0 ? (
                          <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sky-500/90 px-1 text-[10px] font-semibold text-white">
                            {replyCount + 1}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            <InboxScrollSentinel
              onVisible={loadOlderComments}
              disabled={!hasNextComments || fetchingNextComments}
              loading={fetchingNextComments}
            />
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
                accounts={accounts}
                allowReply={allowReply}
                sendingReplyIds={sendingReplyIds}
                pendingReplies={pendingReplies}
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
  accounts,
  allowReply,
  sendingReplyIds,
  pendingReplies,
  failedReplyIds,
  onBack,
  onReply,
  onRetryReply,
}: {
  thread: InboxThread;
  accounts: InboxAccount[];
  allowReply: boolean;
  sendingReplyIds: Set<string>;
  pendingReplies: InboxComment[];
  failedReplyIds: Set<string>;
  onBack: () => void;
  onReply: (
    uiParentId: string,
    payload: InboxComposerPayload,
    optimisticId?: string,
  ) => void;
  onRetryReply: (optimisticId: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const root = thread.comment;
  const account = accounts.find((a) => a.id === root.accountId);
  const [replyTarget, setReplyTarget] = useState<InboxComment>(root);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplyTarget(root);
  }, [root]);

  const flat = useMemo(
    () => flattenInboxThread(root, thread.replies),
    [root, thread.replies],
  );

  const sending = pendingReplies.some(
    (p) =>
      p.publicationId === root.publicationId && sendingReplyIds.has(p.id),
  );

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-subtle hover:text-text active:scale-[0.97] lg:hidden"
          aria-label="Back to list"
        >
          <ArrowLeft size={16} />
        </button>
        <InboxAvatar
          profileImageUrl={root.authorAvatarUrl}
          username={root.authorHandle ?? root.authorName}
          platform={root.platform}
          size={36}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-text">
            {root.authorName}
            {root.authorHandle
              ? ` (@${root.authorHandle.replace(/^@/, "")})`
              : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {PLATFORM_LABEL[root.platform] ?? root.platform}
            {root.accountLabel
              ? ` · via @${root.accountLabel.replace(/^@/, "")}`
              : ""}
            {` · ${flat.length} comment${flat.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {root.platformPostUrl ? (
          <a
            href={root.platformPostUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-subtle hover:text-accent active:scale-[0.97]"
            aria-label="View post"
          >
            <ArrowSquareOut size={14} />
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

        <div className="flex flex-col">
          {flat.map(({ comment, depth }) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              depth={depth}
              root={root}
              account={account}
              allowReply={allowReply}
              active={replyTarget.id === comment.id}
              sending={sendingReplyIds.has(comment.id)}
              failed={failedReplyIds.has(comment.id)}
              onReply={() => {
                if (comment.isOwn) return;
                setReplyTarget(comment);
                composerRef.current?.scrollIntoView({
                  behavior: reduceMotion ? "auto" : "smooth",
                  block: "nearest",
                });
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

      {root.canReply && allowReply ? (
        <div ref={composerRef} className="shrink-0">
          <InboxComposer
            key={root.id}
            platform={root.platform}
            mode="comment"
            maxLength={inboxReplyDraftMax({
              platform: root.platform,
              targetHandle: replyTarget.authorHandle,
              isRoot: replyTarget.id === root.id,
              limit: replyMax(root.platform),
            })}
            placeholder="Write a reply..."
            sending={sending}
            replyTo={
              replyTarget.id !== root.id
                ? {
                    name: replyTarget.authorName,
                    onClear: () => setReplyTarget(root),
                  }
                : null
            }
            onSend={(payload) => {
              const text = formatInboxReplyText({
                platform: root.platform,
                targetHandle: replyTarget.authorHandle,
                isRoot: replyTarget.id === root.id,
                text: payload.text,
              });
              onReply(replyTarget.id, { ...payload, text });
            }}
          />
        </div>
      ) : (
        <p className="shrink-0 border-t border-border px-4 py-3 text-sm text-text-muted">
          {allowReply
            ? `Replies aren't available for ${PLATFORM_LABEL[root.platform] ?? root.platform} yet.`
            : "Your role can view this thread but not reply."}
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
  allowReply,
  active,
  sending,
  failed,
  onReply,
  onRetry,
}: {
  comment: InboxComment;
  depth: number;
  root: InboxComment;
  account?: InboxAccount;
  allowReply: boolean;
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
  const body = resolveInboxBody(comment.text, comment.attachment);

  return (
    <article
      className={cn(
        "relative px-3 py-2.5 sm:px-4",
        active && "bg-accent/[0.04]",
        own && "bg-bg-subtle/30",
        failed && "bg-red-500/[0.04]",
      )}
    >
      {depth > 0
        ? Array.from({ length: depth }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-border"
              style={{ left: 22 + i * 18 }}
            />
          ))
        : null}
      <div className="flex gap-2.5" style={{ paddingLeft: depth * 18 }}>
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
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-muted">
              {sending ? <CircleNotch size={12} className="animate-spin" /> : null}
              {when}
            </span>
          </div>
          {body.text ? (
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-text">
              {body.text}
            </p>
          ) : null}
          {body.attachment ? (
            <InboxAttachmentView attachment={body.attachment} className="max-w-sm" />
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
          {root.canReply && allowReply && !own ? (
            <button
              type="button"
              onClick={onReply}
              className={cn(
                "mt-2 text-[11px] font-semibold transition-[transform,color] duration-150 ease-out active:scale-[0.97]",
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
