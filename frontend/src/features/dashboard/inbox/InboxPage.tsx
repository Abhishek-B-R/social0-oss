import { useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { RangeToolbar } from "@/components/dashboard/RangeToolbar";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import {
  ArrowClockwise,
  SquaresFour,
} from "@/icons/phosphor";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useSession } from "@/lib/auth-client";
import { listAnalyticsAccounts, type AnalyticsAccount } from "@/api/analytics";
import { PLATFORM_LABEL } from "@/features/dashboard/analytics/analytics-utils";
import { defaultDateWindow, type DateWindow } from "@/lib/date-window";
import { cn } from "@/lib/utils";
import { InboxCommentsPane } from "./InboxCommentsPane";
import { InboxDmsPane } from "./InboxDmsPane";
import { InboxModeToggle, type InboxMode } from "./InboxModeToggle";

export const INBOX_COMMENT_PLATFORMS = new Set([
  "instagram",
  "facebook",
  "threads",
  "twitter_x",
  "youtube",
  "bluesky",
  "linkedin",
]);

export const INBOX_DM_PLATFORMS = new Set([
  "instagram",
  "facebook",
  "twitter_x",
  "bluesky",
]);

function handleLabel(username: string | null | undefined): string {
  if (!username) return "account";
  return username.startsWith("@") ? username.slice(1) : username;
}

export function InboxPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const qc = useQueryClient();
  const [mode, setMode] = useState<InboxMode>("comments");
  const [dateWindow, setDateWindow] = useState<DateWindow>(defaultDateWindow);
  const [accountId, setAccountId] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["analytics-accounts"],
    queryFn: listAnalyticsAccounts,
    enabled: !!session,
  });

  const platformSet =
    mode === "comments" ? INBOX_COMMENT_PLATFORMS : INBOX_DM_PLATFORMS;
  const accountsForFilter = useMemo(
    () =>
      (accountsQuery.data ?? []).filter((a) => platformSet.has(a.platform)),
    [accountsQuery.data, platformSet],
  );

  useEffect(() => {
    if (!accountId) return;
    if (!accountsForFilter.some((a) => a.id === accountId)) {
      setAccountId(null);
    }
  }, [accountId, accountsForFilter]);

  const fetching = useIsFetching({
    queryKey: mode === "comments" ? ["inbox-comments"] : ["inbox-dms"],
  });

  if (sessionPending) {
    return <InboxSkeleton />;
  }

  if (!session) {
    return (
      <GuestPostsPageView
        pageTitle="Inbox"
        pageDescription="Comments and DMs from connected platforms, in one place."
        promptTitle="Sign in to open your inbox"
        promptDescription="Once you connect accounts, Social0 pulls comments on your posts and DMs from platforms that support it."
      />
    );
  }

  const loading = fetching > 0;

  return (
    <div className="-mx-1 flex min-h-[calc(100dvh-8rem)] flex-col gap-4 sm:mx-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
            Inbox
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {mode === "comments"
              ? "Comments on posts you published through Social0."
              : "Direct messages from Instagram, Facebook Pages, X, and Bluesky."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void qc.invalidateQueries({
              queryKey:
                mode === "comments" ? ["inbox-comments"] : ["inbox-dms"],
            });
            if (mode === "dms") {
              void qc.invalidateQueries({ queryKey: ["inbox-dm-thread"] });
            }
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-60"
        >
          <ArrowClockwise
            className={cn("h-4 w-4", loading && "animate-spin")}
            size={16}
          />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <InboxModeToggle value={mode} onChange={setMode} />
      </div>

      <RangeToolbar
        value={dateWindow}
        onChange={setDateWindow}
        label="Inbox date range"
      />

      {accountsQuery.isLoading ? (
        <div className="flex flex-wrap gap-3" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex w-16 flex-col items-center gap-1.5">
              <div className="h-12 w-12 animate-pulse rounded-full bg-bg-muted" />
              <div className="h-2.5 w-12 animate-pulse rounded bg-bg-muted" />
            </div>
          ))}
        </div>
      ) : accountsForFilter.length > 0 ? (
        <div className="flex flex-wrap items-start gap-3">
          <AllAccountsChip
            selected={accountId == null}
            onClick={() => setAccountId(null)}
          />
          {accountsForFilter.map((a) => (
            <InboxAccountChip
              key={a.id}
              account={a}
              selected={accountId === a.id}
              onClick={() => setAccountId(a.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          {mode === "comments"
            ? "Connect Instagram, Facebook, Threads, X, YouTube, Bluesky, or LinkedIn to see comments."
            : "Connect Instagram, Facebook, X, or Bluesky to manage DMs here."}
        </p>
      )}

      {mode === "comments" ? (
        <InboxCommentsPane
          dateWindow={dateWindow}
          accountId={accountId}
          accounts={accountsForFilter}
          enabled
        />
      ) : (
        <InboxDmsPane dateWindow={dateWindow} accountId={accountId} enabled />
      )}
    </div>
  );
}

function AllAccountsChip({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex w-16 flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all",
          selected
            ? "border-accent bg-accent/15 text-accent"
            : "border-transparent bg-bg-muted text-text-muted opacity-70 hover:opacity-100",
        )}
      >
        <SquaresFour size={22} weight={selected ? "fill" : "regular"} />
        {selected ? <SelectedCheck /> : null}
      </span>
      <span
        className={cn(
          "w-full truncate text-center text-[11px] font-semibold",
          selected ? "text-accent" : "text-text-muted",
        )}
      >
        All
      </span>
    </button>
  );
}

function InboxAccountChip({
  account,
  selected,
  onClick,
}: {
  account: AnalyticsAccount;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={`@${handleLabel(account.username)} · ${PLATFORM_LABEL[account.platform] ?? account.platform}`}
      className="flex w-16 flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-all",
          selected
            ? "border-accent opacity-100"
            : "border-transparent opacity-60 hover:opacity-100",
        )}
      >
        <span className="h-full w-full overflow-hidden rounded-full">
          <AccountAvatar
            profileImageUrl={account.profileImageUrl}
            username={account.username}
            platform={account.platform}
            fill
          />
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-bg bg-bg-elevated shadow-sm">
          <PlatformIcon platform={account.platform} size={11} />
        </span>
        {selected ? <SelectedCheck /> : null}
      </span>
      <span
        className={cn(
          "w-full truncate text-center text-[11px] font-semibold",
          selected ? "text-accent" : "text-text",
        )}
      >
        {handleLabel(account.username)}
      </span>
    </button>
  );
}

function SelectedCheck() {
  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M5 13l4 4L19 7"
        />
      </svg>
    </span>
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
