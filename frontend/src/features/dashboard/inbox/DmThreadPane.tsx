import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { CircleNotch, Clock, WarningCircle } from "@/icons/phosphor";
import type { InboxDmThread, InboxDmThreadResult, LocalInboxDmMessage } from "@/api/inbox";
import { InlineError, SkeletonText } from "@/components/app";
import { resolveInboxBody } from "@/lib/inbox-display";
import { PAGE_LIVE_QUERY } from "@/lib/page-live-query";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { AiDraftCard } from "./AiDraftCard";
import { useInboxAiDraft } from "./ai-draft";
import { dmPeerHandleLabel, mergeDmThreadIdentity } from "./dm-identity";
import {
  flattenDmPages,
  InboxDmThreadLoadError,
  isDmThreadRateLimited,
  layoutDmMessages,
} from "./dm-thread-layout";
import { InboxAttachmentView } from "./InboxAttachmentView";
import { InboxAvatar } from "./InboxAvatar";
import { InboxComposer, type InboxComposerPayload } from "./InboxComposer";
import { ThreadHeader } from "./ThreadHeader";
import { atHandle, type DmItem } from "./inbox-items";
import { mergeDmMessages } from "./use-dm-sender";
import { dmThreadQueryKey, fetchDmThread } from "./use-inbox-feed";

function dmReplyMax(platform: string): number {
  if (platform === "twitter_x") return 10000;
  if (platform === "bluesky") return 1000;
  if (platform === "tiktok") return 6000;
  return 2000;
}

/** Hard stop on "Load earlier" so a sticky cursor can never page forever. */
const DM_THREAD_MAX_PAGES = 40;

/** A message's distance from the top of the scroll viewport. */
function dmOffset(scroller: HTMLElement, node: Element): number {
  return node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
}

/** "in about 40 seconds" / "in about 3 minutes" for a throttled read. */
function retryInLabel(error: unknown): string {
  const sec = error instanceof InboxDmThreadLoadError ? error.retryAfterSec : null;
  if (sec == null || sec <= 0) return "in a moment";
  if (sec < 60) return `in about ${sec} second${sec === 1 ? "" : "s"}`;
  const min = Math.ceil(sec / 60);
  return `in about ${min} minute${min === 1 ? "" : "s"}`;
}

/** Calm note for a throttled read: not an error, just "wait, then retry". */
function RateLimitedNote({
  network,
  error,
  onRetry,
  className,
}: {
  network: string;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted", className)}
    >
      <Clock size={14} className="shrink-0" aria-hidden />
      <span>
        {network} is pacing reads for this account. Try again {retryInLabel(error)}.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded font-medium text-text underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        Try again
      </button>
    </p>
  );
}

/**
 * Right pane for a DM conversation: messages oldest → newest, then the
 * reply bar naming the sending account.
 */
export function DmThreadPane({
  item,
  workspaceId,
  allowReply,
  pending,
  done,
  canToggleDone,
  replyInputRef,
  onToggleDone,
  onSend,
  onRetry,
  onLastMessageOwn,
  onBack,
}: {
  item: DmItem;
  workspaceId: string;
  allowReply: boolean;
  /** Local (sending / failed / just-sent) messages for this conversation. */
  pending: LocalInboxDmMessage[];
  done: boolean;
  canToggleDone: boolean;
  replyInputRef: RefObject<HTMLTextAreaElement | null>;
  onToggleDone: () => void;
  onSend: (thread: InboxDmThread, payload: InboxComposerPayload) => void;
  onRetry: (thread: InboxDmThread, message: LocalInboxDmMessage) => void;
  /**
   * The newest message is yours (its time): the conversation doesn't need a
   * reply. `fromServer` is false while that message is still the local copy
   * of one just sent from here (its time is this browser's clock).
   */
  onLastMessageOwn: (lastOwnAt: string | null, fromServer: boolean) => void;
  onBack: () => void;
}) {
  const listThread = item.dm;
  const threadQuery = useQuery({
    queryKey: dmThreadQueryKey(workspaceId, listThread),
    queryFn: () => fetchDmThread(listThread),
    ...PAGE_LIVE_QUERY,
    // A throttled read would only be throttled again - let the user retry.
    retry: (count, error) => !isDmThreadRateLimited(error) && count < 1,
  });

  // Older pages live here, not in the query: a refetch of the newest page
  // (Refresh, post-send re-read) must not re-read every page loaded so far.
  // The pane is keyed by conversation, so this resets on switch.
  const [olderPages, setOlderPages] = useState<InboxDmThreadResult[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<unknown>(null);
  const oldestPage = olderPages.at(-1) ?? threadQuery.data;
  const olderCursor =
    oldestPage?.hasMore && oldestPage.nextCursor && olderPages.length + 1 < DM_THREAD_MAX_PAGES
      ? oldestPage.nextCursor
      : null;

  const thread = threadQuery.data?.thread
    ? mergeDmThreadIdentity(threadQuery.data.thread, listThread)
    : listThread;
  const messages = useMemo(() => {
    const server = threadQuery.data ? [threadQuery.data, ...olderPages] : olderPages;
    return mergeDmMessages(flattenDmPages(server) as LocalInboxDmMessage[], pending);
  }, [olderPages, pending, threadQuery.data]);
  const layout = useMemo(() => layoutDmMessages(messages), [messages]);
  const sending = messages.some((m) => m.sendStatus === "sending");
  const draft = useInboxAiDraft(item.key);

  const serverMessages = threadQuery.data?.messages;
  // Newest by time; don't assume the API's order.
  const lastServer = serverMessages?.reduce<(typeof serverMessages)[number] | undefined>(
    (latest, m) =>
      !latest || (m.createdAt ?? "").localeCompare(latest.createdAt ?? "") >= 0 ? m : latest,
    undefined,
  );
  const lastOwnAt = lastServer?.isOwn ? (lastServer.createdAt ?? "") : null;
  const lastOwnFromServer = !(lastServer as LocalInboxDmMessage | undefined)?.sentHere;
  useEffect(() => {
    if (lastOwnAt != null) onLastMessageOwn(lastOwnAt || null, lastOwnFromServer);
  }, [lastOwnAt, lastOwnFromServer, onLastMessageOwn]);

  const reduceMotion = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  /**
   * The first visible-at-top message and its offset in the viewport, captured
   * right before older messages are prepended. Anchoring to a message (not
   * total height) keeps the view still while the controls above it change.
   */
  const restoreFromRef = useRef<{ id: string; offset: number } | null>(null);
  const onScrollerScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    pinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);
  // Older pages prepend without moving the view; new messages follow the
  // bottom only while the reader is already there.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const restore = restoreFromRef.current;
    if (restore) {
      restoreFromRef.current = null;
      const node = el.querySelector(`[data-dm-id="${CSS.escape(restore.id)}"]`);
      if (node) el.scrollTop += dmOffset(el, node) - restore.offset;
      return;
    }
    if (!pinnedToBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages.length, olderPages.length, reduceMotion, thread.conversationId]);

  const loadOlder = useCallback(async () => {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const page = await fetchDmThread(listThread, olderCursor);
      const el = scroller.current;
      const first = el?.querySelector<HTMLElement>("[data-dm-id]");
      if (el && first?.dataset.dmId) {
        restoreFromRef.current = { id: first.dataset.dmId, offset: dmOffset(el, first) };
      }
      // A cursor that comes back unchanged would page forever: stop there.
      setOlderPages((prev) => [
        ...prev,
        page.nextCursor === olderCursor ? { ...page, hasMore: false, nextCursor: null } : page,
      ]);
    } catch (error) {
      setOlderError(error);
    } finally {
      setLoadingOlder(false);
    }
  }, [listThread, loadingOlder, olderCursor]);

  const network = PLATFORM_LABEL[thread.platform] ?? thread.platform;
  const brand = atHandle(thread.accountLabel);
  const peerHandle = dmPeerHandleLabel(thread.peerName, thread.peerHandle);
  const destination = `Reply as ${brand ?? "your account"} on ${network}`;
  const canSend = thread.canReply && allowReply;

  return (
    <>
      <ThreadHeader
        avatar={
          <InboxAvatar
            profileImageUrl={thread.peerAvatarUrl}
            username={thread.peerHandle ?? thread.peerName}
            platform={thread.platform}
            size={32}
          />
        }
        title={
          <>
            {thread.peerName}
            {peerHandle ? (
              <span className="ml-1.5 font-normal text-text-muted">@{peerHandle}</span>
            ) : null}
          </>
        }
        subtitle={`DM · ${network}${brand ? ` · to ${brand}` : ""}`}
        done={done}
        replied={done && !canToggleDone}
        canToggleDone={canToggleDone}
        onToggleDone={onToggleDone}
        onBack={onBack}
      />

      <div
        ref={scroller}
        onScroll={onScrollerScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
      >
        {threadQuery.isError && !messages.length && isDmThreadRateLimited(threadQuery.error) ? (
          <RateLimitedNote
            network={network}
            error={threadQuery.error}
            onRetry={() => void threadQuery.refetch()}
          />
        ) : threadQuery.isError && !messages.length ? (
          <InlineError
            message={`Couldn't load this conversation. ${
              threadQuery.error instanceof Error ? threadQuery.error.message : ""
            }`.trim()}
            onRetry={() => void threadQuery.refetch()}
          />
        ) : threadQuery.isPending && messages.length === 0 ? (
          <div aria-busy className="space-y-3">
            <SkeletonText lines={2} />
            <SkeletonText lines={3} />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-text-muted">No messages in this conversation yet.</p>
        ) : (
          <>
            {threadQuery.isError && isDmThreadRateLimited(threadQuery.error) ? (
              <RateLimitedNote
                network={network}
                error={threadQuery.error}
                onRetry={() => void threadQuery.refetch()}
              />
            ) : threadQuery.isError ? (
              <InlineError
                message="Couldn't refresh this conversation."
                onRetry={() => void threadQuery.refetch()}
              />
            ) : null}
            {threadQuery.data ? (
              <div className="flex flex-col items-center gap-1.5">
                {olderCursor ? (
                  <button
                    type="button"
                    onClick={() => void loadOlder()}
                    disabled={loadingOlder}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs font-medium text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
                  >
                    {loadingOlder ? (
                      <CircleNotch
                        size={12}
                        className="animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : null}
                    {loadingOlder ? "Loading…" : "Load earlier messages"}
                  </button>
                ) : (
                  <p className="text-xs text-text-muted">
                    Start of the conversation history available from {network}
                  </p>
                )}
                {olderError && isDmThreadRateLimited(olderError) ? (
                  <RateLimitedNote
                    network={network}
                    error={olderError}
                    onRetry={() => void loadOlder()}
                    className="justify-center text-center"
                  />
                ) : olderError ? (
                  <InlineError
                    message="Couldn't load earlier messages."
                    onRetry={() => void loadOlder()}
                    className="justify-center text-xs"
                  />
                ) : null}
              </div>
            ) : null}
            {/* One flat keyed list: a prepended day must not remount every bubble. */}
            {layout.flatMap((entry) =>
              entry.kind === "day" ? (
                <div key={entry.key} role="separator" className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-border" aria-hidden />
                  <span className="text-[11px] font-medium text-text-muted">{entry.label}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden />
                </div>
              ) : (
                entry.messages.map((m) => (
                  <DmBubble
                    key={m.id}
                    message={m}
                    thread={thread}
                    onRetry={() => onRetry(thread, m)}
                  />
                ))
              ),
            )}
          </>
        )}
        <AiDraftCard
          draft={canSend ? draft : null}
          destination={destination}
          sending={sending}
          onApprove={(text) => onSend(thread, { text })}
          onDiscard={() => undefined}
        />
      </div>

      {canSend ? (
        <InboxComposer
          key={item.key}
          platform={thread.platform}
          mode="dm"
          inputRef={replyInputRef}
          mediaKinds={thread.mediaKinds}
          maxLength={dmReplyMax(thread.platform)}
          placeholder={`Message ${thread.peerName}…`}
          sending={sending}
          destination={
            <>
              Reply as <span className="font-medium text-text">{brand ?? "your account"}</span>{" "}
              on {network}
            </>
          }
          onSend={(payload) => onSend(thread, payload)}
        />
      ) : (
        <p className="shrink-0 border-t border-border px-4 py-3 text-sm text-text-muted">
          {allowReply
            ? `Replying to this conversation isn't available from Social0. Open ${network} to reply there.`
            : "Your role can read this conversation but not reply. Ask a workspace admin for Member or Community access."}
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
    : (message.authorAvatarUrl ?? thread.peerAvatarUrl);
  const avatarName = own ? thread.accountLabel : (message.authorHandle ?? message.authorName);
  const attachment =
    message.attachment ??
    (message.localPreviewUrl
      ? {
          type: (message.retryPayload?.file?.type.startsWith("video/") ? "video" : "image") as
            | "image"
            | "video",
          url: message.localPreviewUrl,
        }
      : null);
  const body = resolveInboxBody(message.text, attachment);
  const authorHandle = own ? null : dmPeerHandleLabel(message.authorName, message.authorHandle);

  return (
    <div data-dm-id={message.id} className={cn("flex gap-2.5", own && "flex-row-reverse")}>
      <InboxAvatar
        profileImageUrl={avatarUrl}
        username={avatarName}
        platform={thread.platform}
        size={28}
        className="mt-0.5"
      />
      <div className={cn("flex max-w-[min(100%,28rem)] flex-col gap-1", own && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-3 py-2",
            own ? "rounded-tr-md bg-accent/15 text-text" : "rounded-tl-md bg-bg-muted text-text",
            failed && "ring-1 ring-danger-border",
            sending && "opacity-80",
          )}
        >
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
            <span className="font-semibold">{own ? "You" : message.authorName}</span>
            {authorHandle ? <span className="text-text-muted">@{authorHandle}</span> : null}
            {when ? <span className="text-text-muted">· {when}</span> : null}
            {sending ? (
              <CircleNotch
                size={12}
                className="animate-spin text-text-muted motion-reduce:animate-none"
                aria-label="Sending"
              />
            ) : null}
          </p>
          {body.text ? (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
              {body.text}
            </p>
          ) : null}
          {body.attachment ? <InboxAttachmentView attachment={body.attachment} /> : null}
        </div>
        {failed ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            <WarningCircle size={14} weight="fill" />
            Not sent · Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
