import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format, formatDistanceToNow } from "date-fns";
import Link from "@/components/AppLink";
import { AccountAvatar } from "@/components/AccountAvatar";
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowSquareOut,
  ChatCircle,
  PaperPlaneTilt,
  SquaresFour,
} from "@/icons/phosphor";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useSession } from "@/lib/auth-client";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { listAnalyticsAccounts } from "@/api/analytics";
import {
  listInboxComments,
  replyToInboxComment,
  type InboxComment,
  type InboxListResult,
  type InboxRange,
  type InboxThread,
} from "@/api/inbox";
import { PLATFORM_LABEL } from "@/features/dashboard/analytics/analytics-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PLATFORM_FILTERS = [
  "instagram",
  "facebook",
  "threads",
  "twitter_x",
  "youtube",
  "bluesky",
  "linkedin",
] as const;

const RANGE_OPTIONS: Array<{ value: InboxRange; label: string }> = [
  { value: "1d", label: "1d" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

const RANGE_EMPTY_LABEL: Record<InboxRange, string> = {
  "1d": "the last day",
  "7d": "the last 7 days",
  "30d": "the last 30 days",
  "90d": "the last 90 days",
};

function threadKey(thread: InboxThread): string {
  return `${thread.comment.publicationId}-${thread.comment.id}`;
}

function replyMax(platform: string): number {
  if (platform === "twitter_x") return 280;
  if (platform === "bluesky") return 300;
  if (platform === "threads") return 500;
  return 2000;
}

function handleLabel(username: string | null | undefined): string {
  if (!username) return "account";
  return username.startsWith("@") ? username.slice(1) : username;
}

function appendOptimisticReply(
  data: InboxListResult,
  args: {
    publicationId: string;
    parentCommentId: string;
    text: string;
    replyId?: string;
    accountLabel: string | null;
  },
): InboxListResult {
  const reply: InboxComment = {
    id: args.replyId ?? `optimistic-${Date.now()}`,
    platform: "",
    accountId: "",
    accountLabel: args.accountLabel,
    postId: "",
    publicationId: args.publicationId,
    platformPostId: "",
    platformPostUrl: null,
    postSnippet: "",
    authorName: "You",
    authorHandle: args.accountLabel,
    text: args.text,
    createdAt: new Date().toISOString(),
    parentId: args.parentCommentId,
    canReply: false,
    isOwn: true,
  };

  const threads = data.threads.map((thread) => {
    const root = thread.comment;
    const inThread =
      root.publicationId === args.publicationId &&
      (root.id === args.parentCommentId ||
        thread.replies.some((r) => r.id === args.parentCommentId));
    if (!inThread) return thread;

    reply.platform = root.platform;
    reply.accountId = root.accountId;
    reply.postId = root.postId;
    reply.platformPostId = root.platformPostId;
    reply.platformPostUrl = root.platformPostUrl;
    reply.postSnippet = root.postSnippet;

    if (thread.replies.some((r) => r.id === reply.id)) return thread;
    return { ...thread, replies: [...thread.replies, reply] };
  });

  return { ...data, threads };
}

export function InboxPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const dash = useDashboardPath();
  const qc = useQueryClient();
  const [range, setRange] = useState<InboxRange>("7d");
  const [platform, setPlatform] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["analytics-accounts"],
    queryFn: listAnalyticsAccounts,
    enabled: !!session,
  });

  const queryKey = ["inbox-comments", range, platform, accountId] as const;

  const inboxQuery = useQuery({
    queryKey,
    queryFn: () =>
      listInboxComments({
        range,
        platform: platform || undefined,
        accountId: accountId || undefined,
      }),
    enabled: !!session,
    staleTime: 30_000,
  });

  const replyMut = useMutation({
    mutationFn: replyToInboxComment,
    onSuccess: (res, vars) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Reply sent");
      const account =
        accountsQuery.data?.find((a) => a.id === accountId) ??
        accountsQuery.data?.find(
          (a) =>
            a.id ===
            inboxQuery.data?.threads.find(
              (t) => t.comment.publicationId === vars.publicationId,
            )?.comment.accountId,
        );
      qc.setQueryData<InboxListResult>(queryKey, (old) => {
        if (!old) return old;
        return appendOptimisticReply(old, {
          publicationId: vars.publicationId,
          parentCommentId: vars.commentId,
          text: vars.text,
          replyId: res.replyId,
          accountLabel: account?.username ?? null,
        });
      });
      // Soft refresh so platform nesting / ids catch up without wiping the reply.
      void qc.invalidateQueries({ queryKey: ["inbox-comments"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Reply failed");
    },
  });

  const accountsForFilter = useMemo(() => {
    const rows = (accountsQuery.data ?? []).filter((a) =>
      (PLATFORM_FILTERS as readonly string[]).includes(a.platform),
    );
    if (!platform) return rows;
    return rows.filter((a) => a.platform === platform);
  }, [accountsQuery.data, platform]);

  const data = inboxQuery.data;
  const threads = data?.threads ?? [];

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

  if (sessionPending) {
    return <InboxSkeleton />;
  }

  if (!session) {
    return (
      <GuestPostsPageView
        pageTitle="Inbox"
        pageDescription="Comments from every connected platform, in one place."
        promptTitle="Sign in to see comments"
        promptDescription="Once you publish, Social0 pulls comments from each platform so you can reply here."
      />
    );
  }

  const loading = inboxQuery.isLoading || inboxQuery.isFetching;
  const selected =
    threads.find((t) => threadKey(t) === pickedId) ?? threads[0] ?? null;
  const rangeLabel =
    data?.since && data?.until
      ? `${format(new Date(data.since), "MMM d")} – ${format(new Date(data.until), "MMM d")}`
      : null;
  const emptyRangeLabel = RANGE_EMPTY_LABEL[range];
  const showList = !mobileDetail;
  const showDetail = mobileDetail || Boolean(selected);

  return (
    <div className="-mx-1 flex min-h-[calc(100dvh-8rem)] flex-col gap-3 sm:mx-0">
      <header className="flex flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="font-logo text-[1.75rem] font-normal tracking-tight text-foreground sm:text-[2rem]">
          Inbox
        </h1>
        <div
          role="tablist"
          aria-label="Date range"
          className="inline-flex rounded-lg border border-border bg-bg-muted p-0.5"
        >
          {RANGE_OPTIONS.map((opt) => {
            const on = range === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setRange(opt.value);
                  setPickedId(null);
                  setMobileDetail(false);
                }}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors",
                  on
                    ? "bg-bg-elevated text-text shadow-sm"
                    : "text-text-muted hover:text-text",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {rangeLabel ? (
          <span className="hidden text-xs tabular-nums text-text-muted sm:inline">
            {rangeLabel}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {threads.length > 0 ? (
            <span className="text-xs text-text-muted">
              {threads.length} thread{threads.length === 1 ? "" : "s"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void inboxQuery.refetch()}
            disabled={loading}
            aria-label="Refresh inbox"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-bg-subtle hover:text-text disabled:opacity-60"
          >
            <ArrowClockwise
              className={cn("h-4 w-4", loading && "animate-spin")}
              size={16}
            />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <PlatformToggle
          label="All"
          selected={platform == null}
          onClick={() => {
            setPlatform(null);
            setAccountId(null);
            setPickedId(null);
            setMobileDetail(false);
          }}
        />
        {PLATFORM_FILTERS.map((id) => (
          <PlatformToggle
            key={id}
            label={PLATFORM_LABEL[id] ?? id}
            selected={platform === id}
            icon={<PlatformIcon platform={id} size={13} />}
            onClick={() => {
              setPlatform(id);
              setAccountId(null);
              setPickedId(null);
              setMobileDetail(false);
            }}
          />
        ))}
        {accountsForFilter.length > 1 ? (
          <>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <AccountToggle
              selected={accountId == null}
              label="All"
              onClick={() => {
                setAccountId(null);
                setPickedId(null);
                setMobileDetail(false);
              }}
            >
              <SquaresFour size={14} weight={accountId == null ? "fill" : "regular"} />
            </AccountToggle>
            {accountsForFilter.map((a) => (
              <AccountToggle
                key={a.id}
                selected={accountId === a.id}
                label={`@${handleLabel(a.username)}`}
                onClick={() => {
                  setAccountId(a.id);
                  setPickedId(null);
                  setMobileDetail(false);
                }}
              >
                <span className="relative block h-5 w-5 overflow-hidden rounded-full">
                  <AccountAvatar
                    profileImageUrl={a.profileImageUrl}
                    username={a.username}
                    platform={a.platform}
                    fill
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-bg-elevated">
                    <PlatformIcon platform={a.platform} size={8} />
                  </span>
                </span>
              </AccountToggle>
            ))}
          </>
        ) : null}
      </div>

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
        <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="h-full animate-pulse bg-bg-muted/60" />
          <div className="hidden h-full animate-pulse bg-bg-muted/40 lg:block" />
        </div>
      ) : !data || threads.length === 0 ? (
        <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated px-6 text-center">
          <ChatCircle size={28} className="text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">No comments yet</p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Comments on Social0 posts from {emptyRangeLabel} show up here.
            Try a longer range if you just published.
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
            {threads.map((thread) => {
              const key = threadKey(thread);
              const active = selected ? threadKey(selected) === key : false;
              const c = thread.comment;
              const when = c.createdAt
                ? formatDistanceToNow(new Date(c.createdAt), {
                    addSuffix: false,
                  })
                : "";
              const replyCount = thread.replies.length;
              const ownReply = thread.replies.some((r) => r.isOwn);
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
                      <PlatformIcon platform={c.platform} size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-text">
                          {c.isOwn ? "You" : c.authorName}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-text-muted">
                          {when}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-text-muted">
                        {c.text || "(No text)"}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
                        <span>{PLATFORM_LABEL[c.platform] ?? c.platform}</span>
                        {replyCount > 0 ? (
                          <span>
                            {replyCount} repl
                            {replyCount === 1 ? "y" : "ies"}
                            {ownReply ? " · you replied" : ""}
                          </span>
                        ) : null}
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
              <ConversationPane
                thread={selected}
                dash={dash}
                sending={replyMut.isPending}
                onBack={() => setMobileDetail(false)}
                onReply={(commentId, text) =>
                  replyMut.mutate({
                    publicationId: selected.comment.publicationId,
                    commentId,
                    text,
                  })
                }
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-muted">
                Select a comment
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
    </div>
  );
}

function PlatformToggle({
  label,
  selected,
  onClick,
  icon,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
        selected
          ? "bg-accent text-accent-foreground"
          : "bg-bg-muted text-text-muted hover:text-text",
      )}
    >
      {icon}
      <span className={icon ? "hidden sm:inline" : undefined}>{label}</span>
    </button>
  );
}

function AccountToggle({
  selected,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all",
        selected
          ? "border-accent bg-accent/10"
          : "border-transparent opacity-70 hover:opacity-100",
      )}
    >
      {children}
    </button>
  );
}

function ConversationPane({
  thread,
  dash,
  sending,
  onBack,
  onReply,
}: {
  thread: InboxThread;
  dash: (path: string) => string;
  sending: boolean;
  onBack: () => void;
  onReply: (commentId: string, text: string) => void;
}) {
  const c = thread.comment;
  const [draft, setDraft] = useState("");
  const max = replyMax(c.platform);

  // Reset composer when switching threads.
  useEffect(() => {
    setDraft("");
  }, [c.id]);

  const messages = [c, ...thread.replies];

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
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            On your {PLATFORM_LABEL[c.platform] ?? c.platform} post
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-text">
            {c.postSnippet}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
            <Link
              href={dash(`posts/${c.postId}`)}
              className="text-accent hover:underline"
            >
              Open in Social0
            </Link>
            {c.platformPostUrl ? (
              <a
                href={c.platformPostUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-text-muted hover:text-accent"
              >
                View on {PLATFORM_LABEL[c.platform] ?? c.platform}
                <ArrowSquareOut size={11} />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            comment={m}
            isRoot={i === 0}
          />
        ))}
      </div>

      {c.canReply ? (
        <form
          className="border-t border-border bg-bg-elevated p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text || sending) return;
            onReply(c.id, text);
            setDraft("");
          }}
        >
          <label className="sr-only" htmlFor="inbox-reply">
            Reply
          </label>
          <div className="flex gap-2">
            <textarea
              id="inbox-reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={max}
              placeholder={`Reply to ${c.isOwn ? "this thread" : c.authorName}…`}
              className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              aria-label="Send reply"
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
          Replies aren&apos;t available for{" "}
          {PLATFORM_LABEL[c.platform] ?? c.platform} yet.
        </p>
      )}
    </>
  );
}

function MessageBubble({
  comment,
  isRoot,
}: {
  comment: InboxComment;
  isRoot?: boolean;
}) {
  const when = comment.createdAt
    ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })
    : null;
  const own = Boolean(comment.isOwn);

  return (
    <div
      className={cn(
        "flex gap-2.5",
        own && "flex-row-reverse",
        !isRoot && "ml-2 sm:ml-4",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          own ? "bg-accent/20 text-accent" : "bg-bg-muted",
        )}
      >
        <PlatformIcon platform={comment.platform} size={12} />
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
            {own ? "You" : comment.authorName}
          </span>
          {!own && comment.authorHandle ? (
            <span className="text-text-muted">@{comment.authorHandle}</span>
          ) : null}
          {when ? <span className="text-text-muted">· {when}</span> : null}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed">
          {comment.text}
        </p>
      </div>
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <div className="h-9 w-36 animate-pulse rounded bg-bg-muted" />
      <div className="h-[28rem] animate-pulse rounded-xl bg-bg-muted" />
    </div>
  );
}
