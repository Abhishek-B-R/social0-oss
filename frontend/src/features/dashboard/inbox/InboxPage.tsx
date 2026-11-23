import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ArrowClockwise, Tray, X } from "@/icons/phosphor";
import {
  EmptyState,
  ErrorState,
  InlineError,
  PageContainer,
  PageHeader,
  SkeletonRows,
  Tabs,
  networkLabel,
  useDashboardPath,
  useHotkeys,
  useReportInboxNeedsReply,
} from "@/components/app";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import { useSession } from "@/lib/auth-client";
import { WINDOW_EMPTY_LABEL, defaultDateWindow, type DateWindow } from "@/lib/date-window";
import { cn } from "@/lib/utils";
import { ExperimentalBadge } from "@/components/dashboard/ExperimentalBadge";
import { CommentThreadPane } from "./CommentThreadPane";
import { DmThreadPane } from "./DmThreadPane";
import { FilterSelect, InboxRangeSelect } from "./InboxFilters";
import { InboxList, type InboxListRow } from "./InboxList";
import { InboxStatusBanners } from "./InboxStatusBanners";
import {
  buildCommentItem,
  buildDmItem,
  commentItemKey,
  isHandledLocally,
  isInboundThread,
  itemMatchesStatus,
  itemNeedsReply,
  legacyItemKey,
  parseStatusView,
  parseTypeFilter,
  sortItems,
  visibleInbound,
  type InboxItem,
  type InboxStatusView,
} from "./inbox-items";
import {
  hideInboxPublication,
  markItemHandled,
  unhideInboxPublication,
  unmarkItemHandled,
  useHandledItems,
  useHiddenPublications,
} from "./inbox-local-state";
import { mergePendingReplies, useCommentReplies } from "./use-comment-replies";
import { useDmSender } from "./use-dm-sender";
import { useHideWithUndo } from "./use-hide-with-undo";
import { useCommentLikes } from "./use-comment-likes";
import { useInboxFeed } from "./use-inbox-feed";
import { useIsDesktop } from "./use-is-desktop";

/** Legacy selection params the old split inbox wrote (`?tab=` is migrated separately). */
const LEGACY_PARAMS = ["thread", "convo"] as const;

/**
 * Clock slack for DM marks. A sent DM is handled through a few seconds after
 * our send time, since the server's timestamp for it can land a little later
 * (that mark is provisional: the server's own time replaces it once the
 * thread re-reads after the send, open or not). The same slack lets the list's activity time stand in for
 * your own last message. Kept small so a quick peer reply is never swallowed.
 */
const DM_CLOCK_SLACK_MS = 5_000;

export function InboxPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const { ready, canViewInbox, canReplyComments, canReplyDms } = useWorkspaceNavPermissions();

  if (sessionPending) return <InboxSkeleton />;

  if (!session) {
    return (
      <GuestPostsPageView
        pageTitle="Inbox"
        promptTitle="Sign in to open your inbox"
        promptDescription="Once you connect accounts, Social0 pulls comments on your posts and DMs from networks that support it."
      />
    );
  }

  if (!ready) return <InboxSkeleton />;

  if (!canViewInbox) {
    return (
      <PageContainer stack>
        <PageHeader title="Inbox" />
        <EmptyState
          icon={<Tray />}
          title="Inbox isn't part of your role"
          description="Ask a team admin to switch you to Member, Community, or Admin."
        />
      </PageContainer>
    );
  }

  return (
    <InboxView
      userId={session.user.id}
      canReplyComments={canReplyComments}
      canReplyDms={canReplyDms}
    />
  );
}

function InboxView({
  userId,
  canReplyComments,
  canReplyDms,
}: {
  userId: string;
  canReplyComments: boolean;
  canReplyDms: boolean;
}) {
  const dash = useDashboardPath();
  const isDesktop = useIsDesktop();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [dateWindow, setDateWindow] = useState<DateWindow>(defaultDateWindow);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const status = parseStatusView(searchParams.get("status"));
  const type = parseTypeFilter(searchParams.get("type"), searchParams.get("tab"));
  const networkParam = searchParams.get("network");
  const accountParam = searchParams.get("account");
  const postParam = searchParams.get("post");
  const itemParam = searchParams.get("item");

  const updateParams = useCallback(
    (mutate: (p: URLSearchParams) => void, opts?: { push?: boolean; state?: unknown }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: !opts?.push, state: opts?.state },
      );
    },
    [setSearchParams],
  );

  const feed = useInboxFeed({ enabled: true, dateWindow, accountParam, type });
  const handled = useHandledItems(userId);
  const hiddenPublications = useHiddenPublications(userId);
  const replies = useCommentReplies(feed.commentAccounts);
  const { hiddenIds: hiddenCommentIds, hide: hideComment } = useHideWithUndo();
  const { likeOverrides, recordLike } = useCommentLikes();

  const onDmSent = useCallback(
    (key: string, sentAt: string) => {
      const through = new Date(Date.parse(sentAt) + DM_CLOCK_SLACK_MS).toISOString();
      markItemHandled(userId, key, through, { provisional: true });
    },
    [userId],
  );
  // The server's time for the message just sent replaces that provisional
  // mark, even when the thread is no longer open.
  const onDmServerConfirmed = useCallback(
    (key: string, serverAt: string) => {
      markItemHandled(userId, key, serverAt, { exact: true });
    },
    [userId],
  );
  const dmSender = useDmSender({
    workspaceId: feed.workspaceId,
    dmsKey: feed.dmsKey,
    dateWindow,
    accountId: feed.accountId,
    onSent: onDmSent,
    onServerConfirmed: onDmServerConfirmed,
  });

  // Old split-inbox links: `?tab=dms` becomes `?type=dms` so the chips match.
  const legacyTab = searchParams.get("tab");
  useEffect(() => {
    if (!legacyTab) return;
    updateParams((p) => {
      if (legacyTab === "dms" && !p.get("type")) p.set("type", "dms");
      p.delete("tab");
    });
  }, [legacyTab, updateParams]);

  // Drop a stale/foreign ?account= so the URL matches what's shown.
  useEffect(() => {
    if (feed.staleAccountParam) updateParams((p) => p.delete("account"));
  }, [feed.staleAccountParam, updateParams]);

  // ---- Items ---------------------------------------------------------------

  const commentThreads = useMemo(
    () =>
      mergePendingReplies(
        feed.commentThreads.filter(isInboundThread),
        replies.pendingReplies,
      ),
    [feed.commentThreads, replies.pendingReplies],
  );

  const allItems: InboxItem[] = useMemo(() => {
    const comments = commentThreads
      // A thread whose outside comments were all hidden here is gone, except
      // the open one: it stays (with Undo) until you move on.
      .filter(
        (t) =>
          visibleInbound(t, hiddenCommentIds).length > 0 || commentItemKey(t) === itemParam,
      )
      .map((t) => buildCommentItem(t, replies.failedReplyIds, hiddenCommentIds));
    return sortItems([...comments, ...feed.dmThreads.map(buildDmItem)]);
  }, [commentThreads, feed.dmThreads, hiddenCommentIds, itemParam, replies.failedReplyIds]);

  const needsReplyOf = useCallback(
    (item: InboxItem) => itemNeedsReply(item, { handled, hiddenPublications }),
    [handled, hiddenPublications],
  );

  const networks = useMemo(
    () => [...new Set(feed.accounts.map((a) => a.platform))].sort(),
    [feed.accounts],
  );
  const network = networkParam && networks.includes(networkParam) ? networkParam : null;

  /** Everything except the status view. */
  const filteredItems = useMemo(
    () =>
      allItems.filter((item) => {
        if (network && item.platform !== network) return false;
        if (feed.accountId && item.accountId !== feed.accountId) return false;
        if (postParam && (item.kind !== "comment" || item.publicationId !== postParam)) {
          return false;
        }
        return true;
      }),
    [allItems, feed.accountId, network, postParam],
  );

  const needsReplyCount = useMemo(
    () => filteredItems.filter(needsReplyOf).length,
    [filteredItems, needsReplyOf],
  );

  // Nav badge: only the unfiltered, fully loaded count is the workspace's.
  const badgeCountTrusted =
    type === "all" &&
    dateWindow.range === defaultDateWindow().range &&
    !network &&
    !feed.accountId &&
    !postParam &&
    !feed.initialLoading &&
    !feed.commentsError &&
    !feed.dmsError &&
    !feed.accountsError &&
    !feed.partialAccountsError;
  useReportInboxNeedsReply(badgeCountTrusted ? needsReplyCount : null);

  // ---- Selection -----------------------------------------------------------

  const urlKey = useMemo(() => {
    if (itemParam) return itemParam;
    return legacyItemKey(allItems, {
      thread: searchParams.get("thread"),
      convo: searchParams.get("convo"),
      account: accountParam,
    });
  }, [accountParam, allItems, itemParam, searchParams]);

  // Only an item that passes the current filters counts as selected.
  const urlItem = urlKey ? (filteredItems.find((i) => i.key === urlKey) ?? null) : null;

  const rows: InboxListRow[] = useMemo(
    () =>
      filteredItems
        .map((item) => ({ item, needsReply: needsReplyOf(item) }))
        // The open thread stays put after you reply, until you move on.
        .filter((r) => itemMatchesStatus(r.item, status, r.needsReply) || r.item.key === urlKey),
    [filteredItems, needsReplyOf, status, urlKey],
  );

  /**
   * The URL names a thread whose source (comments or DMs) is still on its
   * first load: wait for it instead of falling back to the first row, which
   * would then be pinned over the link.
   */
  const awaitingUrlItem =
    !urlItem &&
    Boolean(itemParam || LEGACY_PARAMS.some((k) => searchParams.get(k))) &&
    (feed.commentsLoading || feed.dmsLoading);

  const selected: InboxItem | null =
    urlItem ?? (isDesktop && !awaitingUrlItem ? (rows[0]?.item ?? null) : null);

  // Desktop: pin the default (first) row in the URL so it stays selected
  // (and visible) after replying, like any explicitly opened thread.
  useEffect(() => {
    if (!isDesktop || feed.initialLoading || awaitingUrlItem) return;
    if (urlItem || !selected) return;
    updateParams((p) => {
      p.set("item", selected.key);
      for (const k of LEGACY_PARAMS) p.delete(k);
    });
  }, [awaitingUrlItem, feed.initialLoading, isDesktop, selected, updateParams, urlItem]);

  // Latest URL bits for callbacks that outlive a render (toast actions).
  const openItemRef = useRef(urlKey);
  const locationStateRef = useRef<unknown>(location.state);
  useEffect(() => {
    openItemRef.current = urlKey;
    locationStateRef.current = location.state;
  });

  const select = useCallback(
    (key: string | null, opts?: { replace?: boolean }) => {
      // Phones: opening a thread from the list is a navigation, so Back
      // returns to the list. `replace` moves from one open thread to another
      // (Mark done, Undo) by swapping the history entry, so Back still lands
      // on the list instead of the thread you just finished.
      const swap = Boolean(opts?.replace && openItemRef.current);
      updateParams(
        (p) => {
          if (key) p.set("item", key);
          else p.delete("item");
          p.delete("thread");
          p.delete("convo");
        },
        !isDesktop && key
          ? swap
            ? { state: locationStateRef.current }
            : { push: true, state: { inboxThreadPushed: true } }
          : undefined,
      );
    },
    [isDesktop, updateParams],
  );

  const pushedThread = Boolean(
    (location.state as { inboxThreadPushed?: boolean } | null)?.inboxThreadPushed,
  );
  const closeThread = useCallback(() => {
    // We pushed this thread onto history: pop it so Back/forward stay sane.
    if (!isDesktop && pushedThread) {
      navigate(-1);
      return;
    }
    select(null);
  }, [isDesktop, navigate, pushedThread, select]);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (!rows.length) return;
      const idx = selected ? rows.findIndex((r) => r.item.key === selected.key) : -1;
      const nextIdx =
        idx < 0 ? (delta === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, idx + delta));
      const next = rows[nextIdx];
      if (next && next.item.key !== selected?.key) select(next.item.key);
    },
    [rows, select, selected],
  );

  // ---- Actions -------------------------------------------------------------

  const selectedNeedsReply = selected ? needsReplyOf(selected) : false;
  const selectedHandledLocally = selected ? isHandledLocally(selected, handled) : false;
  const canToggleDone = selected
    ? selectedNeedsReply || selectedHandledLocally
    : false;

  const toggleDone = useCallback(() => {
    if (!selected) return;
    const key = selected.key;
    if (needsReplyOf(selected)) {
      const idx = rows.findIndex((r) => r.item.key === key);
      const after = rows.slice(idx + 1).find((r) => r.item.key !== key) ?? rows[idx - 1];
      markItemHandled(userId, key, selected.at || new Date().toISOString());
      if (status === "needs_reply") {
        if (after) select(after.item.key, { replace: true });
        else closeThread();
      }
      toast("Marked done", {
        action: {
          label: "Undo",
          onClick: () => {
            unmarkItemHandled(userId, key);
            select(key, { replace: true });
          },
        },
      });
    } else if (isHandledLocally(selected, handled)) {
      unmarkItemHandled(userId, key);
      toast("Moved back to Needs reply");
    }
  }, [closeThread, handled, needsReplyOf, rows, select, selected, status, userId]);

  const togglePostHidden = useCallback(
    (publicationId: string) => {
      if (hiddenPublications.has(publicationId)) {
        unhideInboxPublication(userId, publicationId);
        toast.message("Post is back in Needs reply");
      } else {
        hideInboxPublication(userId, publicationId);
        toast.message("Post hidden from Needs reply", {
          description: "Its comments still show under All.",
          action: {
            label: "Undo",
            onClick: () => unhideInboxPublication(userId, publicationId),
          },
        });
      }
    },
    [hiddenPublications, userId],
  );

  const selectedKey = selected?.key ?? null;
  const selectedAt = selected?.at ?? "";
  /**
   * The open DM's newest message is yours: it's handled through that message.
   * Once it's the server's copy, its time replaces the provisional mark from
   * sending (our clock can run ahead and swallow a quick peer reply).
   */
  const onLastMessageOwn = useCallback(
    (lastOwnAt: string | null, fromServer: boolean) => {
      if (!selectedKey) return;
      const ownMs = lastOwnAt ? Date.parse(lastOwnAt) : NaN;
      const atMs = selectedAt ? Date.parse(selectedAt) : NaN;
      let through: string;
      if (!lastOwnAt || !Number.isFinite(ownMs)) {
        through = selectedAt || new Date().toISOString();
      } else if (Number.isFinite(atMs) && atMs >= ownMs && atMs <= ownMs + DM_CLOCK_SLACK_MS) {
        // The list's activity time is this same message, within clock slack.
        through = selectedAt;
      } else {
        // The list is staler than the thread, or shows activity after your
        // message (the open thread can lag the list): handled only through
        // your message, so a newer peer message still needs a reply.
        through = lastOwnAt;
      }
      markItemHandled(userId, selectedKey, through, { exact: fromServer });
    },
    [selectedAt, selectedKey, userId],
  );

  const refresh = useCallback(() => {
    void feed.refresh(selected?.kind === "dm" ? selected.dm : null);
  }, [feed, selected]);

  useHotkeys([
    { keys: "j", handler: () => move(1) },
    { keys: "k", handler: () => move(-1) },
    {
      keys: "r",
      handler: () => replyInputRef.current?.focus(),
      enabled: Boolean(selected),
    },
    { keys: "e", handler: toggleDone, enabled: canToggleDone },
  ]);

  // ---- Render --------------------------------------------------------------

  const rangeLabel =
    dateWindow.range === "custom" ? "this date range" : WINDOW_EMPTY_LABEL[dateWindow.range];
  const updatedLabel = feed.fetchedAt
    ? `Updated ${formatDistanceToNow(new Date(feed.fetchedAt), { addSuffix: true })}`
    : null;

  const noAccounts =
    feed.accountsSettled &&
    !feed.accountsError &&
    !feed.partialAccountsError &&
    feed.commentAccounts.length === 0 &&
    feed.dmAccounts.length === 0;
  const kindUnavailable =
    feed.accountsSettled &&
    !feed.accountsError &&
    !noAccounts &&
    ((type === "dms" && !feed.dmsReady) || (type === "comments" && !feed.commentsReady));

  const postItem = postParam
    ? allItems.find((i) => i.kind === "comment" && i.publicationId === postParam)
    : null;
  const postSnippet =
    postItem?.kind === "comment"
      ? (postItem.thread.comment.postSnippet || postItem.thread.comment.postContent || "").trim()
      : "";

  const postStats = useMemo(() => {
    if (selected?.kind !== "comment") return { count: 0, needsReply: 0 };
    const same = allItems.filter(
      (i) => i.kind === "comment" && i.publicationId === selected.publicationId,
    );
    return { count: same.length, needsReply: same.filter(needsReplyOf).length };
  }, [allItems, needsReplyOf, selected]);

  const statusTabs: Array<{ value: InboxStatusView; label: string; count?: number }> = [
    { value: "needs_reply", label: "Needs reply", count: needsReplyCount },
    { value: "done", label: "Done" },
    { value: "all", label: "All" },
  ];

  const accountValue = feed.accountId ?? (network ? `network:${network}` : "all");
  const setAccountOrNetwork = (value: string) =>
    updateParams((p) => {
      p.delete("account");
      p.delete("network");
      if (value.startsWith("network:")) p.set("network", value.slice("network:".length));
      else if (value !== "all") p.set("account", value);
    });
  const accountOption = (a: (typeof feed.accounts)[number]) => (
    <option key={a.id} value={a.id}>
      {a.username ? `@${a.username.replace(/^@/, "")}` : "Account"}
      {networks.length > 1 ? "" : ` · ${networkLabel(a.platform)}`}
      {a.missingScopes.length ? " · needs reconnect" : ""}
    </option>
  );

  return (
    <PageContainer stack>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            Inbox
            <ExperimentalBadge withTip />
          </span>
        }
        actions={
          <button
            type="button"
            onClick={refresh}
            disabled={!feed.accountsSettled || feed.refreshing}
            title={
              updatedLabel
                ? `${updatedLabel}. Fetch the latest comments and DMs from each network.`
                : "Fetch the latest comments and DMs from each network"
            }
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 text-[13px] font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10"
          >
            <ArrowClockwise
              size={15}
              className={cn(
                "text-text-muted",
                feed.fetching && "animate-spin motion-reduce:animate-none",
              )}
              aria-hidden
            />
            {feed.refreshing ? "Refreshing" : "Refresh"}
          </button>
        }
      >
        {noAccounts || feed.accountsError ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              variant="pill"
              aria-label="Show"
              items={statusTabs}
              value={status}
              onChange={(next) =>
                updateParams((p) => {
                  if (next === "needs_reply") p.delete("status");
                  else p.set("status", next);
                })
              }
              className="p-0.5"
            />
            <InboxRangeSelect
              value={dateWindow}
              onChange={setDateWindow}
              resolvedSince={feed.resolvedWindow?.since}
              resolvedUntil={feed.resolvedWindow?.until}
              resolvedTimeZone={feed.resolvedWindow?.timeZone}
            />
            <FilterSelect
              label="Comments or DMs"
              value={type}
              onChange={(next) =>
                updateParams((p) => {
                  if (next === "all") p.delete("type");
                  else p.set("type", next);
                  p.delete("tab");
                  p.delete("post");
                })
              }
            >
              <option value="all">Comments and DMs</option>
              <option value="comments">Comments</option>
              <option value="dms">DMs</option>
            </FilterSelect>
            {feed.accounts.length > 1 || networks.length > 1 ? (
              <FilterSelect
                label="Account"
                value={accountValue}
                onChange={setAccountOrNetwork}
                className="max-w-[16rem]"
              >
                <option value="all">All accounts</option>
                {networks.length > 1
                  ? networks.map((n) => (
                      <optgroup key={n} label={networkLabel(n)}>
                        <option value={`network:${n}`}>All {networkLabel(n)}</option>
                        {feed.accounts.filter((a) => a.platform === n).map(accountOption)}
                      </optgroup>
                    ))
                  : feed.accounts.map(accountOption)}
              </FilterSelect>
            ) : null}
            {postParam ? (
              <span className="inline-flex h-9 max-w-full min-w-0 items-center gap-1 rounded-lg bg-bg-muted pr-1 pl-3 text-[13px] text-text">
                <span className="min-w-0 truncate">On “{postSnippet || "this post"}”</span>
                <button
                  type="button"
                  onClick={() => updateParams((p) => p.delete("post"))}
                  aria-label="Show comments from all posts"
                  title="Show comments from all posts"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <X size={12} weight="bold" />
                </button>
              </span>
            ) : null}
          </div>
        )}
      </PageHeader>

      <InboxStatusBanners
        comments={feed.commentsReady ? feed.commentMeta : null}
        dms={feed.dmsReady ? feed.dmMeta : null}
        onRetry={refresh}
        retrying={feed.refreshing}
      />

      {feed.accountsError ? (
        <ErrorState
          message="Couldn't load your inbox accounts."
          detail={feed.accountsError instanceof Error ? feed.accountsError.message : null}
          onRetry={feed.retryAccounts}
        />
      ) : noAccounts ? (
        <EmptyState
          icon={<Tray />}
          title="Connect an account to use the inbox"
          description="Comments on posts you publish through Social0 and DMs to your connected accounts show up here."
          primaryAction={{ label: "Connect account", href: dash("connections?connect=1") }}
        />
      ) : (
        <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:h-[calc(100dvh-15rem)] lg:min-h-[32rem] lg:grid-cols-[21rem_minmax(0,1fr)]">
          {/* List pane */}
          <aside
            aria-label="Inbox list"
            className="flex min-h-0 flex-col border-border lg:border-r"
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {feed.partialAccountsError ? (
                <InlineError
                  className="border-b border-border px-3 py-2"
                  message={`Couldn't load your ${feed.partialAccountsError === "comments" ? "comment" : "DM"} accounts.`}
                  onRetry={feed.retryAccounts}
                />
              ) : null}
              {feed.commentsError ? (
                <InlineError
                  className="border-b border-border px-3 py-2"
                  message="Couldn't load comments."
                  onRetry={feed.retryComments}
                />
              ) : null}
              {feed.dmsError ? (
                <InlineError
                  className="border-b border-border px-3 py-2"
                  message="Couldn't load DMs."
                  onRetry={feed.retryDms}
                />
              ) : null}

              {/* Comments often land seconds before DMs: an empty list while
                  either is still loading is not "all caught up" yet. */}
              {feed.initialLoading ||
              (rows.length === 0 && (feed.commentsLoading || feed.dmsLoading)) ? (
                <div aria-busy className="p-3">
                  <SkeletonRows rows={6} />
                </div>
              ) : kindUnavailable ? (
                <EmptyState
                  compact
                  className="px-4"
                  title={type === "dms" ? "No DMs for these accounts." : "No comments for these accounts."}
                  secondaryAction={{
                    label: "Show comments and DMs",
                    onClick: () =>
                      updateParams((p) => {
                        p.delete("type");
                        p.delete("tab");
                        p.delete("account");
                        p.delete("network");
                      }),
                  }}
                />
              ) : rows.length === 0 ? (
                <EmptyList
                  status={status}
                  rangeLabel={rangeLabel}
                  filtered={Boolean(network || feed.accountId || postParam || type !== "all")}
                  hasOlder={feed.hasOlder}
                  loadingOlder={feed.loadingOlder}
                  onLoadOlder={feed.loadOlder}
                  onShowAll={() => updateParams((p) => p.set("status", "all"))}
                />
              ) : (
                <>
                  <InboxList
                    rows={rows}
                    selectedKey={selected?.key ?? null}
                    showStateMarks={status !== "needs_reply"}
                    onSelect={select}
                    onMove={move}
                  />
                  {feed.commentsLoading || feed.dmsLoading ? (
                    <p className="px-4 py-2 text-xs text-text-muted" aria-live="polite">
                      Loading {feed.commentsLoading ? "comments" : "DMs"}…
                    </p>
                  ) : null}
                  {feed.hasOlder ? (
                    <div className="border-t border-border/70 px-4 py-2">
                      <button
                        type="button"
                        onClick={feed.loadOlder}
                        disabled={feed.loadingOlder}
                        className="text-[13px] font-medium text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        {feed.loadingOlder ? "Loading…" : "Load older"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </aside>

          {/* Thread pane: right column on desktop, its own screen on phones. */}
          <section
            aria-label="Conversation"
            className={cn(
              "min-h-0 min-w-0 flex-col bg-bg-elevated",
              "fixed inset-x-0 top-0 bottom-[var(--bottom-nav-total)] z-[35] pt-[env(safe-area-inset-top)]",
              "lg:static lg:inset-auto lg:bottom-auto lg:z-auto lg:pt-0",
              selected ? "flex" : "hidden lg:flex",
            )}
          >
            {selected?.kind === "comment" ? (
              <CommentThreadPane
                key={selected.key}
                item={selected}
                account={feed.commentAccounts.find((a) => a.id === selected.accountId)}
                allowReply={canReplyComments}
                sendingReplyIds={replies.sendingReplyIds}
                failedReplyIds={replies.failedReplyIds}
                hiddenCommentIds={hiddenCommentIds}
                likeOverrides={likeOverrides}
                onLiked={recordLike}
                done={!selectedNeedsReply}
                canToggleDone={canToggleDone}
                postHidden={hiddenPublications.has(selected.publicationId)}
                postStats={postStats}
                replyInputRef={replyInputRef}
                onToggleDone={toggleDone}
                onTogglePostHidden={() => togglePostHidden(selected.publicationId)}
                onShowPostComments={
                  postParam === selected.publicationId
                    ? undefined
                    : () =>
                        updateParams((p) => {
                          p.set("post", selected.publicationId);
                          p.delete("type");
                          p.delete("tab");
                          p.set("status", "all");
                        })
                }
                onSend={(uiParentId, payload) =>
                  void replies.sendReply(selected.thread, uiParentId, payload)
                }
                onRetryReply={(id) => replies.retryReply(id, commentThreads)}
                onHide={hideComment}
                onBack={closeThread}
              />
            ) : selected?.kind === "dm" ? (
              <DmThreadPane
                key={selected.key}
                item={selected}
                workspaceId={feed.workspaceId}
                allowReply={canReplyDms}
                pending={dmSender.pendingFor(selected.dm)}
                done={!selectedNeedsReply}
                canToggleDone={canToggleDone}
                replyInputRef={replyInputRef}
                onToggleDone={toggleDone}
                onSend={(thread, payload) => void dmSender.sendMessage(thread, payload)}
                onRetry={dmSender.retryMessage}
                onLastMessageOwn={onLastMessageOwn}
                onBack={closeThread}
              />
            ) : (
              <p className="flex flex-1 items-center justify-center p-8 text-sm text-text-muted">
                {feed.initialLoading || awaitingUrlItem
                  ? "Loading your inbox…"
                  : "Pick a comment or DM to read it."}
              </p>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}

function EmptyList({
  status,
  rangeLabel,
  filtered,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onShowAll,
}: {
  status: InboxStatusView;
  rangeLabel: string;
  filtered: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onShowAll: () => void;
}) {
  const older = hasOlder
    ? { label: loadingOlder ? "Loading…" : "Load older", onClick: onLoadOlder }
    : undefined;
  if (status === "needs_reply") {
    return (
      <EmptyState
        compact
        className="px-4"
        title="You're all caught up."
        description={`Nothing ${filtered ? "here " : ""}needs a reply from ${rangeLabel}.`}
        primaryAction={older}
        secondaryAction={{ label: "Show all", onClick: onShowAll }}
      />
    );
  }
  if (status === "done") {
    return (
      <EmptyState
        compact
        className="px-4"
        title="Nothing done yet."
        description="Threads you reply to or mark done land here."
        primaryAction={older}
      />
    );
  }
  return (
    <EmptyState
      compact
      className="px-4"
      title={filtered ? "Nothing matches these filters." : `No comments or DMs from ${rangeLabel}.`}
      primaryAction={older}
    />
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <div className="h-9 w-36 animate-pulse rounded bg-bg-muted motion-reduce:animate-none" />
      <div className="h-[28rem] animate-pulse rounded-xl bg-bg-muted motion-reduce:animate-none" />
    </div>
  );
}
