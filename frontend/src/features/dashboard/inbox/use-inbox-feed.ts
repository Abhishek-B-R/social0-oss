import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getInboxDmThread,
  listInboxAccounts,
  listInboxComments,
  listInboxDms,
  type InboxDmThread,
  type InboxThread,
} from "@/api/inbox";
import { listWorkspaces } from "@/api/team";
import type { DateWindow } from "@/lib/date-window";
import { initialInboxPageParam } from "@/lib/inbox-infinite";
import { INBOX_MAX_PAGES, inboxGetNextPageParam } from "@/lib/inbox-page-param";
import { PAGE_LIVE_QUERY } from "@/lib/page-live-query";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { InboxDmThreadLoadError } from "./dm-thread-layout";
import { inboxMetaFromPages } from "./inbox-meta";
import {
  unionAccounts,
  type InboxFilterAccount,
  type InboxTypeFilter,
} from "./inbox-items";

/** Active workspace id for cache keys ("main" = personal). */
export function useInboxWorkspace(enabled: boolean) {
  const query = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled,
  });
  return {
    ready: query.isSuccess || query.isError,
    workspaceId: query.data?.workspaces.find((w) => w.isActive)?.id ?? "main",
  };
}

export function dmThreadQueryKey(
  workspaceId: string,
  thread: Pick<InboxDmThread, "accountId" | "conversationId"> | null,
) {
  return thread
    ? (["inbox-dm-thread", workspaceId, thread.accountId, thread.conversationId] as const)
    : (["inbox-dm-thread", workspaceId, "none"] as const);
}

/**
 * One DM thread page (the open pane's query and the post-send re-read share
 * the newest one; `cursor` reads an older page). Throws
 * `InboxDmThreadLoadError` so the UI can tell throttling from failure.
 */
export async function fetchDmThread(
  thread: Pick<InboxDmThread, "accountId" | "conversationId" | "peerId">,
  cursor?: string,
) {
  const result = await getInboxDmThread({
    accountId: thread.accountId,
    conversationId: thread.conversationId,
    peerId: thread.peerId,
    ...(cursor ? { cursor } : {}),
  });
  if ("error" in result) throw new InboxDmThreadLoadError(result);
  return result;
}

/**
 * Replace page 1 with a fresh read and drop older pages, so reconnect and
 * fetch-error banners reflect the newest read. Resolves false on failure
 * (unlike `refreshInboxInfiniteFirstPage`, which is silent by design).
 */
async function replaceFirstPage<TPage>(
  qc: QueryClient,
  queryKey: readonly unknown[],
  fetchFirstPage: () => Promise<TPage>,
): Promise<boolean> {
  try {
    const first = await fetchFirstPage();
    qc.setQueryData<InfiniteData<TPage>>(queryKey, (old) => ({
      pages: [first],
      pageParams: [old?.pageParams[0]],
    }));
    return true;
  } catch {
    return false;
  }
}

function dedupe<T>(pages: Array<{ threads: T[] }> | undefined, key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages ?? []) {
    for (const t of page.threads) {
      const k = key(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

/**
 * Both live inbox reads (comments + DMs) behind one set of filters.
 *
 * Cache keys match the old split inbox (`inbox-comments`, `inbox-dms`,
 * `inbox-accounts`, `inbox-dm-thread`) so workspace switches keep
 * invalidating them (`lib/team-query-keys.ts`).
 */
export function useInboxFeed({
  enabled,
  dateWindow,
  accountParam,
  type,
}: {
  enabled: boolean;
  dateWindow: DateWindow;
  /** `?account=`: null/"all" = every account. */
  accountParam: string | null;
  type: InboxTypeFilter;
}) {
  const qc = useQueryClient();
  const { ready: workspaceReady, workspaceId } = useInboxWorkspace(enabled);
  const base = enabled && workspaceReady;

  const commentAccountsQuery = useQuery({
    queryKey: ["inbox-accounts", workspaceId, "comments"],
    queryFn: () => listInboxAccounts({ mode: "comments" }),
    enabled: base,
    ...PAGE_LIVE_QUERY,
  });
  const dmAccountsQuery = useQuery({
    queryKey: ["inbox-accounts", workspaceId, "dms"],
    queryFn: () => listInboxAccounts({ mode: "dms" }),
    enabled: base,
    ...PAGE_LIVE_QUERY,
  });

  const commentAccounts = useMemo(
    () => commentAccountsQuery.data ?? [],
    [commentAccountsQuery.data],
  );
  const dmAccounts = useMemo(() => dmAccountsQuery.data ?? [], [dmAccountsQuery.data]);
  const accounts: InboxFilterAccount[] = useMemo(
    () => unionAccounts(commentAccounts, dmAccounts),
    [commentAccounts, dmAccounts],
  );

  const accountsSettled =
    (commentAccountsQuery.isSuccess || commentAccountsQuery.isError) &&
    (dmAccountsQuery.isSuccess || dmAccountsQuery.isError);
  const accountsError =
    commentAccountsQuery.isError && dmAccountsQuery.isError
      ? (commentAccountsQuery.error ?? dmAccountsQuery.error)
      : null;

  // A stale or foreign `?account=` falls back to all accounts. Fetches wait
  // until the account lists settle so we never fan out to every platform
  // and then again for the pinned account.
  const requestedAccount =
    accountParam && accountParam !== "all" ? accountParam : null;
  const accountId =
    requestedAccount && accounts.some((a) => a.id === requestedAccount)
      ? requestedAccount
      : null;
  // Only call it stale when both lists loaded (a failed list may hold it).
  const staleAccountParam = Boolean(
    requestedAccount &&
      commentAccountsQuery.isSuccess &&
      dmAccountsQuery.isSuccess &&
      !accountId,
  );

  const wantComments = type !== "dms";
  const wantDms = type !== "comments";
  const commentsReady =
    base &&
    accountsSettled &&
    wantComments &&
    (commentAccountsQuery.isError
      ? !accountId
      : commentAccounts.length > 0 &&
        (!accountId || commentAccounts.some((a) => a.id === accountId)));
  const dmsReady =
    base &&
    accountsSettled &&
    wantDms &&
    (dmAccountsQuery.isError
      ? !accountId
      : dmAccounts.length > 0 &&
        (!accountId || dmAccounts.some((a) => a.id === accountId)));

  const commentsKey = useMemo(
    () => ["inbox-comments", workspaceId, dateWindow, accountId] as const,
    [workspaceId, dateWindow, accountId],
  );
  const dmsKey = useMemo(
    () => ["inbox-dms", workspaceId, dateWindow, accountId] as const,
    [workspaceId, dateWindow, accountId],
  );

  const commentsQuery = useInfiniteQuery({
    queryKey: commentsKey,
    queryFn: ({ pageParam }) =>
      listInboxComments({ ...pageParam, accountId: accountId || undefined }),
    initialPageParam: initialInboxPageParam(dateWindow),
    getNextPageParam: inboxGetNextPageParam,
    enabled: commentsReady,
    ...PAGE_LIVE_QUERY,
    maxPages: INBOX_MAX_PAGES,
  });

  const dmsQuery = useInfiniteQuery({
    queryKey: dmsKey,
    queryFn: ({ pageParam }) =>
      listInboxDms({ ...pageParam, accountId: accountId || undefined }),
    initialPageParam: initialInboxPageParam(dateWindow),
    getNextPageParam: inboxGetNextPageParam,
    enabled: dmsReady,
    ...PAGE_LIVE_QUERY,
    maxPages: INBOX_MAX_PAGES,
  });

  const commentThreads: InboxThread[] = useMemo(
    () =>
      commentsReady
        ? dedupe(commentsQuery.data?.pages, (t) => `${t.comment.publicationId}-${t.comment.id}`)
        : [],
    [commentsQuery.data, commentsReady],
  );
  const dmThreads: InboxDmThread[] = useMemo(
    () =>
      dmsReady
        ? dedupe(dmsQuery.data?.pages, (t) => `${t.accountId}:${t.conversationId}`)
        : [],
    [dmsQuery.data, dmsReady],
  );

  const commentMeta = inboxMetaFromPages(commentsReady ? commentsQuery.data?.pages : undefined);
  const dmMeta = inboxMetaFromPages(dmsReady ? dmsQuery.data?.pages : undefined);

  const commentsLoading = commentsReady && commentsQuery.isPending;
  const dmsLoading = dmsReady && dmsQuery.isPending;
  const accountsLoading = base && !accountsSettled;
  const activeSources = Number(commentsReady) + Number(dmsReady);
  const pendingSources = Number(commentsLoading) + Number(dmsLoading);
  /** Nothing to show yet: every active source is still on its first load. */
  const initialLoading =
    !enabled ||
    !workspaceReady ||
    accountsLoading ||
    (activeSources > 0 && pendingSources === activeSources);

  const hasOlder =
    (commentsReady && Boolean(commentsQuery.hasNextPage)) ||
    (dmsReady && Boolean(dmsQuery.hasNextPage));
  const loadingOlder = commentsQuery.isFetchingNextPage || dmsQuery.isFetchingNextPage;

  const loadOlder = useCallback(() => {
    if (commentsReady && commentsQuery.hasNextPage && !commentsQuery.isFetchingNextPage) {
      void commentsQuery.fetchNextPage();
    }
    if (dmsReady && dmsQuery.hasNextPage && !dmsQuery.isFetchingNextPage) {
      void dmsQuery.fetchNextPage();
    }
  }, [commentsQuery, commentsReady, dmsQuery, dmsReady]);

  const [refreshing, setRefreshing] = useState(false);

  /**
   * Refresh = live fetch (bypasses the server's warm cache, still subject to
   * its soft-fresh window). Replaces page 1 and drops older pages so
   * reconnect/fetch-error banners reflect the newest read.
   */
  const refresh = useCallback(
    async (openDm?: Pick<InboxDmThread, "accountId" | "conversationId" | "peerId"> | null) => {
      if (!accountsSettled) return;
      setRefreshing(true);
      const failed: string[] = [];
      try {
        const jobs: Promise<unknown>[] = [
          qc.invalidateQueries({ queryKey: ["inbox-accounts", workspaceId] }),
        ];
        if (commentsReady) {
          jobs.push(
            replaceFirstPage(qc, commentsKey, () =>
              listInboxComments({
                ...initialInboxPageParam(dateWindow),
                accountId: accountId || undefined,
                fresh: true,
              }),
            ).then((ok) => {
              if (!ok) failed.push("comments");
            }),
          );
        }
        if (dmsReady) {
          jobs.push(
            replaceFirstPage(qc, dmsKey, () =>
              listInboxDms({
                ...initialInboxPageParam(dateWindow),
                accountId: accountId || undefined,
                fresh: true,
              }),
            ).then((ok) => {
              if (!ok) failed.push("DMs");
            }),
          );
        }
        if (openDm) {
          const key = dmThreadQueryKey(workspaceId, openDm);
          jobs.push(
            getInboxDmThread({
              accountId: openDm.accountId,
              conversationId: openDm.conversationId,
              peerId: openDm.peerId,
              fresh: true,
            })
              .then((result) => {
                if (!("error" in result)) qc.setQueryData(key, result);
              })
              .catch(() => undefined),
          );
        }
        await Promise.all(jobs);
        if (failed.length) {
          toast.error(`Couldn't refresh ${failed.join(" or ")}.`, {
            description: "Check your connection, then press Refresh again.",
          });
        }
      } finally {
        setRefreshing(false);
      }
    },
    [
      accountId,
      accountsSettled,
      commentsKey,
      commentsReady,
      dateWindow,
      dmsKey,
      dmsReady,
      qc,
      workspaceId,
    ],
  );

  // When a network said "nothing saved yet, try again at X", retry on our
  // own (a normal read, not a forced refresh) instead of asking the user to.
  const retryPlan = useMemo(() => {
    const earliest = (notices: { kind?: string; retryAt?: string }[] | undefined) =>
      (notices ?? [])
        .filter((n) => n.kind === "retry" && n.retryAt)
        .map((n) => Date.parse(n.retryAt!))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)[0];
    const comments = commentsReady ? earliest(commentMeta?.notices) : undefined;
    const dms = dmsReady ? earliest(dmMeta?.notices) : undefined;
    const at = [comments, dms].filter((t): t is number => t != null).sort((a, b) => a - b)[0];
    return at == null ? null : { at, comments: comments != null, dms: dms != null };
  }, [commentMeta?.notices, commentsReady, dmMeta?.notices, dmsReady]);

  const { refetch: refetchComments } = commentsQuery;
  const { refetch: refetchDms } = dmsQuery;
  useEffect(() => {
    if (!retryPlan) return;
    const wait = Math.min(Math.max(retryPlan.at - Date.now(), 15_000), 5 * 60_000);
    const t = setTimeout(() => {
      if (retryPlan.comments) void refetchComments();
      if (retryPlan.dms) void refetchDms();
    }, wait);
    return () => clearTimeout(t);
  }, [retryPlan, refetchComments, refetchDms]);

  const fetchedAt = useMemo(() => {
    const times = [
      commentsReady ? commentsQuery.data?.pages[0]?.fetchedAt : undefined,
      dmsReady ? dmsQuery.data?.pages[0]?.fetchedAt : undefined,
    ].filter((t): t is string => Boolean(t));
    // The older of the two is what "Updated" honestly means.
    return times.sort()[0] ?? null;
  }, [commentsQuery.data, commentsReady, dmsQuery.data, dmsReady]);

  /**
   * The window the server actually read (page 1). It clamps a custom range
   * to a year and to "now", so labels should show this, not the request.
   */
  const resolvedWindow = useMemo(() => {
    const first =
      (commentsReady ? commentsQuery.data?.pages[0] : undefined) ??
      (dmsReady ? dmsQuery.data?.pages[0] : undefined);
    return first
      ? { since: first.since, until: first.until, timeZone: first.timeZone ?? null }
      : null;
  }, [commentsQuery.data, commentsReady, dmsQuery.data, dmsReady]);

  return {
    workspaceId,
    resolvedWindow,
    accounts,
    commentAccounts,
    dmAccounts,
    accountId,
    staleAccountParam,
    accountsSettled,
    accountsLoading,
    accountsError,
    /** Exactly one of the two account lists failed (the other kind still works). */
    partialAccountsError:
      !accountsError && (commentAccountsQuery.isError || dmAccountsQuery.isError)
        ? commentAccountsQuery.isError
          ? ("comments" as const)
          : ("dms" as const)
        : null,
    retryAccounts: () => {
      void commentAccountsQuery.refetch();
      void dmAccountsQuery.refetch();
    },
    commentsKey,
    dmsKey,
    commentsReady,
    dmsReady,
    commentThreads,
    dmThreads,
    commentMeta,
    dmMeta,
    commentsError: commentsReady && commentsQuery.isError ? commentsQuery.error : null,
    dmsError: dmsReady && dmsQuery.isError ? dmsQuery.error : null,
    retryComments: () => void commentsQuery.refetch(),
    retryDms: () => void dmsQuery.refetch(),
    commentsLoading,
    dmsLoading,
    initialLoading,
    fetching: commentsQuery.isFetching || dmsQuery.isFetching || refreshing,
    hasOlder,
    loadingOlder,
    loadOlder,
    refresh,
    refreshing,
    fetchedAt,
  };
}

export type InboxFeed = ReturnType<typeof useInboxFeed>;
