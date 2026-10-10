import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CircleNotch,
  Clock,
  EnvelopeSimple,
  MagnifyingGlass,
  WarningCircle,
} from "@/icons/phosphor";
import {
  getInboxDmThread,
  listInboxDms,
  replyToInboxDm,
  type InboxDmListResult,
  type InboxDmThread,
  type InboxDmThreadResult,
  type LocalInboxDmMessage,
} from "@/api/inbox";
import { PLATFORM_LABEL } from "@/lib/platforms";
import {
  WINDOW_EMPTY_LABEL,
  type DateWindow,
} from "@/lib/date-window";
import { uploadFile } from "@/lib/upload-file";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InboxAttachmentView } from "./InboxAttachmentView";
import { InboxAvatar } from "./InboxAvatar";
import { InboxComposer, type InboxComposerPayload } from "./InboxComposer";
import { InboxStatusBanners } from "./InboxStatusBanners";
import { inboxMetaFromPages } from "./inbox-meta";
import { resolveInboxBody } from "@/lib/inbox-display";
import { useSession } from "@/lib/auth-client";
import { listWorkspaces } from "@/api/team";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import {
  initialInboxPageParam,
  type InboxPageParam,
} from "@/lib/inbox-infinite";
import {
  INBOX_MAX_PAGES,
  inboxGetNextPageParam,
} from "@/lib/inbox-page-param";
import { PAGE_LIVE_QUERY } from "@/lib/page-live-query";
import {
  convoAccountFromParams,
  DM_CONVO_ACCOUNT_PARAM,
  dmPeerHandleLabel,
  mergeDmThreadIdentity,
} from "./dm-identity";
import {
  dmListTimeLabel,
  dmMessageTimeLabel,
  filterDmThreads,
  flattenDmPages,
  InboxDmThreadLoadError,
  isDmThreadRateLimited,
  layoutDmMessages,
} from "./dm-thread-layout";

function dmKey(t: InboxDmThread): string {
  return `${t.accountId}:${t.conversationId}`;
}

function dmReplyMax(platform: string): number {
  if (platform === "twitter_x") return 10000;
  if (platform === "bluesky") return 1000;
  if (platform === "tiktok") return 6000;
  return 2000;
}

function attachmentFromPreview(
  file: File | null | undefined,
  previewUrl: string | null | undefined,
): LocalInboxDmMessage["attachment"] {
  if (!file || !previewUrl) return null;
  return {
    type: file.type.startsWith("video/") ? "video" : "image",
    url: previewUrl,
  };
}

function dmSplitsImageCaption(platform: string): boolean {
  return platform === "instagram" || platform === "tiktok";
}

function sameLocalDm(
  server: LocalInboxDmMessage,
  local: LocalInboxDmMessage,
): boolean {
  if (server.id && local.id && server.id === local.id) return true;
  if (local.sendStatus === "failed" || local.sendStatus === "sending") {
    return false;
  }
  if (!server.isOwn || !local.isOwn) return false;
  const dt = Math.abs(
    new Date(server.createdAt ?? 0).getTime() -
      new Date(local.createdAt ?? 0).getTime(),
  );
  if (dt > 120_000) return false;
  // IG/TikTok send image then caption as two rows. Drop the combo pending
  // once either half is on the server.
  if (local.attachment && local.text) {
    if (
      server.attachment &&
      server.attachment.type === local.attachment.type &&
      dt < 15_000
    ) {
      return true;
    }
    return !server.attachment && server.text === local.text;
  }
  if (local.attachment || server.attachment) {
    return (
      Boolean(server.attachment) &&
      Boolean(local.attachment) &&
      server.attachment!.type === local.attachment!.type &&
      server.text === local.text &&
      dt < 15_000
    );
  }
  return Boolean(local.text) && server.text === local.text;
}

function mergeMessages(
  server: LocalInboxDmMessage[],
  pending: LocalInboxDmMessage[],
): LocalInboxDmMessage[] {
  const used = new Set<number>();
  const extra = pending.filter((local) => {
    if (local.sendStatus === "failed" || local.sendStatus === "sending") {
      return true;
    }
    const byId = server.findIndex(
      (s, i) => !used.has(i) && s.id && local.id && s.id === local.id,
    );
    if (byId >= 0) {
      used.add(byId);
      return false;
    }
    const byHeuristic = server.findIndex(
      (s, i) => !used.has(i) && sameLocalDm(s, local),
    );
    if (byHeuristic >= 0) {
      used.add(byHeuristic);
      return false;
    }
    return true;
  });
  return [...server, ...extra].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
}

/** Hard stop on "Load earlier" so a sticky cursor can never page forever. */
const DM_THREAD_MAX_PAGES = 40;

type DmThreadPages = InfiniteData<InboxDmThreadResult, string | null>;

export function InboxDmsPane({
  dateWindow,
  accountId,
  enabled,
  allowReply = true,
}: {
  dateWindow: DateWindow;
  accountId: string | null;
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
  const [search, setSearch] = useState("");
  const [pendingByConvo, setPendingByConvo] = useState<
    Record<string, LocalInboxDmMessage[]>
  >({});

  const listKey = useMemo(
    () => ["inbox-dms", workspaceId, dateWindow, accountId] as const,
    [workspaceId, dateWindow, accountId],
  );
  const listQuery = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) =>
      listInboxDms({
        ...pageParam,
        accountId: accountId || undefined,
      }),
    initialPageParam: initialInboxPageParam(dateWindow),
    getNextPageParam: inboxGetNextPageParam,
    enabled: enabled && workspaceReady,
    ...PAGE_LIVE_QUERY,
    maxPages: INBOX_MAX_PAGES,
  });

  const fetchNextDms = listQuery.fetchNextPage;
  const hasNextDms = Boolean(listQuery.hasNextPage);
  const fetchingNextDms = listQuery.isFetchingNextPage;
  const loadOlderDms = useCallback(() => {
    if (hasNextDms && !fetchingNextDms) {
      void fetchNextDms();
    }
  }, [fetchNextDms, fetchingNextDms, hasNextDms]);

  const threads = useMemo(() => {
    const seen = new Set<string>();
    const out: InboxDmThread[] = [];
    for (const page of listQuery.data?.pages ?? []) {
      for (const t of page.threads) {
        const k = dmKey(t);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
    }
    out.sort((a, b) =>
      (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
    );
    return out;
  }, [listQuery.data]);
  const visibleThreads = useMemo(
    () => filterDmThreads(threads, search),
    [threads, search],
  );
  // Only label the receiving account when more than one is in the list.
  const multiAccount = useMemo(
    () => new Set(threads.map((t) => t.accountId)).size > 1,
    [threads],
  );
  const selected =
    threads.find((t) => dmKey(t) === pickedId) ?? threads[0] ?? null;

  // Reconcile the picked conversation with the (async) list and ?convo=.
  useEffect(() => {
    if (!threads.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync to fetched list
      setPickedId(null);
      return;
    }
    const keys = threads.map(dmKey);
    if (pickedId && keys.includes(pickedId)) return;

    const convo = searchParams.get("convo");
    const accountFromUrl = convoAccountFromParams(searchParams, accountId);
    const fromUrl = convo
      ? threads.find(
          (t) =>
            t.conversationId === convo &&
            (!accountFromUrl || t.accountId === accountFromUrl),
        )
      : null;
    if (fromUrl) {
      setPickedId(dmKey(fromUrl));
      // Arriving with ?convo= is an explicit request for that thread, so on
      // mobile open the conversation rather than the list.
      setMobileDetail(true);
      return;
    }
    setPickedId(keys[0] ?? null);
  }, [threads, pickedId, searchParams, accountId]);

  const threadQueryKey = useMemo(
    () =>
      selected
        ? ([
            "inbox-dm-thread",
            workspaceId,
            selected.accountId,
            selected.conversationId,
          ] as const)
        : (["inbox-dm-thread", workspaceId, "none"] as const),
    [selected, workspaceId],
  );

  // Newest page first; "Load earlier" walks back one platform page at a time.
  // Opening a conversation costs exactly one platform read (often zero: the
  // server caches it), instead of pulling the entire history up front.
  const threadQuery = useInfiniteQuery({
    queryKey: threadQueryKey,
    queryFn: async ({ pageParam }) => {
      const result = await getInboxDmThread({
        accountId: selected!.accountId,
        conversationId: selected!.conversationId,
        peerId: selected!.peerId,
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      if ("error" in result) throw new InboxDmThreadLoadError(result);
      return result;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last, _pages, _lastParam, allParams) =>
      allParams.length < DM_THREAD_MAX_PAGES && last.hasMore && last.nextCursor
        ? last.nextCursor
        : undefined,
    enabled: enabled && Boolean(selected),
    ...PAGE_LIVE_QUERY,
    // A throttled read would only be throttled again - let the user retry.
    retry: (count, error) => !isDmThreadRateLimited(error) && count < 1,
  });

  const updatePending = useCallback(
    (key: string, updater: (prev: LocalInboxDmMessage[]) => LocalInboxDmMessage[]) => {
      setPendingByConvo((prev) => ({
        ...prev,
        [key]: updater(prev[key] ?? []),
      }));
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      thread: InboxDmThread,
      payload: InboxComposerPayload,
      opts?: { clientId?: string },
    ) => {
      const key = dmKey(thread);
      const clientId = opts?.clientId ?? `local-${Date.now()}`;
      const createdAt = new Date().toISOString();
      const optimistic: LocalInboxDmMessage = {
        id: clientId,
        text: payload.text,
        createdAt,
        isOwn: true,
        authorName: "You",
        authorHandle: thread.accountLabel,
        authorAvatarUrl: thread.accountProfileImageUrl ?? null,
        attachment: attachmentFromPreview(payload.file, payload.previewUrl),
        sendStatus: "sending",
        localPreviewUrl: payload.previewUrl,
        retryPayload: {
          text: payload.text,
          file: payload.file ?? undefined,
          previewUrl: payload.previewUrl,
        },
      };

      if (!opts?.clientId) {
        updatePending(key, (prev) => [...prev, optimistic]);
      } else {
        updatePending(key, (prev) =>
          prev.map((m) =>
            m.id === clientId ? { ...m, sendStatus: "sending" as const } : m,
          ),
        );
      }

      qc.setQueryData<InfiniteData<InboxDmListResult, InboxPageParam>>(
        listKey,
        (old) => {
          if (!old) return old;
          const snippet =
            payload.text ||
            (payload.file?.type.startsWith("video/") ? "[video]" : "[image]");
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                dmKey(t) === key
                  ? { ...t, snippet, lastMessageAt: createdAt }
                  : t,
              ),
            })),
          };
        },
      );

      try {
        let mediaId: string | undefined;
        if (opts?.clientId) {
          mediaId = pendingByConvo[key]?.find((m) => m.id === clientId)
            ?.retryPayload?.mediaId;
        }
        if (payload.file && !mediaId) {
          const uploaded = await uploadFile(payload.file, 0);
          mediaId = uploaded.id;
          updatePending(key, (prev) =>
            prev.map((m) =>
              m.id === clientId && m.retryPayload
                ? { ...m, retryPayload: { ...m.retryPayload, mediaId } }
                : m,
            ),
          );
        }
        if (!payload.text.trim() && !mediaId) {
          updatePending(key, (prev) =>
            prev.map((m) =>
              m.id === clientId ? { ...m, sendStatus: "failed" as const } : m,
            ),
          );
          toast.error("Add a message or attachment.");
          return;
        }
        const res = await replyToInboxDm({
          accountId: thread.accountId,
          conversationId: thread.conversationId,
          peerId: thread.peerId,
          text: payload.text,
          mediaId,
        });
        if (!res.ok) {
          updatePending(key, (prev) =>
            prev.map((m) =>
              m.id === clientId ? { ...m, sendStatus: "failed" as const } : m,
            ),
          );
          toast.error(res.error);
          return;
        }
        updatePending(key, (prev) =>
          prev.map((m) =>
            m.id === clientId
              ? {
                  ...m,
                  id: res.messageId ?? clientId,
                  sendStatus: undefined,
                }
              : m,
          ),
        );
        // Write the sent message into the newest cached page. No refetch: the
        // server already dropped its cached page for this conversation, and an
        // automatic re-read after every send spent platform quota for nothing.
        if (
          !(
            dmSplitsImageCaption(thread.platform) &&
            payload.file &&
            payload.text.trim()
          )
        ) {
          const threadKey = [
            "inbox-dm-thread",
            workspaceId,
            thread.accountId,
            thread.conversationId,
          ] as const;
          qc.setQueryData<DmThreadPages>(threadKey, (old) => {
            const first = old?.pages[0];
            if (!old || !first) return old;
            const confirmed: LocalInboxDmMessage = {
              id: res.messageId ?? clientId,
              text: payload.text,
              createdAt,
              isOwn: true,
              authorName: "You",
              authorHandle: thread.accountLabel,
              authorAvatarUrl: thread.accountProfileImageUrl ?? null,
              attachment: attachmentFromPreview(payload.file, payload.previewUrl),
            };
            if (first.messages.some((m) => sameLocalDm(m, confirmed))) return old;
            return {
              ...old,
              pages: [
                { ...first, messages: [...first.messages, confirmed] },
                ...old.pages.slice(1),
              ],
            };
          });
        }
      } catch (e) {
        updatePending(key, (prev) =>
          prev.map((m) =>
            m.id === clientId ? { ...m, sendStatus: "failed" as const } : m,
          ),
        );
        toast.error(e instanceof Error ? e.message : "Send failed");
      }
    },
    [listKey, pendingByConvo, qc, updatePending, workspaceId],
  );

  const loading = listQuery.isPending || (listQuery.isFetching && !listQuery.data);
  const inboxMeta = inboxMetaFromPages(listQuery.data?.pages);
  const emptyRangeLabel =
    dateWindow.range === "custom"
      ? "this range"
      : WINDOW_EMPTY_LABEL[dateWindow.range];
  // On a phone the list and the conversation are alternate screens, never
  // stacked. `selected` falls back to threads[0] for the desktop two-pane
  // layout, so keying detail visibility off it made BOTH panes render on
  // mobile — which pushed the reply composer down behind the tab bar. Mobile
  // follows explicit navigation only; the `lg:` classes keep the desktop
  // two-pane view unconditional.
  const showList = !mobileDetail;
  const showDetail = mobileDetail;
  const convoKey = selected ? dmKey(selected) : "";
  const pending = useMemo(
    () => (convoKey ? pendingByConvo[convoKey] ?? [] : []),
    [convoKey, pendingByConvo],
  );
  const serverMessages = useMemo(
    () => flattenDmPages(threadQuery.data?.pages) as LocalInboxDmMessage[],
    [threadQuery.data?.pages],
  );
  const messages = useMemo(
    () => mergeMessages(serverMessages, pending),
    [serverMessages, pending],
  );

  useEffect(() => {
    if (!serverMessages.length || !selected) return;
    const key = dmKey(selected);
    // Drop optimistic messages once the server copy has arrived.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile with fetched messages
    setPendingByConvo((prev) => {
      const list = prev[key];
      if (!list?.length) return prev;
      const used = new Set<number>();
      const next = list.filter((m) => {
        if (m.sendStatus === "failed" || m.sendStatus === "sending") return true;
        const byId = serverMessages.findIndex(
          (s, i) => !used.has(i) && s.id && m.id && s.id === m.id,
        );
        if (byId >= 0) {
          used.add(byId);
          return false;
        }
        const byHeuristic = serverMessages.findIndex(
          (s, i) => !used.has(i) && sameLocalDm(s, m),
        );
        if (byHeuristic >= 0) {
          used.add(byHeuristic);
          return false;
        }
        return true;
      });
      if (next.length === list.length) return prev;
      return { ...prev, [key]: next };
    });
  }, [serverMessages, selected]);

  const firstPageThread = threadQuery.data?.pages[0]?.thread;
  const activeThread = firstPageThread
    ? mergeDmThreadIdentity(firstPageThread, selected)
    : selected;

  const openThread = (t: InboxDmThread) => {
    setPickedId(dmKey(t));
    setMobileDetail(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("convo", t.conversationId);
        // Keep deep links restorable when viewing All accounts, without
        // touching `account` - that is the list filter the user chose.
        next.set(DM_CONVO_ACCOUNT_PARAM, t.accountId);
        return next;
      },
      { replace: true },
    );
  };

  const threadError = threadQuery.error;
  const firstLoadError = threadQuery.isError && !threadQuery.data ? threadError : null;
  const olderPageError =
    threadQuery.isFetchNextPageError && threadQuery.data ? threadError : null;

  return (
    <>
      {listQuery.isError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
          {listQuery.error instanceof Error
            ? listQuery.error.message
            : "Failed to load DMs"}
        </div>
      ) : null}

      <InboxStatusBanners {...inboxMeta} mode="dms" />

      {loading && !listQuery.data ? (
        <DmPaneSkeleton />
      ) : threads.length === 0 ? (
        <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-elevated px-6 text-center">
          <EnvelopeSimple size={28} className="text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">No messages yet</p>
          <p className="mt-1 max-w-md text-sm text-text-muted">
            Direct messages from connected accounts in {emptyRangeLabel} show
            up here.
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-black/[0.06] bg-bg-elevated shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] dark:border-white/[0.08] sm:min-h-[24rem] lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div
            className={cn(
              "min-h-0 flex-col border-border lg:flex lg:border-r",
              showList ? "flex" : "hidden",
            )}
          >
            <div className="shrink-0 border-b border-border/80 px-3 pb-2.5 pt-3">
              <div className="flex items-baseline justify-between">
                <p className="text-[13px] font-semibold text-text">Messages</p>
                <p className="text-[11px] tabular-nums text-text-muted">
                  {threads.length}
                  {hasNextDms ? "+" : ""}
                </p>
              </div>
              <label className="relative mt-2 block">
                <span className="sr-only">Search conversations</span>
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations"
                  className="h-8 w-full rounded-lg border border-border bg-bg-subtle pl-8 pr-2.5 text-[13px] text-text placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
            </div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-1.5">
              {visibleThreads.map((t) => (
                <DmListRow
                  key={dmKey(t)}
                  thread={t}
                  active={selected ? dmKey(selected) === dmKey(t) : false}
                  showAccount={multiAccount}
                  onOpen={() => openThread(t)}
                />
              ))}
              {visibleThreads.length === 0 ? (
                <li className="px-3 py-8 text-center text-[13px] text-text-muted">
                  No conversations match “{search.trim()}”.
                </li>
              ) : null}
              {hasNextDms ? (
                <li className="list-none px-1 pb-1 pt-2">
                  <button
                    type="button"
                    onClick={loadOlderDms}
                    disabled={fetchingNextDms}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-bg-subtle hover:text-text disabled:opacity-60"
                  >
                    {fetchingNextDms ? (
                      <CircleNotch size={12} className="animate-spin" />
                    ) : null}
                    {fetchingNextDms ? "Loading…" : "Load older conversations"}
                  </button>
                </li>
              ) : null}
            </ul>
          </div>

          <section
            className={cn(
              "min-h-0 min-w-0",
              "fixed inset-x-0 top-0 z-30 bottom-[var(--bottom-nav-total)] flex-col bg-bg-elevated pt-[env(safe-area-inset-top)] lg:static lg:inset-auto lg:bottom-auto lg:z-auto lg:bg-transparent lg:pt-0",
              showDetail ? "flex" : "hidden lg:flex",
            )}
          >
            {selected && activeThread ? (
              <DmConversationPane
                key={convoKey}
                thread={activeThread}
                messages={messages}
                allowReply={allowReply}
                loading={threadQuery.isPending && !firstLoadError}
                firstLoadError={firstLoadError}
                olderPageError={olderPageError}
                hasOlder={Boolean(threadQuery.hasNextPage)}
                loadingOlder={threadQuery.isFetchingNextPage}
                retrying={threadQuery.isFetching}
                onLoadOlder={() => {
                  if (threadQuery.hasNextPage && !threadQuery.isFetchingNextPage) {
                    void threadQuery.fetchNextPage();
                  }
                }}
                onRetry={() => void threadQuery.refetch()}
                onBack={() => {
                  setMobileDetail(false);
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.delete("convo");
                      next.delete(DM_CONVO_ACCOUNT_PARAM);
                      return next;
                    },
                    { replace: true },
                  );
                }}
                onSend={(payload) =>
                  void sendMessage(activeThread ?? selected, payload)
                }
                onRetrySend={(message) => {
                  const rp = message.retryPayload;
                  if (!rp) return;
                  void sendMessage(
                    activeThread ?? selected,
                    {
                      text: rp.text,
                      file: rp.file ?? null,
                      previewUrl: rp.previewUrl,
                    },
                    { clientId: message.id },
                  );
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-muted">
                Select a conversation
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function DmPaneSkeleton() {
  return (
    <div
      className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-bg-elevated sm:min-h-[24rem] lg:grid-cols-[20rem_minmax(0,1fr)]"
      aria-busy
    >
      <div className="space-y-1 p-2 lg:border-r lg:border-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-1/2 animate-pulse rounded bg-bg-muted" />
              <div className="h-2.5 w-4/5 animate-pulse rounded bg-bg-muted/70" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden flex-col justify-end gap-3 p-5 lg:flex">
        <div className="h-9 w-2/5 animate-pulse rounded-2xl bg-bg-muted" />
        <div className="h-9 w-1/3 animate-pulse self-end rounded-2xl bg-bg-muted" />
        <div className="h-14 w-1/2 animate-pulse rounded-2xl bg-bg-muted" />
      </div>
    </div>
  );
}

function DmListRow({
  thread,
  active,
  showAccount,
  onOpen,
}: {
  thread: InboxDmThread;
  active: boolean;
  showAccount: boolean;
  onOpen: () => void;
}) {
  const when = dmListTimeLabel(thread.lastMessageAt);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150",
          active ? "bg-accent/10" : "hover:bg-bg-subtle",
        )}
      >
        <InboxAvatar
          profileImageUrl={thread.peerAvatarUrl}
          username={thread.peerHandle ?? thread.peerName}
          platform={thread.platform}
          size={40}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[13.5px] font-semibold text-text">
              {thread.peerName}
            </span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-text-muted">
              {when}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-text-muted">
            {thread.snippet || "(No text)"}
          </span>
          {showAccount && thread.accountLabel ? (
            <span className="mt-0.5 block truncate text-[11px] text-text-muted/80">
              {PLATFORM_LABEL[thread.platform] ?? thread.platform} · @
              {thread.accountLabel.replace(/^@/, "")}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** Px from the bottom that still counts as "reading the latest message". */
const PINNED_THRESHOLD_PX = 80;

function DmConversationPane({
  thread,
  messages,
  loading,
  firstLoadError,
  olderPageError,
  hasOlder,
  loadingOlder,
  retrying,
  allowReply,
  onLoadOlder,
  onRetry,
  onBack,
  onSend,
  onRetrySend,
}: {
  thread: InboxDmThread;
  messages: LocalInboxDmMessage[];
  loading: boolean;
  firstLoadError: Error | null;
  olderPageError: Error | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  retrying: boolean;
  allowReply: boolean;
  onLoadOlder: () => void;
  onRetry: () => void;
  onBack: () => void;
  onSend: (payload: InboxComposerPayload) => void;
  onRetrySend: (message: LocalInboxDmMessage) => void;
}) {
  const reduceMotion = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  /** Scroll geometry captured right before older messages are prepended. */
  const restoreFrom = useRef<{ height: number; top: number } | null>(null);
  const lastSeenId = useRef<string | null>(null);
  const sending = messages.some((m) => m.sendStatus === "sending");
  const layout = useMemo(() => layoutDmMessages(messages), [messages]);
  const firstId = messages[0]?.id ?? null;
  const lastId = messages[messages.length - 1]?.id ?? null;

  const onScrollerScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    pinnedToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_THRESHOLD_PX;
  }, []);

  const loadOlder = useCallback(() => {
    const el = scroller.current;
    if (el) restoreFrom.current = { height: el.scrollHeight, top: el.scrollTop };
    onLoadOlder();
  }, [onLoadOlder]);

  // Keep the reader's place: older pages prepend without moving the view,
  // new messages follow the bottom only when the reader is already there.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const restore = restoreFrom.current;
    if (restore && el.scrollHeight !== restore.height) {
      el.scrollTop = restore.top + (el.scrollHeight - restore.height);
      restoreFrom.current = null;
      return;
    }
    if (!pinnedToBottom.current) return;
    const appended = lastSeenId.current != null && lastId !== lastSeenId.current;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: appended && !reduceMotion ? "smooth" : "auto",
    });
    lastSeenId.current = lastId;
  }, [firstId, lastId, messages.length, reduceMotion]);

  // Images and video posters load after layout; stay glued to the bottom.
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinnedToBottom.current && !restoreFrom.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const peerHandle = dmPeerHandleLabel(thread.peerName, thread.peerHandle);
  const rateLimited = isDmThreadRateLimited(firstLoadError);

  return (
    <>
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border/80 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-subtle hover:text-text active:scale-[0.97] lg:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft size={16} />
        </button>
        <InboxAvatar
          profileImageUrl={thread.peerAvatarUrl}
          username={thread.peerHandle ?? thread.peerName}
          platform={thread.platform}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <p className="truncate text-sm font-semibold text-text">
              {thread.peerName}
            </p>
            {peerHandle ? (
              <p className="truncate text-[12px] text-text-muted">@{peerHandle}</p>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-text-muted">
            {PLATFORM_LABEL[thread.platform] ?? thread.platform}
            {thread.accountLabel
              ? ` · via @${thread.accountLabel.replace(/^@/, "")}`
              : ""}
          </p>
        </div>
      </header>

      <div
        ref={scroller}
        onScroll={onScrollerScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg-subtle/40 px-3 sm:px-5"
      >
        <div ref={content} className="flex min-h-full flex-col py-4">
          {firstLoadError ? (
            <div className="m-auto flex max-w-xs flex-col items-center px-4 text-center">
              {rateLimited ? (
                <Clock size={28} className="text-text-muted" />
              ) : (
                <WarningCircle size={28} className="text-red-500" />
              )}
              <p className="mt-3 text-sm font-medium text-text">
                {rateLimited ? "Taking a short break" : "Couldn't load this conversation"}
              </p>
              <p className="mt-1 text-[13px] text-text-muted">{firstLoadError.message}</p>
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-4 py-1.5 text-[13px] font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-60"
              >
                {retrying ? <CircleNotch size={12} className="animate-spin" /> : null}
                Try again
              </button>
            </div>
          ) : loading && messages.length === 0 ? (
            <DmThreadSkeleton />
          ) : messages.length === 0 ? (
            <p className="m-auto text-sm text-text-muted">No messages in this conversation yet.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-col items-center gap-1">
                {hasOlder ? (
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-3 py-1 text-[12px] font-medium text-text-muted shadow-sm transition-colors hover:text-text disabled:opacity-60"
                  >
                    {loadingOlder ? <CircleNotch size={12} className="animate-spin" /> : null}
                    {loadingOlder ? "Loading…" : "Load earlier messages"}
                  </button>
                ) : (
                  <p className="text-[11px] text-text-muted">
                    Start of the conversation history available from{" "}
                    {PLATFORM_LABEL[thread.platform] ?? thread.platform}
                  </p>
                )}
                {olderPageError ? (
                  <p className="text-[11px] text-red-600 dark:text-red-300">
                    {olderPageError.message}
                  </p>
                ) : null}
              </div>
              <div className="mt-auto space-y-1">
                {layout.map((item) =>
                  item.kind === "day" ? (
                    <div
                      key={item.key}
                      className="flex justify-center py-2"
                      role="separator"
                    >
                      <span className="rounded-full bg-bg-elevated px-2.5 py-0.5 text-[11px] font-medium text-text-muted shadow-sm ring-1 ring-border/60">
                        {item.label}
                      </span>
                    </div>
                  ) : (
                    <DmBubbleGroup
                      key={item.key}
                      own={item.own}
                      messages={item.messages}
                      thread={thread}
                      onRetrySend={onRetrySend}
                    />
                  ),
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {thread.canReply && allowReply ? (
        <InboxComposer
          key={`${thread.accountId}:${thread.conversationId}`}
          platform={thread.platform}
          mode="dm"
          mediaKinds={thread.mediaKinds}
          maxLength={dmReplyMax(thread.platform)}
          placeholder={`Message ${thread.peerName}…`}
          disabled={false}
          sending={sending}
          onSend={onSend}
        />
      ) : (
        <p className="shrink-0 border-t border-border px-4 py-3 text-sm text-text-muted">
          {allowReply
            ? "Replies aren't available for this conversation."
            : "Your role can view this conversation but not reply."}
        </p>
      )}
    </>
  );
}

function DmThreadSkeleton() {
  return (
    <div className="mt-auto space-y-2" aria-busy>
      <div className="h-9 w-2/5 animate-pulse rounded-2xl bg-bg-muted" />
      <div className="ml-auto h-9 w-1/3 animate-pulse rounded-2xl bg-bg-muted" />
      <div className="h-14 w-1/2 animate-pulse rounded-2xl bg-bg-muted" />
      <div className="ml-auto h-9 w-2/5 animate-pulse rounded-2xl bg-bg-muted" />
    </div>
  );
}

function bubbleShape(own: boolean, index: number, count: number): string {
  // Consecutive bubbles from one sender read as a stack: the corners facing
  // the sender's side tighten between them, like most messaging apps.
  const first = index === 0;
  const last = index === count - 1;
  if (own) {
    return cn(
      "rounded-[18px]",
      !first && "rounded-tr-[6px]",
      !last && "rounded-br-[6px]",
    );
  }
  return cn(
    "rounded-[18px]",
    !first && "rounded-tl-[6px]",
    !last && "rounded-bl-[6px]",
  );
}

function DmBubbleGroup({
  own,
  messages,
  thread,
  onRetrySend,
}: {
  own: boolean;
  messages: LocalInboxDmMessage[];
  thread: InboxDmThread;
  onRetrySend: (message: LocalInboxDmMessage) => void;
}) {
  const last = messages[messages.length - 1]!;
  const lastPeer = own ? null : last;
  const footer =
    last.sendStatus === "sending"
      ? "Sending…"
      : last.sendStatus === "failed"
        ? null
        : dmMessageTimeLabel(last.createdAt);

  return (
    <div className={cn("flex items-end gap-2 pt-1.5", own ? "justify-end" : "justify-start")}>
      {lastPeer ? (
        <InboxAvatar
          profileImageUrl={lastPeer.authorAvatarUrl ?? thread.peerAvatarUrl}
          username={lastPeer.authorHandle ?? thread.peerHandle ?? thread.peerName}
          platform={thread.platform}
          size={28}
          className="mb-5"
        />
      ) : null}
      <div
        className={cn(
          "flex min-w-0 max-w-[min(82%,32rem)] flex-col gap-0.5",
          own ? "items-end" : "items-start",
        )}
      >
        {messages.map((m, i) => (
          <DmBubble
            key={m.id || `${m.createdAt}-${i}`}
            message={m}
            own={own}
            shape={bubbleShape(own, i, messages.length)}
            onRetry={() => onRetrySend(m)}
          />
        ))}
        {footer ? (
          <span className="px-1.5 pt-0.5 text-[10.5px] tabular-nums text-text-muted">
            {footer}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DmBubble({
  message,
  own,
  shape,
  onRetry,
}: {
  message: LocalInboxDmMessage;
  own: boolean;
  shape: string;
  onRetry: () => void;
}) {
  const failed = message.sendStatus === "failed";
  const sending = message.sendStatus === "sending";
  const attachment =
    message.attachment ??
    (message.localPreviewUrl
      ? {
          type: (message.retryPayload?.file?.type.startsWith("video/")
            ? "video"
            : "image") as "image" | "video",
          url: message.localPreviewUrl,
        }
      : null);
  const body = resolveInboxBody(message.text, attachment);
  const mediaOnly = Boolean(body.attachment) && !body.text;

  return (
    <>
      <div
        title={message.createdAt ? new Date(message.createdAt).toLocaleString() : undefined}
        className={cn(
          "max-w-full overflow-hidden",
          shape,
          mediaOnly
            ? "bg-transparent"
            : own
              ? "bg-accent px-3.5 py-2 text-accent-foreground"
              : "bg-bg-elevated px-3.5 py-2 text-text shadow-sm ring-1 ring-border/60",
          failed && "ring-2 ring-red-500/50",
          sending && "opacity-70",
        )}
      >
        {body.text ? (
          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.45]">
            {body.text}
          </p>
        ) : null}
        {body.attachment ? (
          <InboxAttachmentView
            attachment={body.attachment}
            className={cn(mediaOnly ? "mt-0 rounded-[inherit]" : "mt-1.5")}
          />
        ) : null}
      </div>
      {failed ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-1 px-1 text-[11px] font-medium text-red-500 transition-[transform,color] duration-150 ease-out hover:text-red-400 active:scale-[0.97]",
            own && "self-end",
          )}
        >
          <WarningCircle size={13} weight="fill" />
          Not sent · Tap to retry
        </button>
      ) : null}
    </>
  );
}
