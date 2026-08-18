import { useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RangeToolbar } from "@/components/dashboard/RangeToolbar";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { ArrowClockwise } from "@/icons/phosphor";
import { useSession } from "@/lib/auth-client";
import { listInboxAccounts } from "@/api/inbox";
import { defaultDateWindow, type DateWindow } from "@/lib/date-window";
import { ExperimentalBadge } from "@/components/dashboard/ExperimentalBadge";
import { AccountFilterChips } from "@/components/dashboard/AccountFilterChips";
import { cn } from "@/lib/utils";
import { InboxCommentsPane } from "./InboxCommentsPane";
import { InboxDmsPane } from "./InboxDmsPane";
import { InboxModeToggle, type InboxMode } from "./InboxModeToggle";

export function InboxPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: InboxMode = searchParams.get("tab") === "dms" ? "dms" : "comments";
  const accountId = searchParams.get("account");
  const [dateWindow, setDateWindow] = useState<DateWindow>(defaultDateWindow);

  const setMode = (next: InboxMode) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === "dms") {
          nextParams.set("tab", "dms");
          nextParams.delete("thread");
        } else {
          nextParams.delete("tab");
          nextParams.delete("convo");
        }
        return nextParams;
      },
      { replace: true },
    );
  };

  const setAccountId = (id: string | null) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (id) nextParams.set("account", id);
        else nextParams.delete("account");
        return nextParams;
      },
      { replace: true },
    );
  };

  const accountsQuery = useQuery({
    queryKey: ["inbox-accounts", mode],
    queryFn: () =>
      listInboxAccounts({ mode: mode === "dms" ? "dms" : "comments" }),
    enabled: !!session,
  });

  const accounts = accountsQuery.data ?? [];

  useEffect(() => {
    if (!accountId || accountsQuery.isLoading) return;
    if (!accounts.some((a) => a.id === accountId)) {
      setAccountId(null);
    }
  }, [accountId, accounts, accountsQuery.isLoading]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2.5 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
            Inbox
            <ExperimentalBadge />
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {mode === "comments"
              ? "Comments on posts you published through Social0."
              : "Direct messages from your connected accounts."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-1">
          <InboxModeToggle value={mode} onChange={setMode} />
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
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 text-sm font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-60"
          >
            <ArrowClockwise
              className={cn("h-4 w-4", loading && "animate-spin")}
              size={16}
            />
            Refresh
          </button>
        </div>
      </div>

      <RangeToolbar
        value={dateWindow}
        onChange={setDateWindow}
        label="Inbox date range"
      />

      <AccountFilterChips
        accounts={accounts}
        selectedId={accountId}
        onSelect={setAccountId}
        loading={accountsQuery.isLoading}
        emptyLabel={
          mode === "comments"
            ? "Connect an account to see comments."
            : "Connect an account to manage DMs."
        }
      />

      {mode === "comments" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <InboxCommentsPane
            dateWindow={dateWindow}
            accountId={accountId}
            accounts={accounts}
            enabled
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <InboxDmsPane dateWindow={dateWindow} accountId={accountId} enabled />
        </div>
      )}
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
