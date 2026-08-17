import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "@/components/AppLink";
import { AccountAvatar } from "@/components/AccountAvatar";
import { ArrowClockwise, ChatCircle, SquaresFour } from "@/icons/phosphor";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useSession } from "@/lib/auth-client";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { listAnalyticsAccounts } from "@/api/analytics";
import {
  listInboxComments,
  replyToInboxComment,
  type InboxComment,
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

function threadKey(thread: InboxThread): string {
  return `${thread.comment.publicationId}-${thread.comment.id}`;
}

function replyMax(platform: string): number {
  if (platform === "twitter_x") return 280;
  if (platform === "bluesky") return 300;
  if (platform === "threads") return 500;
  return 2000;
}

function handleLabel(username: string | null): string {
  if (!username) return "account";
  return username.startsWith("@") ? username.slice(1) : username;
}

export function InboxPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const dash = useDashboardPath();
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["analytics-accounts"],
    queryFn: listAnalyticsAccounts,
    enabled: !!session,
  });

  const inboxQuery = useQuery({
    queryKey: ["inbox-comments", platform, accountId],
    queryFn: () =>
      listInboxComments({
        platform: platform || undefined,
        accountId: accountId || undefined,
      }),
    enabled: !!session,
    staleTime: 30_000,
  });

  const replyMut = useMutation({
    mutationFn: replyToInboxComment,
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Reply sent");
        void qc.invalidateQueries({ queryKey: ["inbox-comments"] });
      } else {
        toast.error(res.error);
      }
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

  const data = inboxQuery.data;
  const loading = inboxQuery.isLoading || inboxQuery.isFetching;
  const threads = data?.threads ?? [];
  const selected =
    threads.find((t) => threadKey(t) === pickedId) ?? threads[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
            Inbox
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Comments on posts you published through Social0. Reply without
            switching apps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void inboxQuery.refetch()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text hover:bg-bg-subtle disabled:opacity-60"
        >
          <ArrowClockwise
            className={cn("h-4 w-4", loading && "animate-spin")}
            size={16}
          />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          label="All platforms"
          selected={platform == null}
          onClick={() => {
            setPlatform(null);
            setAccountId(null);
            setPickedId(null);
          }}
        />
        {PLATFORM_FILTERS.map((id) => (
          <FilterChip
            key={id}
            label={PLATFORM_LABEL[id] ?? id}
            selected={platform === id}
            icon={<PlatformIcon platform={id} size={12} />}
            onClick={() => {
              setPlatform(id);
              setAccountId(null);
              setPickedId(null);
            }}
          />
        ))}
      </div>

      {accountsForFilter.length > 0 ? (
        <div className="flex flex-wrap items-start gap-3">
          <button
            type="button"
            onClick={() => {
              setAccountId(null);
              setPickedId(null);
            }}
            aria-pressed={accountId == null}
            className="flex w-16 flex-col items-center gap-1.5"
          >
            <span
              className={cn(
                "relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all",
                accountId == null
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-transparent bg-bg-muted text-text-muted opacity-70 hover:opacity-100",
              )}
            >
              <SquaresFour
                size={22}
                weight={accountId == null ? "fill" : "regular"}
              />
            </span>
            <span
              className={cn(
                "w-full truncate text-center text-[11px] font-semibold",
                accountId == null ? "text-accent" : "text-text-muted",
              )}
            >
              All
            </span>
          </button>
          {accountsForFilter.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setAccountId(a.id);
                setPickedId(null);
              }}
              aria-pressed={accountId === a.id}
              title={`@${handleLabel(a.username)}`}
              className="flex w-16 flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  accountId === a.id
                    ? "border-accent opacity-100"
                    : "border-transparent opacity-60 hover:opacity-100",
                )}
              >
                <span className="h-full w-full overflow-hidden rounded-full">
                  <AccountAvatar
                    profileImageUrl={a.profileImageUrl}
                    username={a.username}
                    platform={a.platform}
                    fill
                  />
                </span>
                <span className="absolute bottom-0 right-0 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-bg-elevated bg-bg-elevated">
                  <PlatformIcon platform={a.platform} size={11} />
                </span>
              </span>
              <span
                className={cn(
                  "w-full truncate text-center text-[11px] font-semibold",
                  accountId === a.id ? "text-accent" : "text-text",
                )}
              >
                {handleLabel(a.username)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {data?.accountsNeedingReconnect?.length ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">Reconnect to read & reply</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-100/80">
            Instagram needs comment permission; Facebook needs page engagement.
            Publishing still works.
          </p>
          <ul className="mt-2 list-inside list-disc text-xs">
            {data.accountsNeedingReconnect.map((a) => (
              <li key={a.accountId}>
                {PLATFORM_LABEL[a.platform] ?? a.platform}
                {a.username ? ` (@${a.username})` : ""}
              </li>
            ))}
          </ul>
          <Link
            href={dash("connections")}
            className="mt-2 inline-block text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            Open Connections
          </Link>
        </div>
      ) : null}

      {data?.unsupported?.length ? (
        <p className="text-xs text-text-muted">
          Comments aren&apos;t available for{" "}
          {data.unsupported
            .map((p) => PLATFORM_LABEL[p] ?? p)
            .join(", ")}{" "}
          yet.
        </p>
      ) : null}

      {inboxQuery.isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {inboxQuery.error instanceof Error
            ? inboxQuery.error.message
            : "Failed to load comments"}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="h-72 animate-pulse rounded-2xl bg-bg-muted" />
          <div className="h-72 animate-pulse rounded-2xl bg-bg-muted" />
        </div>
      ) : !data || threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-elevated px-6 py-16 text-center">
          <ChatCircle size={32} className="text-text-muted" />
          <p className="mt-3 text-sm font-medium text-text">No comments yet</p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Comments on Social0 posts from the last 30 days show up here. TikTok
            and Pinterest don&apos;t expose a comments API yet.
          </p>
        </div>
      ) : (
        <div className="grid min-h-[28rem] overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-sm lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <ul
            className={cn(
              "max-h-[70vh] divide-y divide-border overflow-y-auto lg:border-r lg:border-border",
              pickedId ? "hidden lg:block" : "block",
            )}
          >
            {threads.map((thread) => {
              const key = threadKey(thread);
              const active = selected ? threadKey(selected) === key : false;
              const c = thread.comment;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setPickedId(key)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left hover:bg-bg-subtle",
                      active && "bg-accent/10",
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-muted">
                      <PlatformIcon platform={c.platform} size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm">
                        <span className="truncate font-semibold text-text">
                          {c.authorName}
                        </span>
                        <span className="shrink-0 text-xs text-text-muted">
                          {PLATFORM_LABEL[c.platform] ?? c.platform}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-sm text-text-muted">
                        {c.text || "(No text)"}
                      </span>
                      {thread.replies.length > 0 ? (
                        <span className="mt-1 block text-xs text-text-muted">
                          {thread.replies.length}{" "}
                          {thread.replies.length === 1 ? "reply" : "replies"}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div
            className={cn(
              "flex min-w-0 flex-col p-4 sm:p-5",
              pickedId ? "flex" : "hidden lg:flex",
            )}
          >
            {selected ? (
              <>
                <button
                  type="button"
                  onClick={() => setPickedId(null)}
                  className="mb-3 self-start text-sm text-text-muted hover:text-text lg:hidden"
                >
                  ← All comments
                </button>
                <ThreadDetail
                  thread={selected}
                  dash={dash}
                  sending={replyMut.isPending}
                  onReply={(commentId, text) =>
                    replyMut.mutate({
                      publicationId: selected.comment.publicationId,
                      commentId,
                      text,
                    })
                  }
                />
              </>
            ) : null}
          </div>
        </div>
      )}

      {data?.sampled ? (
        <p className="text-xs text-text-muted">
          Showing comments from the latest {data.sampleLimit} Social0
          publications.
        </p>
      ) : null}
    </div>
  );
}

function FilterChip({
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
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        selected
          ? "bg-accent text-accent-foreground"
          : "border border-border text-text-muted hover:bg-bg-subtle hover:text-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ThreadDetail({
  thread,
  dash,
  sending,
  onReply,
}: {
  thread: InboxThread;
  dash: (path: string) => string;
  sending: boolean;
  onReply: (commentId: string, text: string) => void;
}) {
  const c = thread.comment;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CommentBlock comment={c} />
      {thread.replies.length > 0 ? (
        <ul className="mt-4 space-y-4 border-l border-border pl-4">
          {thread.replies.map((r) => (
            <li key={r.id}>
              <CommentBlock comment={r} compact />
              {r.canReply ? (
                <ReplyForm
                  platform={r.platform}
                  sending={sending}
                  onReply={(text) => onReply(r.id, text)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <Link
          href={dash(`posts/${c.postId}`)}
          className="text-text-muted hover:text-accent"
        >
          On: {c.postSnippet}
        </Link>
        {c.platformPostUrl ? (
          <a
            href={c.platformPostUrl}
            target="_blank"
            rel="noreferrer"
            className="text-text-muted hover:text-accent"
          >
            View on {PLATFORM_LABEL[c.platform] ?? c.platform}
          </a>
        ) : null}
      </div>
      {c.canReply ? (
        <ReplyForm
          platform={c.platform}
          sending={sending}
          onReply={(text) => onReply(c.id, text)}
        />
      ) : (
        <p className="mt-4 text-sm text-text-muted">
          Replies aren&apos;t available for{" "}
          {PLATFORM_LABEL[c.platform] ?? c.platform} yet.
        </p>
      )}
    </div>
  );
}

function ReplyForm({
  platform,
  sending,
  onReply,
}: {
  platform: string;
  sending: boolean;
  onReply: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const max = replyMax(platform);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm font-medium text-accent hover:underline"
      >
        Reply
      </button>
    );
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;
        onReply(text);
        setDraft("");
        setOpen(false);
      }}
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        maxLength={max}
        placeholder="Write a reply…"
        className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
        >
          Send reply
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:text-text"
        >
          Cancel
        </button>
        <span className="ml-auto text-xs text-text-muted">
          {draft.length}/{max}
        </span>
      </div>
    </form>
  );
}

function CommentBlock({
  comment,
  compact,
}: {
  comment: InboxComment;
  compact?: boolean;
}) {
  const when = comment.createdAt
    ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })
    : null;
  return (
    <div className={cn("flex gap-3", compact && "opacity-90")}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-muted">
        <PlatformIcon platform={comment.platform} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text">
          <span className="font-semibold">{comment.authorName}</span>
          {comment.authorHandle ? (
            <span className="text-text-muted"> @{comment.authorHandle}</span>
          ) : null}
          <span className="text-text-muted">
            {" "}
            · {PLATFORM_LABEL[comment.platform] ?? comment.platform}
            {comment.accountLabel ? ` · ${comment.accountLabel}` : ""}
            {when ? ` · ${when}` : ""}
          </span>
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text">
          {comment.text}
        </p>
        {comment.likeCount ? (
          <p className="mt-1 text-xs text-text-muted">
            {comment.likeCount} {comment.likeCount === 1 ? "like" : "likes"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="h-10 w-40 animate-pulse rounded bg-bg-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-bg-muted" />
    </div>
  );
}
