import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChatCircle } from "@/icons/phosphor";
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
  inboxReplyTextsMatch,
} from "@/lib/inbox-reply";
import { uploadFile } from "@/lib/upload-file";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { InboxComposerPayload } from "./InboxComposer";
import { InboxConversation } from "./InboxConversation";
import { InboxPostThumbnail } from "./InboxPostCard";
import { InboxStatusBanners } from "./InboxStatusBanners";
import type { InboxCommentStatusFilter } from "./InboxStatusFilter";
import { inboxMetaFromPages } from "./inbox-meta";
import {
  inboxThreadMatchesFilter,
  isInboxThreadAnswered,
} from "@/lib/inbox-comment-status";
import {
  commentIdsFromThreads,
  markInboxCommentsSeen,
} from "@/lib/inbox-unread";
import { useSession } from "@/lib/auth-client";
import { listWorkspaces } from "@/api/team";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { initialInboxPageParam } from "@/lib/inbox-infinite";
import {
  INBOX_MAX_PAGES,
  inboxGetNextPageParam,
} from "@/lib/inbox-page-param";
import { PAGE_LIVE_QUERY } from "@/lib/page-live-query";

type PostGroup = {
  publicationId: string;
  platform: string;
  postSnippet: string;
  postContent: string;
  postMediaUrl?: string | null;
  platformPostUrl: string | null;
  accountLabel: string | null;
  threads: InboxThread[];
  unanswered: number;
  lastActivity: string;
};

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
  statusFilter = "unanswered",
}: {
  dateWindow: DateWindow;
  accountId: string | null;
  accounts: InboxAccount[];
  enabled: boolean;
  allowReply?: boolean;
  statusFilter?: InboxCommentStatusFilter;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
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

  const queryKey = useMemo(
    () => ["inbox-comments", workspaceId, dateWindow, accountId] as const,
    [workspaceId, dateWindow, accountId],
  );

  const inboxQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      listInboxComments({
        ...pageParam,
        accountId: accountId || undefined,
      }),
    initialPageParam: initialInboxPageParam(dateWindow),
    getNextPageParam: inboxGetNextPageParam,
    enabled: enabled && workspaceReady,
    ...PAGE_LIVE_QUERY,
    maxPages: INBOX_MAX_PAGES,
  });

  // Intentionally no visibility/interval poll. Auto-refresh was the "infinite
  // refresh" users hit; Reload is the Refresh button on InboxPage only.

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
      // No delayed list refetch - optimistic reply already shows. Auto-refresh
      // after reply was another surprise "reload" while sitting on the page.
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

  const inboundThreads = useMemo(
    () =>
      mergePendingReplies(
        mergedThreads.filter((t) => {
          if (!t.comment.isOwn) return true;
          return t.replies.some((r) => !r.isOwn);
        }),
        pendingReplies,
      ),
    [mergedThreads, pendingReplies],
  );

  const postGroupsAll = useMemo(() => {
    const map = new Map<string, PostGroup>();
    for (const t of inboundThreads) {
      const id = t.comment.publicationId;
      const cur = map.get(id);
      const unanswered = isInboxThreadAnswered(t) ? 0 : 1;
      const activity = threadLastActivity(t);
      if (!cur) {
        map.set(id, {
          publicationId: id,
          platform: t.comment.platform,
          postSnippet: t.comment.postSnippet,
          postContent: t.comment.postContent,
          postMediaUrl: t.comment.postMediaUrl,
          platformPostUrl: t.comment.platformPostUrl,
          accountLabel: t.comment.accountLabel,
          threads: [t],
          unanswered,
          lastActivity: activity,
        });
      } else {
        cur.threads.push(t);
        cur.unanswered += unanswered;
        if (activity > cur.lastActivity) cur.lastActivity = activity;
      }
    }
    return [...map.values()].sort((a, b) =>
      b.lastActivity.localeCompare(a.lastActivity),
    );
  }, [inboundThreads]);

  const postGroups = useMemo(() => {
    return postGroupsAll
      .map((g) => ({
        ...g,
        threads: g.threads.filter((t) =>
          inboxThreadMatchesFilter(t, statusFilter),
        ),
      }))
      .filter((g) => {
        if (!g.threads.length) return false;
        if (statusFilter === "unanswered") return g.unanswered > 0;
        if (statusFilter === "answered") return g.unanswered === 0;
        return true;
      });
  }, [postGroupsAll, statusFilter]);

  const needsReplyGroups = postGroups.filter((g) => g.unanswered > 0);
  const repliedGroups = postGroups.filter((g) => g.unanswered === 0);

  const [pickedPostId, setPickedPostId] = useState<string | null>(null);
  const threadFromUrl = searchParams.get("thread");

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
    if (!postGroups.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPickedPostId((prev) => (prev === null ? prev : null));
      setPickedId((prev) => (prev === null ? prev : null));
      return;
    }
    const match = threadFromUrl
      ? postGroups
          .flatMap((g) => g.threads)
          .find((t) => t.comment.id === threadFromUrl)
      : null;
    if (match) {
      const nextPostId = match.comment.publicationId;
      const nextKey = threadKey(match);
      setPickedPostId((prev) => (prev === nextPostId ? prev : nextPostId));
      setPickedId((prev) => (prev === nextKey ? prev : nextKey));
      return;
    }
    const post =
      postGroups.find((g) => g.publicationId === pickedPostId) ?? postGroups[0];
    const nextPostId = post.publicationId;
    const keys = post.threads.map(threadKey);
    const nextKey =
      pickedId && keys.includes(pickedId) ? pickedId : (keys[0] ?? null);
    setPickedPostId((prev) => (prev === nextPostId ? prev : nextPostId));
    setPickedId((prev) => (prev === nextKey ? prev : nextKey));
  }, [postGroups, pickedPostId, pickedId, threadFromUrl]);

  const selectedPost =
    postGroups.find((g) => g.publicationId === pickedPostId) ?? postGroups[0] ?? null;
  const selected =
    selectedPost?.threads.find((t) => threadKey(t) === pickedId) ??
    selectedPost?.threads[0] ??
    null;

  // Keep the sidebar Inbox badge accurate: viewing a post marks its comments seen.
  const selectedPostId = selectedPost?.publicationId ?? null;
  useEffect(() => {
    if (!enabled || !userId || !selectedPost) return;
    const ids = commentIdsFromThreads(selectedPost.threads);
    if (!ids.length) return;
    markInboxCommentsSeen(userId, ids);
    // Depend on publication id, not the post object (new reference every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- threads content keyed by selectedPostId
  }, [enabled, userId, selectedPostId]);

  const loading = inboxQuery.isPending || (inboxQuery.isFetching && !inboxQuery.data);

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
        <InboxSplitSkeleton />
      ) : !data || postGroups.length === 0 ? (
        <div className="flex min-h-[24rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated px-6 text-center">
          <ChatCircle size={28} className="text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">
            {statusFilter === "unanswered"
              ? "You're all caught up"
              : statusFilter === "answered"
                ? "No answered threads yet"
                : "No comments yet"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            {statusFilter === "all"
              ? `Comments on Social0 posts from ${emptyRangeLabel} show up here.`
              : "Try All, or a longer date range."}
          </p>
        </div>
      ) : (
        <div className="grid min-h-[24rem] flex-1 overflow-hidden rounded-2xl border border-black/[0.06] bg-bg-elevated shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] dark:border-white/[0.08] lg:grid-cols-[19rem_minmax(0,1fr)]">
          <div
            className={cn(
              "max-h-[min(70vh,40rem)] min-h-0 overflow-y-auto border-border lg:max-h-none lg:border-r",
              showList ? "block" : "hidden lg:block",
            )}
          >
            <div className="sticky top-0 z-10 flex items-center border-b border-border/80 bg-bg-elevated/80 px-3 py-2 backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Posts
              </p>
            </div>
            {needsReplyGroups.length > 0 && repliedGroups.length > 0 ? (
              <>
                <PostGroupList
                  title="Needs a reply"
                  groups={needsReplyGroups}
                  selectedPostId={selectedPost?.publicationId ?? null}
                  onPick={(group) => {
                    setPickedPostId(group.publicationId);
                    setPickedId(threadKey(group.threads[0]!));
                    setMobileDetail(true);
                    setSearchParams(
                      (prev) => {
                        const next = new URLSearchParams(prev);
                        next.set("thread", group.threads[0]!.comment.id);
                        return next;
                      },
                      { replace: true },
                    );
                  }}
                />
                <PostGroupList
                  title="Replied"
                  groups={repliedGroups}
                  selectedPostId={selectedPost?.publicationId ?? null}
                  onPick={(group) => {
                    setPickedPostId(group.publicationId);
                    setPickedId(threadKey(group.threads[0]!));
                    setMobileDetail(true);
                    setSearchParams(
                      (prev) => {
                        const next = new URLSearchParams(prev);
                        next.set("thread", group.threads[0]!.comment.id);
                        return next;
                      },
                      { replace: true },
                    );
                  }}
                />
              </>
            ) : (
              <PostGroupList
                groups={postGroups}
                selectedPostId={selectedPost?.publicationId ?? null}
                onPick={(group) => {
                  setPickedPostId(group.publicationId);
                  setPickedId(threadKey(group.threads[0]!));
                  setMobileDetail(true);
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.set("thread", group.threads[0]!.comment.id);
                      return next;
                    },
                    { replace: true },
                  );
                }}
              />
            )}
            {hasNextComments ? (
              <div className="px-2 py-2">
                <button
                  type="button"
                  onClick={loadOlderComments}
                  disabled={fetchingNextComments}
                  className="flex w-full items-center justify-center rounded-xl border border-border bg-bg-subtle px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-bg-muted disabled:opacity-60"
                >
                  {fetchingNextComments ? "Loading..." : "Load older posts"}
                </button>
              </div>
            ) : null}
          </div>

          <section
            className={cn(
              "min-h-0 min-w-0 flex-col",
              showDetail ? "flex" : "hidden lg:flex",
            )}
          >
            {selectedPost ? (
              <InboxConversation
                key={`${selectedPost.publicationId}-${statusFilter}`}
                threads={selectedPost.threads}
                accounts={accounts}
                allowReply={allowReply}
                statusFilter={statusFilter}
                sendingReplyIds={sendingReplyIds}
                failedReplyIds={failedReplyIds}
                highlightCommentId={selected?.comment.id}
                onBack={() => setMobileDetail(false)}
                onReply={(uiParentId, payload, optimisticId) => {
                  const thread =
                    selectedPost.threads.find(
                      (t) =>
                        t.comment.id === uiParentId ||
                        t.replies.some((r) => r.id === uiParentId),
                    ) ?? selectedPost.threads[0];
                  if (!thread) return;
                  void sendReply(thread, uiParentId, payload, { optimisticId });
                }}
                onRetryReply={(id) => {
                  const stored = retryPayloads.current.get(id);
                  if (!stored) return;
                  const { parentCommentId, ...payload } = stored;
                  const thread =
                    selectedPost.threads.find(
                      (t) =>
                        t.comment.id === parentCommentId ||
                        t.replies.some((r) => r.id === parentCommentId),
                    ) ?? selectedPost.threads[0];
                  if (!thread) return;
                  void sendReply(thread, parentCommentId, payload, {
                    optimisticId: id,
                  });
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-muted">
                Select a post
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

function InboxSplitSkeleton() {
  return (
    <div
      className="grid min-h-[24rem] flex-1 overflow-hidden rounded-2xl border border-border bg-bg-elevated lg:grid-cols-[19rem_minmax(0,1fr)]"
      aria-busy
    >
      <div className="h-full min-h-[20rem] animate-pulse bg-bg-muted/60" />
      <div className="hidden h-full animate-pulse bg-bg-muted/40 lg:block" />
    </div>
  );
}

function PostGroupList({
  title,
  groups,
  selectedPostId,
  onPick,
}: {
  title?: string;
  groups: PostGroup[];
  selectedPostId: string | null;
  onPick: (group: PostGroup) => void;
}) {
  if (!groups.length) return null;
  return (
    <div>
      {title ? (
        <p className="px-3 pb-1 pt-3 text-[11px] font-semibold tracking-tight text-text-muted">
          {title}
        </p>
      ) : null}
      <ul>
        {groups.map((group) => {
          const active = selectedPostId === group.publicationId;
          const via = group.accountLabel
            ? `@${group.accountLabel.replace(/^@/, "")}`
            : PLATFORM_LABEL[group.platform] ?? group.platform;
          const badge = group.unanswered;
          return (
            <li key={group.publicationId} className="px-2 py-0.5">
              <button
                type="button"
                onClick={() => onPick(group)}
                className={cn(
                  "relative flex w-full gap-2.5 rounded-2xl px-2.5 py-2.5 text-left transition-[background-color,transform,box-shadow] duration-150 ease-out active:scale-[0.99]",
                  active
                    ? "bg-accent/[0.08] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)]"
                    : "hover:bg-bg-subtle/80",
                )}
              >
                <InboxPostThumbnail
                  mediaUrl={group.postMediaUrl}
                  content={group.postContent || group.postSnippet}
                  platform={group.platform}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium text-text-muted">
                      {PLATFORM_LABEL[group.platform] ?? group.platform} · {via}
                    </span>
                    {badge > 0 ? (
                      <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-text">
                    {group.postContent || group.postSnippet || "(No caption)"}
                  </span>
                  <span className="mt-1 text-[11px] text-text-muted">
                    {group.threads.length} comment
                    {group.threads.length === 1 ? "" : "s"}
                    {group.unanswered > 0
                      ? ` · ${group.unanswered} unanswered`
                      : " · replied from Social0"}
                  </span>
                  {group.unanswered > 0 ? (
                    <span className="mt-2 block h-0.5 w-full overflow-hidden rounded-full bg-bg-muted">
                      <span className="block h-full w-1/3 rounded-full bg-amber-400" />
                    </span>
                  ) : (
                    <span className="mt-2 block h-0.5 w-full rounded-full bg-accent/40" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
