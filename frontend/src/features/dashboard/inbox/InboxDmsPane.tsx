import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "@/components/AppLink";
import {
  ArrowLeft,
  EnvelopeSimple,
  PaperPlaneTilt,
} from "@/icons/phosphor";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import {
  getInboxDmThread,
  listInboxDms,
  replyToInboxDm,
  type InboxDmListResult,
  type InboxDmMessage,
  type InboxDmThread,
  type InboxDmThreadResult,
} from "@/api/inbox";
import { PLATFORM_LABEL } from "@/features/dashboard/analytics/analytics-utils";
import {
  WINDOW_EMPTY_LABEL,
  windowQueryParams,
  type DateWindow,
} from "@/lib/date-window";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function dmKey(t: InboxDmThread): string {
  return `${t.accountId}:${t.conversationId}`;
}

function dmReplyMax(platform: string): number {
  if (platform === "twitter_x") return 10000;
  if (platform === "bluesky") return 1000;
  return 2000;
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
  const [sentTick, setSentTick] = useState(0);
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

  const threadQuery = useQuery({
    queryKey: selected
      ? ["inbox-dm-thread", selected.accountId, selected.conversationId]
      : ["inbox-dm-thread", "none"],
    queryFn: () =>
      getInboxDmThread({
        accountId: selected!.accountId,
        conversationId: selected!.conversationId,
        peerId: selected!.peerId,
      }),
    enabled: enabled && Boolean(selected),
    staleTime: 15_000,
  });

  const replyMut = useMutation({
    mutationFn: replyToInboxDm,
    onSuccess: (res, vars) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Message sent");
      setSentTick((n) => n + 1);
      const optimistic: InboxDmMessage = {
        id: res.messageId ?? `optimistic-${Date.now()}`,
        text: vars.text,
        createdAt: new Date().toISOString(),
        isOwn: true,
        authorName: "You",
        authorHandle: null,
      };
      qc.setQueryData<InboxDmThreadResult>(
        ["inbox-dm-thread", vars.accountId, vars.conversationId],
        (old) => {
          if (!old) return old;
          if (old.messages.some((m) => m.id === optimistic.id)) return old;
          return { ...old, messages: [...old.messages, optimistic] };
        },
      );
      qc.setQueryData<InboxDmListResult>(listKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          threads: old.threads.map((t) =>
            t.accountId === vars.accountId &&
            t.conversationId === vars.conversationId
              ? {
                  ...t,
                  snippet: vars.text,
                  lastMessageAt: optimistic.createdAt,
                }
              : t,
          ),
        };
      });
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["inbox-dm-thread"] });
      }, 2500);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Send failed");
    },
  });

  const loading = listQuery.isLoading || listQuery.isFetching;
  const emptyRangeLabel =
    dateWindow.range === "custom"
      ? "this range"
      : WINDOW_EMPTY_LABEL[dateWindow.range];
  const showList = !mobileDetail;
  const showDetail = mobileDetail || Boolean(selected);

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
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-muted">
                      <PlatformIcon platform={t.platform} size={13} />
                    </span>
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
                        {t.accountLabel ? ` · @${t.accountLabel.replace(/^@/, "")}` : ""}
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
            {selected ? (
              <DmConversationPane
                listThread={selected}
                messages={threadQuery.data?.messages ?? []}
                loading={threadQuery.isLoading}
                error={
                  threadQuery.isError
                    ? threadQuery.error instanceof Error
                      ? threadQuery.error.message
                      : "Failed to load conversation"
                    : null
                }
                sending={replyMut.isPending}
                sentTick={sentTick}
                onBack={() => setMobileDetail(false)}
                onSend={(text) =>
                  replyMut.mutate({
                    accountId: selected.accountId,
                    conversationId: selected.conversationId,
                    peerId: selected.peerId,
                    text,
                  })
                }
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
  listThread,
  messages,
  loading,
  error,
  sending,
  sentTick,
  onBack,
  onSend,
}: {
  listThread: InboxDmThread;
  messages: InboxDmMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  sentTick: number;
  onBack: () => void;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const max = dmReplyMax(listThread.platform);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft("");
  }, [listThread.conversationId, sentTick]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length, listThread.conversationId]);

  const peerLabel = listThread.peerHandle
    ? `${listThread.peerName} (@${listThread.peerHandle.replace(/^@/, "")})`
    : listThread.peerName;

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
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-text">
            {peerLabel}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {PLATFORM_LABEL[listThread.platform] ?? listThread.platform}
            {listThread.accountLabel
              ? ` · via @${listThread.accountLabel.replace(/^@/, "")}`
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
          messages.map((m) => <DmBubble key={m.id} message={m} platform={listThread.platform} />)
        )}
      </div>

      {listThread.canReply ? (
        <form
          className="border-t border-border bg-bg-elevated p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text || sending) return;
            onSend(text);
          }}
        >
          <label className="sr-only" htmlFor="inbox-dm-reply">
            Message
          </label>
          <div className="flex gap-2">
            <textarea
              id="inbox-dm-reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={max}
              placeholder={`Message ${listThread.peerName}…`}
              className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              aria-label="Send message"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              <PaperPlaneTilt size={16} weight="fill" />
            </button>
          </div>
          <p className="mt-1.5 text-right text-[10px] tabular-nums text-text-muted">
            {draft.length}/{max}
          </p>
        </form>
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
  platform,
}: {
  message: InboxDmMessage;
  platform: string;
}) {
  const when = message.createdAt
    ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })
    : null;
  const own = message.isOwn;
  return (
    <div className={cn("flex gap-2.5", own && "flex-row-reverse")}>
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          own ? "bg-accent/20 text-accent" : "bg-bg-muted",
        )}
      >
        <PlatformIcon platform={platform} size={12} />
      </span>
      <div
        className={cn(
          "max-w-[min(100%,28rem)] rounded-2xl px-3 py-2",
          own
            ? "rounded-tr-md bg-accent/15 text-text"
            : "rounded-tl-md bg-bg-muted text-text",
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
        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed">
          {message.text}
        </p>
      </div>
    </div>
  );
}
