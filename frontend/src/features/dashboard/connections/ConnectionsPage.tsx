import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Link from "@/components/AppLink";
import {
  CONNECTED_ACCOUNTS_QUERY_KEY,
  EmptyState,
  ErrorState,
  FilterChip,
  PageContainer,
  PageHeader,
  networkLabel,
  useAccountHealth,
  useDashboardPath,
  useSearchParamState,
} from "@/components/app";
import {
  loadDashboardLayoutData,
  type LoadConnectionsPageDataResult,
} from "@/api/dashboard-data";
import { useSession } from "@/lib/auth-client";
import { useIsGuest } from "@/lib/use-is-guest";
import { planName } from "@/lib/plan-name";
import { capturePostAction } from "@/lib/posthog-events";
import { invalidateTeamRoomQueries } from "@/lib/team-query-keys";
import { LimitModal } from "@/components/billing/LimitModal";
import { AccountsTable } from "./AccountsTable";
import { AccountDrawer } from "./AccountDrawer";
import { AGENCY_EXTRA_ACCOUNT_NOTE } from "@/lib/plan-pricing";
import { ConnectAccountDialog } from "./ConnectAccountDialog";
import { ConnectNotices } from "./ConnectNotices";
import { DisconnectAccountDialog } from "./DisconnectAccountDialog";
import {
  NETWORK_IDS,
  accountLongLabel,
  isNetworkId,
  needsAttention,
  sortAccounts,
  type AccountRow,
  type NetworkId,
} from "./accounts-model";
import { disconnectAccount, useAccountMetadata } from "./use-account-details";

/**
 * Accounts (route `connections`, personal and team scope).
 *
 * URL state other pages link to:
 *   ?connect=1            open the connect modal (or ?connect=<network> for its explainer)
 *   ?account=<id>         open that account's drawer
 *   ?show=attention       only accounts that need attention
 * OAuth results (?connected, ?reauth, ?error, ?platform, ?message) are read by ConnectNotices.
 */
export function ConnectionsPage() {
  const dash = useDashboardPath();
  const isGuest = useIsGuest();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const posthog = usePostHog();

  const health = useAccountHealth({ enabled: !isGuest, fullCheck: true });
  const layout = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    enabled: !!session,
    staleTime: 60_000,
  });
  const metadataQuery = useAccountMetadata(!!session && !isGuest);

  const [, setSearchParams] = useSearchParams();
  const [show, setShow] = useSearchParamState<"" | "attention">("show", "");
  const [accountParam, setAccountParam] = useSearchParamState<string>("account", "");
  const [connectParam, setConnectParam] = useSearchParamState<string>("connect", "");
  const [blueskyHandle, setBlueskyHandle] = useState<string | undefined>(undefined);
  const [disconnectTarget, setDisconnectTarget] = useState<AccountRow | null>(null);

  const canManage = isGuest || health.canManageConnections;
  const canAccessBilling = health.canAccessBilling;
  const billingHref = dash("billing");
  const returnTo = dash("connections");
  const limit = health.accountLimit;
  const plan = planName(layout.data?.subscriptionTier);

  const { refetch } = health;
  const hasSession = !!session;
  const loading = !isGuest && !health.isError && (health.isLoading || !hasSession);

  // Refetch when the tab regains focus: covers OAuth finished in another tab
  // and token refreshes done elsewhere. Debounced against focus churn.
  useEffect(() => {
    if (isGuest || !hasSession) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetch(), 400);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
    };
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isGuest, hasSession, refetch]);

  const allRows = useMemo(
    () => sortAccounts(isGuest ? [] : (health.accounts as AccountRow[])),
    [health.accounts, isGuest],
  );
  const attentionCount = allRows.filter(needsAttention).length;
  const rows = show === "attention" ? allRows.filter(needsAttention) : allRows;

  const connectedCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of allRows) out[a.platform] = (out[a.platform] ?? 0) + 1;
    return out;
  }, [allRows]);
  const unconnected = useMemo(
    () => (show === "attention" ? [] : NETWORK_IDS.filter((id) => !connectedCounts[id])),
    [connectedCounts, show],
  );

  // Optional columns appear once the backend sends the fields.
  const showAddedBy = allRows.some((a) => a.addedByName !== undefined);
  const showLastPost = allRows.some((a) => a.lastPostAt !== undefined);

  /** Agency bills accounts above the included ones instead of blocking. */
  const autoBilled = !isGuest && !!limit?.autoBilled;
  const included = limit?.includedTotal ?? 0;
  const billedExtras = autoBilled ? Math.max(0, (limit?.currentTotal ?? 0) - included) : 0;
  const agencyNote =
    autoBilled && canAccessBilling
      ? billedExtras > 0
        ? `${billedExtras} account${billedExtras === 1 ? "" : "s"} over the ${included} included ${billedExtras === 1 ? "is" : "are"} on your bill. ${AGENCY_EXTRA_ACCOUNT_NOTE}`
        : AGENCY_EXTRA_ACCOUNT_NOTE
      : null;

  const atLimit =
    !isGuest && limit && limit.currentTotal >= limit.limitTotal
      ? { current: limit.currentTotal, max: limit.limitTotal, planName: plan }
      : null;

  const selected = accountParam ? (allRows.find((a) => a.id === accountParam) ?? null) : null;

  // Connect modal: open unless the viewer can't manage connections.
  const connectOpen = !!connectParam && canManage && !loading;
  const initialNetwork: NetworkId | null = isNetworkId(connectParam) ? connectParam : null;
  // Over the account limit, billing owners get the plan-limit moment instead of
  // the connect flow. Updating a Bluesky app password isn't a new account, and
  // viewers without billing access keep the dialog's "ask the owner" step.
  const showLimitModal =
    connectOpen &&
    !!atLimit &&
    atLimit.max > 0 &&
    canAccessBilling &&
    !(initialNetwork === "bluesky" && blueskyHandle);

  const openConnect = useCallback(
    (network: NetworkId | null) => {
      setBlueskyHandle(undefined);
      setConnectParam(network ?? "1", { push: true });
    },
    [setConnectParam],
  );

  const closeConnect = () => {
    setConnectParam(null);
    setBlueskyHandle(undefined);
  };

  const confirmDisconnect = async (account: AccountRow) => {
    try {
      await disconnectAccount(account.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect this account.");
      throw err;
    }
    // Optimistic: drop the row and free the slot before the refetch lands.
    queryClient.setQueryData<LoadConnectionsPageDataResult>(
      CONNECTED_ACCOUNTS_QUERY_KEY,
      (prev) => {
        if (!prev || !prev.ok) return prev;
        const accounts = prev.data.accounts.filter((a) => a.id !== account.id);
        const accountLimit =
          prev.data.accountLimit && account.isActive !== false
            ? {
                ...prev.data.accountLimit,
                currentTotal: Math.max(0, prev.data.accountLimit.currentTotal - 1),
              }
            : prev.data.accountLimit;
        return { ...prev, data: { ...prev.data, accounts, accountLimit } };
      },
    );
    capturePostAction(posthog, "account_disconnected", { platform: account.platform });
    toast.success(`Disconnected ${accountLongLabel(account, networkLabel(account.platform))}.`);
    setAccountParam(null);
    // Accounts feed Analytics/Inbox chips, Home, Calendar and Posts too.
    void invalidateTeamRoomQueries(queryClient);
    void queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
  };

  // The subtitle carries state only: plan usage for admins (the sidebar has
  // the meter), or why the viewer can't change anything.
  const usage =
    !isGuest && canManage && !loading && limit && autoBilled && !atLimit ? (
      <>
        <span className="tabular-nums">{limit.currentTotal}</span> accounts on {plan} ·{" "}
        {included} included
        {billedExtras > 0 ? (
          <>
            , <span className="tabular-nums">{billedExtras}</span> extra on your bill
          </>
        ) : null}
      </>
    ) : !isGuest && canManage && !loading && limit && limit.limitTotal > 0 ? (
      <>
        <span className="tabular-nums">
          {limit.currentTotal} of {limit.limitTotal}
        </span>{" "}
        accounts on {plan}
        {atLimit ? (
          canAccessBilling ? (
            <>
              {". "}
              <Link
                href={billingHref}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Upgrade for more
              </Link>
            </>
          ) : (
            ". Ask the workspace owner to upgrade for more."
          )
        ) : null}
      </>
    ) : null;
  const subtitle =
    !isGuest && !canManage
      ? "View only. Workspace admins can connect, reconnect and disconnect accounts."
      : health.checking && usage
        ? (
            <>
              {usage} · Checking connections…
            </>
          )
        : usage;

  // The filter only earns its place when something needs attention (or a
  // link landed on ?show=attention).
  const showFilter = !isGuest && allRows.length > 0 && (attentionCount > 0 || show === "attention");

  return (
    <PageContainer stack>
      <PageHeader
        title="Accounts"
        subtitle={subtitle}
        actions={
          canManage ? (
            // Stays enabled while loading: a click sets ?connect=1 and the
            // dialog opens as soon as the account list arrives.
            <Button onClick={() => openConnect(null)}>
              <Plus aria-hidden />
              Connect account
            </Button>
          ) : undefined
        }
      >
        {showFilter ? (
          <div role="group" aria-label="Filter accounts" className="flex items-center gap-1.5">
            <FilterChip
              selected={show !== "attention"}
              onClick={() => setShow(null)}
              count={allRows.length}
            >
              All
            </FilterChip>
            <FilterChip
              selected={show === "attention"}
              onClick={() => setShow(show === "attention" ? null : "attention")}
              count={attentionCount}
              tone={attentionCount > 0 ? "warning" : "default"}
            >
              Needs attention
            </FilterChip>
          </div>
        ) : null}
      </PageHeader>

      <ConnectNotices
        canAccessBilling={canAccessBilling}
        billingHref={billingHref}
        onRetry={() => setBlueskyHandle(undefined)}
      />

      {health.isError && allRows.length === 0 ? (
        <ErrorState
          message="Couldn't load your accounts."
          detail="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : show === "attention" && !loading && rows.length === 0 ? (
        <EmptyState
          compact
          title="Every account is working."
          description="Nothing needs reconnecting right now."
          primaryAction={{ label: "Show all accounts", onClick: () => setShow(null) }}
        />
      ) : (
        <AccountsTable
          rows={rows}
          unconnected={unconnected}
          loading={loading}
          metadata={metadataQuery.data}
          canManage={canManage}
          canAccessBilling={canAccessBilling}
          billingHref={billingHref}
          showAddedBy={showAddedBy}
          showLastPost={showLastPost}
          onOpen={(a) => setAccountParam(a.id, { push: true })}
          onConnect={(network) => openConnect(network)}
        />
      )}

      <p className="text-[13px] text-text-muted">
        Having trouble connecting an account?{" "}
        <a
          href="mailto:support@social0.app"
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Email support@social0.app
        </a>
      </p>

      <ConnectAccountDialog
        open={connectOpen && !showLimitModal}
        onOpenChange={(open) => (open ? undefined : closeConnect())}
        initialNetwork={initialNetwork}
        initialBlueskyHandle={initialNetwork === "bluesky" ? blueskyHandle : undefined}
        returnTo={returnTo}
        connectedCounts={connectedCounts}
        atLimit={atLimit}
        canAccessBilling={canAccessBilling}
        billingHref={billingHref}
        requireAuth={isGuest}
        onConnected={() => void refetch()}
        billingNote={agencyNote}
      />

      <LimitModal
        open={showLimitModal}
        onOpenChange={(open) => (open ? undefined : closeConnect())}
        reason="accounts"
        used={atLimit?.current}
      />

      <AccountDrawer
        account={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setAccountParam(null);
        }}
        metadata={
          selected
            ? metadataQuery.isError
              ? null
              : metadataQuery.data
                ? (metadataQuery.data[selected.id] ?? {})
                : undefined
            : undefined
        }
        canManage={canManage}
        canAccessBilling={canAccessBilling}
        billingHref={billingHref}
        accountLimitMax={limit?.limitTotal ?? null}
        onDisconnect={(a) => setDisconnectTarget(a)}
        onUpdateBlueskyPassword={(a) => {
          // One URL update: separate setters would each start from the same
          // params and the second would undo the first.
          setBlueskyHandle(a.platformUsername ?? undefined);
          setSearchParams((prev) => {
            const p = new URLSearchParams(prev);
            p.delete("account");
            p.set("connect", "bluesky");
            return p;
          });
        }}
        onAccountsChanged={() => void refetch()}
      />

      <DisconnectAccountDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
        accountLabel={
          disconnectTarget
            ? accountLongLabel(disconnectTarget, networkLabel(disconnectTarget.platform))
            : ""
        }
        onConfirm={() =>
          disconnectTarget ? confirmDisconnect(disconnectTarget) : Promise.resolve()
        }
      />
    </PageContainer>
  );
}
