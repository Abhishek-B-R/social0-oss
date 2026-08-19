import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  CircleNotch,
  EnvelopeSimple,
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
import { InboxScrollSentinel } from "./InboxScrollSentinel";
import { resolveInboxBody } from "@/lib/inbox-display";
import { inboxDmFingerprint, markInboxDmsSeen } from "@/lib/inbox-unread";
import { useSession } from "@/lib/auth-client";
import { listWorkspaces } from "@/api/team";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import {
  initialInboxPageParam,
  nextInboxPageParam,
  type InboxPageParam,
} from "@/lib/inbox-infinite";

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
  const [pendingByConvo, setPendingByConvo] = useState<
    Record<string, LocalInboxDmMessage[]>
  >({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const listKey = ["inbox-dms", workspaceId, dateWindow, accountId] as const;
  const listQuery = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) =>
      listInboxDms({
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
    staleTime: 30_000,
    refetchInterval: enabled ? 45_000 : false,
    refetchIntervalInBackground: false,
    maxPages: 24,
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
  const selected =
    threads.find((t) => dmKey(t) === pickedId) ?? threads[0] ?? null;
  const openedDmKey = selected
    ? inboxDmFingerprint(selected.accountId, selected.conversationId)
    : null;

  useEffect(() => {
    if (!enabled || !openedDmKey) return;
    markInboxDmsSeen(userId, [openedDmKey]);
  }, [enabled, openedDmKey, userId]);

  useEffect(() => {
    if (!threads.length) {
      setPickedId(null);
      return;
    }
    const keys = threads.map(dmKey);
    if (pickedId && keys.includes(pickedId)) return;

    const convo = searchParams.get("convo");
    const accountFromUrl = searchParams.get("account") || accountId;
    const fromUrl = convo
      ? threads.find(
          (t) =>
            t.conversationId === convo &&
            (!accountFromUrl || t.accountId === accountFromUrl),
        )
      : null;
    if (fromUrl) {
      setPickedId(dmKey(fromUrl));
      return;
    }
    setPickedId(keys[0] ?? null);
  }, [threads, pickedId, searchParams, accountId]);

  const threadQueryKey = selected
    ? (["inbox-dm-thread", workspaceId, selected.accountId, selected.conversationId] as const)
    : (["inbox-dm-thread", workspaceId, "none"] as const);

  const threadQuery = useQuery({
    queryKey: threadQueryKey,
    queryFn: async () => {
      const result = await getInboxDmThread({
        accountId: selected!.accountId,
        conversationId: selected!.conversationId,
        peerId: selected!.peerId,
      });
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    enabled: enabled && Boolean(selected),
    staleTime: 20_000,
    refetchInterval: enabled && selected ? 45_000 : false,
    refetchIntervalInBackground: false,
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
        if (
          !(
            dmSplitsImageCaption(thread.platform) &&
            payload.file &&
            payload.text.trim()
          )
        ) {
          qc.setQueryData<InboxDmThreadResult>(threadQueryKey, (old) => {
            if (!old) return old;
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
            if (old.messages.some((m) => sameLocalDm(m, confirmed))) return old;
            return { ...old, messages: [...old.messages, confirmed] };
          });
        }
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          void qc.invalidateQueries({ queryKey: threadQueryKey });
          void qc.invalidateQueries({ queryKey: ["inbox-dms"] });
        }, 8000);
      } catch (e) {
        updatePending(key, (prev) =>
          prev.map((m) =>
            m.id === clientId ? { ...m, sendStatus: "failed" as const } : m,
          ),
        );
        toast.error(e instanceof Error ? e.message : "Send failed");
      }
    },
    [listKey, pendingByConvo, qc, threadQueryKey, updatePending],
  );

  const loading = listQuery.isPending;
  const emptyRangeLabel =
    dateWindow.range === "custom"
      ? "this range"
      : WINDOW_EMPTY_LABEL[dateWindow.range];
  const showList = !mobileDetail;
  const showDetail = mobileDetail || Boolean(selected);
  const convoKey = selected ? dmKey(selected) : "";
  const pending = convoKey ? pendingByConvo[convoKey] ?? [] : [];
  const messages = mergeMessages(
    (threadQuery.data?.messages ?? []) as LocalInboxDmMessage[],
    pending,
  );

  useEffect(() => {
    const server = threadQuery.data?.messages;
    if (!server?.length || !selected) return;
    const key = dmKey(selected);
    setPendingByConvo((prev) => {
      const list = prev[key];
      if (!list?.length) return prev;
      const used = new Set<number>();
      const next = list.filter((m) => {
        if (m.sendStatus === "failed" || m.sendStatus === "sending") return true;
        const byId = server.findIndex(
          (s, i) =>
            !used.has(i) &&
            s.id &&
            m.id &&
            s.id === m.id,
        );
        if (byId >= 0) {
          used.add(byId);
          return false;
        }
        const byHeuristic = server.findIndex(
          (s, i) => !used.has(i) && sameLocalDm(s as LocalInboxDmMessage, m),
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
  }, [threadQuery.data?.messages, selected]);
  const activeThread = threadQuery.data?.thread ?? selected;

  return (
    <>
      {listQuery.isError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
          {listQuery.error instanceof Error
            ? listQuery.error.message
            : "Failed to load DMs"}
        </div>
      ) : null}

      {loading && !listQuery.data ? (
        <div className="grid min-h-[24rem] flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[17.5rem_minmax(0,1fr)]">
          <div className="h-full min-h-[20rem] animate-pulse bg-bg-muted/60" />
          <div className="hidden h-full animate-pulse bg-bg-muted/40 lg:block" />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated px-6 text-center">
          <EnvelopeSimple size={28} className="text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">No messages yet</p>
          <p className="mt-1 max-w-md text-sm text-text-muted">
            Direct messages from connected accounts in {emptyRangeLabel} show
            up here.
          </p>
        </div>
      ) : (
        <div className="grid min-h-[24rem] flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[17.5rem_minmax(0,1fr)]">
          <ul
            className={cn(
              "max-h-[min(70vh,40rem)] min-h-0 overflow-y-auto border-border lg:max-h-none lg:border-r",
              showList ? "block" : "hidden lg:block",
            )}
          >
            {threads.map((t) => {
              const key = dmKey(t);
              const active = selected ? dmKey(selected) === key : false;
              const when = t.lastMessageAt
                ? formatDistanceToNow(new Date(t.lastMessageAt), {
                    addSuffix: false,
                  })
                : "";
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
                          next.set("convo", t.conversationId);
                          return next;
                        },
                        { replace: true },
                      );
                    }}
                    className={cn(
                      "relative flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors",
                      active
                        ? "bg-accent/10 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent"
                        : "hover:bg-bg-subtle/80",
                    )}
                  >
                    <InboxAvatar
                      profileImageUrl={t.peerAvatarUrl}
                      username={t.peerHandle ?? t.peerName}
                      platform={t.platform}
                      size={32}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-text">
                          {t.peerName}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-text-muted">
                          {when}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-text-muted">
                        {t.snippet || "(No text)"}
                      </span>
                      <span className="mt-1 text-[10px] text-text-muted">
                        {PLATFORM_LABEL[t.platform] ?? t.platform}
                        {t.accountLabel
                          ? ` · @${t.accountLabel.replace(/^@/, "")}`
                          : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            <InboxScrollSentinel
              onVisible={loadOlderDms}
              disabled={!hasNextDms || fetchingNextDms}
              loading={fetchingNextDms}
            />
          </ul>

          <section
            className={cn(
              "min-h-0 min-w-0 flex-col",
              showDetail ? "flex" : "hidden lg:flex",
            )}
          >
            {selected && activeThread ? (
              <DmConversationPane
                thread={activeThread}
                messages={messages}
                allowReply={allowReply}
                loading={threadQuery.isLoading}
                error={
                  threadQuery.isError
                    ? threadQuery.error instanceof Error
                      ? threadQuery.error.message
                      : "Failed to load conversation"
                    : null
                }
                onBack={() => setMobileDetail(false)}
                onSend={(payload) =>
                  void sendMessage(activeThread ?? selected, payload)
                }
                onRetry={(message) => {
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

function DmConversationPane({
  thread,
  messages,
  loading,
  error,
  allowReply,
  onBack,
  onSend,
  onRetry,
}: {
  thread: InboxDmThread;
  messages: LocalInboxDmMessage[];
  loading: boolean;
  error: string | null;
  allowReply: boolean;
  onBack: () => void;
  onSend: (payload: InboxComposerPayload) => void;
  onRetry: (message: LocalInboxDmMessage) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const sending = messages.some((m) => m.sendStatus === "sending");

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length, thread.conversationId]);

  const peerLabel = thread.peerHandle
    ? `${thread.peerName} (@${thread.peerHandle.replace(/^@/, "")})`
    : thread.peerName;

  return (
    <>
      <div className="flex items-start gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text lg:hidden"
          aria-label="Back to list"
        >
          <ArrowLeft size={16} />
        </button>
        <InboxAvatar
          profileImageUrl={thread.peerAvatarUrl}
          username={thread.peerHandle ?? thread.peerName}
          platform={thread.platform}
          size={36}
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-text">
            {peerLabel}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {PLATFORM_LABEL[thread.platform] ?? thread.platform}
            {thread.accountLabel
              ? ` · via @${thread.accountLabel.replace(/^@/, "")}`
              : ""}
          </p>
        </div>
      </div>

      <div
        ref={scroller}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4"
      >
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        ) : loading && messages.length === 0 ? (
          <div className="h-40 animate-pulse rounded-xl bg-bg-muted" />
        ) : messages.length === 0 ? (
          <p className="text-sm text-text-muted">No messages in this thread.</p>
        ) : (
          messages.map((m) => (
            <DmBubble
              key={m.id}
              message={m}
              thread={thread}
              onRetry={() => onRetry(m)}
            />
          ))
        )}
      </div>

      {thread.canReply && allowReply ? (
        <InboxComposer
          key={`${thread.accountId}:${thread.conversationId}`}
          platform={thread.platform}
          mode="dm"
          maxLength={dmReplyMax(thread.platform)}
          placeholder={`Message ${thread.peerName}...`}
          disabled={false}
          sending={sending}
          onSend={onSend}
        />
      ) : (
        <p className="border-t border-border px-4 py-3 text-sm text-text-muted">
          {allowReply
            ? "Replies aren't available for this conversation."
            : "Your role can view this conversation but not reply."}
        </p>
      )}
    </>
  );
}

function DmBubble({
  message,
  thread,
  onRetry,
}: {
  message: LocalInboxDmMessage;
  thread: InboxDmThread;
  onRetry: () => void;
}) {
  const when = message.createdAt
    ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })
    : null;
  const own = message.isOwn;
  const failed = message.sendStatus === "failed";
  const sending = message.sendStatus === "sending";
  const avatarUrl = own
    ? thread.accountProfileImageUrl
    : message.authorAvatarUrl ?? thread.peerAvatarUrl;
  const avatarName = own
    ? thread.accountLabel
    : message.authorHandle ?? message.authorName;
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

  return (
    <div className={cn("flex gap-2.5", own && "flex-row-reverse")}>
      <InboxAvatar
        profileImageUrl={avatarUrl}
        username={avatarName}
        platform={thread.platform}
        size={28}
        className="mt-0.5"
      />
      <div className="flex max-w-[min(100%,28rem)] flex-col gap-1">
        <div
          className={cn(
            "rounded-2xl px-3 py-2",
            own
              ? "rounded-tr-md bg-accent/15 text-text"
              : "rounded-tl-md bg-bg-muted text-text",
            failed && "ring-1 ring-red-500/40",
            sending && "opacity-80",
          )}
        >
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
            <span className="font-semibold">
              {own ? "You" : message.authorName}
            </span>
            {!own && message.authorHandle ? (
              <span className="text-text-muted">@{message.authorHandle}</span>
            ) : null}
          {when ? <span className="text-text-muted">· {when}</span> : null}
          {sending ? (
            <CircleNotch size={12} className="animate-spin text-text-muted" />
          ) : null}
        </p>
          {body.text ? (
            <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed">
              {body.text}
            </p>
          ) : null}
          {body.attachment ? <InboxAttachmentView attachment={body.attachment} /> : null}
        </div>
        {failed ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-400",
              own && "self-end",
            )}
          >
            <WarningCircle size={14} weight="fill" />
            Tap to retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
