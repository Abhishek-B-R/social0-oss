import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "@/components/AppLink";
import {
  ArrowLeft,
  EnvelopeSimple,
  WarningCircle,
} from "@/icons/phosphor";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import {
  getInboxDmThread,
  listInboxDms,
  replyToInboxDm,
  type InboxDmListResult,
  type InboxDmThread,
  type InboxDmThreadResult,
  type LocalInboxDmMessage,
} from "@/api/inbox";
import { PLATFORM_LABEL } from "@/features/dashboard/analytics/analytics-utils";
import {
  WINDOW_EMPTY_LABEL,
  windowQueryParams,
  type DateWindow,
} from "@/lib/date-window";
import { uploadFile } from "@/lib/upload-file";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InboxAttachmentView } from "./InboxAttachmentView";
import { InboxAvatar } from "./InboxAvatar";
import {
  InboxComposer,
  type InboxComposerPayload,
} from "./InboxComposer";

function dmKey(t: InboxDmThread): string {
  return `${t.accountId}:${t.conversationId}`;
}

function dmReplyMax(platform: string): number {
  if (platform === "twitter_x") return 10000;
  if (platform === "bluesky") return 1000;
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

function mergeMessages(
  server: LocalInboxDmMessage[],
  pending: LocalInboxDmMessage[],
): LocalInboxDmMessage[] {
  const serverIds = new Set(server.map((m) => m.id));
  const extra = pending.filter(
    (m) =>
      m.sendStatus &&
      !serverIds.has(m.id) &&
      !server.some(
        (s) =>
          s.isOwn &&
          s.text === m.text &&
          Math.abs(
            new Date(s.createdAt ?? 0).getTime() -
              new Date(m.createdAt ?? 0).getTime(),
          ) < 60_000,
      ),
  );
  return [...server, ...extra].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
}

export function InboxDmsPane({
  dateWindow,
  accountId,
  enabled,
}: {
  dateWindow: DateWindow;
  accountId: string | null;
  enabled: boolean;
}) {
  const dash = useDashboardPath();
  const qc = useQueryClient();
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

  const listKey = ["inbox-dms", dateWindow, accountId] as const;
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () =>
      listInboxDms({
        ...windowQueryParams(dateWindow),
        accountId: accountId || undefined,
      }),
    enabled,
    staleTime: 30_000,
  });

  const threads = listQuery.data?.threads ?? [];
  const selected =
    threads.find((t) => dmKey(t) === pickedId) ?? threads[0] ?? null;

  useEffect(() => {
    if (!threads.length) {
      setPickedId(null);
      return;
    }
    const keys = threads.map(dmKey);
    if (!pickedId || !keys.includes(pickedId)) {
      setPickedId(keys[0] ?? null);
    }
  }, [threads, pickedId]);

  const threadQueryKey = selected
    ? (["inbox-dm-thread", selected.accountId, selected.conversationId] as const)
    : (["inbox-dm-thread", "none"] as const);

  const threadQuery = useQuery({
    queryKey: threadQueryKey,
    queryFn: () =>
      getInboxDmThread({
        accountId: selected!.accountId,
        conversationId: selected!.conversationId,
        peerId: selected!.peerId,
      }),
    enabled: enabled && Boolean(selected),
    staleTime: 15_000,
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

      qc.setQueryData<InboxDmListResult>(listKey, (old) => {
        if (!old) return old;
        const snippet =
          payload.text ||
          (payload.file?.type.startsWith("video/") ? "[video]" : "[image]");
        return {
          ...old,
          threads: old.threads.map((t) =>
            dmKey(t) === key
              ? { ...t, snippet, lastMessageAt: createdAt }
              : t,
          ),
        };
      });

      try {
        let mediaId: string | undefined;
        if (payload.file) {
          const uploaded = await uploadFile(payload.file, 0);
          mediaId = uploaded.id;
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
        updatePending(key, (prev) => prev.filter((m) => m.id !== clientId));
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
          if (old.messages.some((m) => m.id === confirmed.id)) return old;
          return { ...old, messages: [...old.messages, confirmed] };
        });
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          void qc.invalidateQueries({ queryKey: threadQueryKey });
        }, 2500);
      } catch (e) {
        updatePending(key, (prev) =>
          prev.map((m) =>
            m.id === clientId ? { ...m, sendStatus: "failed" as const } : m,
          ),
        );
        toast.error(e instanceof Error ? e.message : "Send failed");
      }
    },
    [listKey, qc, threadQueryKey, updatePending],
  );

  const loading = listQuery.isLoading || listQuery.isFetching;
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
  const activeThread = threadQuery.data?.thread ?? selected;

  return (
    <>
      {listQuery.data?.accountsNeedingReconnect?.length ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <span className="font-medium">Reconnect for DMs: </span>
          {listQuery.data.accountsNeedingReconnect
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

      {listQuery.isError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
          {listQuery.error instanceof Error
            ? listQuery.error.message
            : "Failed to load DMs"}
        </div>
      ) : null}

      {loading && !listQuery.data ? (
        <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="h-full min-h-[20rem] animate-pulse bg-bg-muted/60" />
          <div className="hidden h-full animate-pulse bg-bg-muted/40 lg:block" />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated px-6 text-center">
          <EnvelopeSimple size={28} className="text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">No messages yet</p>
          <p className="mt-1 max-w-md text-sm text-text-muted">
            DMs from Instagram, Facebook Pages, X, and Bluesky in{" "}
            {emptyRangeLabel} show up here. Threads, TikTok, YouTube, Pinterest,
            and LinkedIn don&apos;t expose a messaging API we can use.
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[minmax(0,18.5rem)_minmax(0,1fr)]">
          <ul
            className={cn(
              "max-h-[min(70vh,40rem)] overflow-y-auto border-border lg:max-h-none lg:border-r",
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
                loading={threadQuery.isLoading}
                error={
                  threadQuery.isError
                    ? threadQuery.error instanceof Error
                      ? threadQuery.error.message
                      : "Failed to load conversation"
                    : null
                }
                onBack={() => setMobileDetail(false)}
                onSend={(payload) => void sendMessage(selected, payload)}
                onRetry={(message) => {
                  const rp = message.retryPayload;
                  if (!rp) return;
                  void sendMessage(
                    selected,
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
  onBack,
  onSend,
  onRetry,
}: {
  thread: InboxDmThread;
  messages: LocalInboxDmMessage[];
  loading: boolean;
  error: string | null;
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

      {thread.canReply ? (
        <InboxComposer
          key={thread.conversationId}
          platform={thread.platform}
          mode="dm"
          maxLength={dmReplyMax(thread.platform)}
          placeholder={`Message ${thread.peerName}…`}
          disabled={false}
          sending={sending}
          onSend={onSend}
        />
      ) : (
        <p className="border-t border-border px-4 py-3 text-sm text-text-muted">
          Replies aren&apos;t available for this conversation.
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
          </p>
          {message.text ? (
            <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed">
              {message.text}
            </p>
          ) : null}
          {attachment ? <InboxAttachmentView attachment={attachment} /> : null}
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
