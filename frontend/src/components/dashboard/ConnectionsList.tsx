import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { fetchApi } from "@/lib/fetch-api";
import { apiUrl } from "@/lib/env";

import { useState, useEffect } from "react";
import Link from "@/components/AppLink";
import { getPlatformIcon } from "@/lib/platform-icons";
import { PLATFORMS } from "@/lib/platforms";
import { AccountAvatar } from "@/components/AccountAvatar";
import { ConnectPlatformButton } from "./ConnectPlatformButton";
import { DisconnectAccountModal } from "./DisconnectAccountModal";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { IconCrown, IconLoader2 } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import DocsInfoIcon from "../info-icon";
import { DOCS_CONNECTIONS_URL } from "@/lib/docs-url";

const PLATFORM_UI: Record<string, { name: string; color: string }> = {
  linkedin: { name: "LinkedIn", color: "bg-[#0A66C2]" },
  facebook: { name: "Facebook", color: "bg-[#1877F2]" },
  bluesky: { name: "Bluesky", color: "bg-[#0085FF]" },
  youtube: { name: "YouTube", color: "bg-[#FF0000]" },
  pinterest: { name: "Pinterest", color: "bg-[#E60023]" },
  instagram: {
    name: "Instagram",
    color: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
  tiktok: { name: "TikTok", color: "bg-[#000000]" },
  twitter_x: { name: "X (Twitter)", color: "bg-[#000000]" },
  threads: { name: "Threads", color: "bg-[#000000]" },
};

function connectionHandleLabel(
  platform: string,
  platformUsername: string | null,
): string {
  const name = platformUsername?.trim();
  if (!name) {
    return platform === "tiktok" ? "TikTok account" : "@user";
  }
  if (platform === "tiktok" && /\s/.test(name)) return name;
  return `@${name}`;
}

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  /** Display name (e.g. TikTok nickname); when set, list shows "displayName (@handle)" */
  platformDisplayName?: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  isTwitterPremium?: boolean;
  tokenStatus: "ok" | "expiring_soon" | "expired";
  expiresInDays: number | null;
};

type AccountLimit = {
  currentTotal: number;
  limitTotal: number;
  /** When limit is 0, drives trial vs upgrade message. */
  hasUsedTrial?: boolean;
};

export function ConnectionsList({
  accounts,
  accountLimit,
  requireAuth = false,
  canManageConnections = true,
  onAccountDisconnected,
  onAccountsChanged,
}: {
  accounts: Account[];
  accountLimit?: AccountLimit;
  requireAuth?: boolean;
  /** Teams Members can view but not connect/disconnect/refresh. */
  canManageConnections?: boolean;
  /** Optimistic UI update after disconnect — avoids full-page refresh. */
  onAccountDisconnected?: (accountId: string) => void;
  /** Background refetch after token/premium changes. */
  onAccountsChanged?: () => void;
}) {
  const [disconnectAccountId, setDisconnectAccountId] = useState<string | null>(
    null,
  );
  const [disconnectLabel, setDisconnectLabel] = useState("");
  const [disconnectPlatform, setDisconnectPlatform] = useState<string | null>(
    null,
  );
  const [refreshingAllPremium, setRefreshingAllPremium] = useState(false);
  const [premiumRefreshError, setPremiumRefreshError] = useState<string | null>(
    null,
  );
  const navigate = useNavigate();
  const invalidateQueries = useInvalidateQueries();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const reauth = searchParams.get("reauth");
    if (reauth === "success" || reauth === "warning") {
      const t = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("reauth");
        navigate(url.pathname + url.search);
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [searchParams, navigate]);

  const reauthStatus = searchParams.get("reauth");

  const handleRefreshAllPremium = async () => {
    setPremiumRefreshError(null);
    setRefreshingAllPremium(true);
    try {
      const res = await fetchApi("/api/connect/refresh-twitter-premium", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error ?? "Failed to refresh premium status";
        setPremiumRefreshError(message);
        return;
      }
      onAccountsChanged?.();
    } catch (err) {
      setPremiumRefreshError(
        err instanceof Error ? err.message : "Failed to refresh premium status",
      );
    } finally {
      setRefreshingAllPremium(false);
    }
  };

  const atLimit =
    !!accountLimit && accountLimit.currentTotal >= accountLimit.limitTotal;

  const handleLimitClick = () => {
    if (!accountLimit) return;
    const message = `You've reached your ${accountLimit.limitTotal} account limit.`;
    toast.warning(message, {
      action: {
        label: "Upgrade",
        onClick: () => {
          window.location.href = "/dashboard/billing";
        },
      },
    });
  };

  const byPlatform = PLATFORMS.map((platform) => ({
    platform,
    accounts: accounts.filter((a) => a.platform === platform.id),
  }));

  const handleOpenDisconnect = (account: Account) => {
    const platformName =
      PLATFORMS.find((p) => p.id === account.platform)?.name ??
      account.platform;
    const label =
      account.platformDisplayName && account.platformUsername
        ? `${account.platformDisplayName} (@${account.platformUsername})`
        : `@${account.platformUsername || "account"}`;
    setDisconnectLabel(`${label} (${platformName})`);
    setDisconnectPlatform(account.platform);
    setDisconnectAccountId(account.id);
  };

  return (
    <>
      <div className="space-y-3">
        {reauthStatus === "success" && (
          <p className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent dark:text-accent-light">
            Account reconnected successfully.
          </p>
        )}
        {reauthStatus === "warning" && (
          <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            You signed in with a different account; it was added as a new
            connection.
          </p>
        )}
        {premiumRefreshError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <span>{premiumRefreshError}</span>
            <button
              type="button"
              onClick={() => setPremiumRefreshError(null)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded transition-colors hover:bg-amber-500/20 dark:hover:bg-amber-500/20 touch-manipulation"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2 sm:text-3xl">
            Connected Accounts
          </h2>
          <DocsInfoIcon url={DOCS_CONNECTIONS_URL} />
        </div>
        <p className="text-sm leading-snug text-text-muted">
          {canManageConnections
            ? "Link your social accounts to publish from one place. You can connect multiple accounts per platform."
            : "View the workspace’s connected accounts. Only workspace Admins can connect or disconnect accounts."}
        </p>
        {accountLimit && accountLimit.limitTotal > 0 && (
          <p className="text-sm text-text-muted">
            <span className="font-medium text-foreground">
              {accountLimit.currentTotal}/{accountLimit.limitTotal} accounts
              connected
            </span>
            {atLimit && (
              <>
                {" "}
                -{" "}
                <Link
                  href="/dashboard/billing"
                  className="font-medium text-accent underline underline-offset-2 hover:no-underline"
                >
                  Upgrade for more
                </Link>
              </>
            )}
          </p>
        )}
        {atLimit && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            You&apos;ve reached your {accountLimit!.limitTotal} account limit.{" "}
            <Link
              href="/dashboard/billing"
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              Upgrade →
            </Link>
          </div>
        )}
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-bg-elevated p-3 shadow-sm">
          <div className="flex min-w-0 flex-col gap-1.5">
            {byPlatform.map(({ platform, accounts: platformAccounts }) => {
              const ui = PLATFORM_UI[platform.id] ?? {
                name: platform.name,
                color: "bg-gray-500",
              };
              const Icon = getPlatformIcon(platform.id);
              return (
                <div
                  key={platform.id}
                  className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-border bg-bg-muted px-2.5 py-1.5 transition-colors hover:bg-bg-muted"
                >
                  <div className="flex w-9 shrink-0 items-center sm:w-28 sm:gap-1.5">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${ui.color} text-white`}
                      title={ui.name}
                    >
                      {Icon ? (
                        <Icon className="h-3.5 w-3.5" />
                      ) : (
                        <span className="text-[10px] font-bold">
                          {platform.name[0]}
                        </span>
                      )}
                    </div>
                    <span
                      className="hidden truncate text-sm font-semibold text-text sm:inline"
                      title={ui.name}
                    >
                      {ui.name}
                    </span>
                  </div>
                  {canManageConnections ? (
                    <div className="w-9 shrink-0 sm:w-20">
                      <ConnectPlatformButton
                        platform={platform}
                        size="sm"
                        className="w-full"
                        disabled={atLimit}
                        onDisabledClick={atLimit ? handleLimitClick : undefined}
                        requireAuth={requireAuth}
                        returnTo="/dashboard/connections"
                      />
                    </div>
                  ) : (
                    <div className="w-9 shrink-0 sm:w-20" aria-hidden />
                  )}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">
                    {platformAccounts.map((account) => {
                      const isInactive = account.isActive === false;
                      const isExpired = account.tokenStatus === "expired";
                      const isExpiringSoon =
                        account.tokenStatus === "expiring_soon";
                      if (isInactive) {
                        return (
                          <div
                            key={account.id}
                            className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 opacity-75"
                          >
                            <AccountAvatar
                              accountId={account.id}
                              profileImageUrl={account.profileImageUrl}
                              username={account.platformUsername}
                              platform={account.platform}
                              isTwitterPremium={false}
                              size="sm"
                              className="shrink-0"
                            />
                            <div className="min-w-0 flex flex-col justify-center">
                              <span className="truncate text-xs font-medium text-muted-foreground max-w-[120px] sm:max-w-[160px]">
                                {connectionHandleLabel(
                                  account.platform,
                                  account.platformUsername,
                                )}
                              </span>
                            </div>
                            {canManageConnections && (
                              <>
                                <Link
                                  href="/dashboard/billing"
                                  className="shrink-0 inline-flex items-center gap-0.5 rounded border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200 transition-colors hover:bg-amber-500/20"
                                  title="Upgrade to use this account"
                                >
                                  Upgrade to use this account
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDisconnect(account)}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-destructive transition-colors hover:bg-destructive/10 touch-manipulation active:bg-destructive/20"
                                  title="Remove account"
                                  aria-label={`Disconnect ${account.platformUsername || account.platform}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={account.id}
                          className={`flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-0.5 ${
                            isExpired
                              ? "border-destructive/50 bg-destructive/10"
                              : "border-border bg-bg-elevated"
                          }`}
                        >
                          <AccountAvatar
                            accountId={account.id}
                            profileImageUrl={account.profileImageUrl}
                            username={account.platformUsername}
                            platform={account.platform}
                            isTwitterPremium={false}
                            size="sm"
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex flex-col justify-center">
                            {account.platformDisplayName ? (
                              <>
                                <span
                                  className="flex items-center gap-1 truncate text-xs font-medium text-text"
                                  title={account.platformDisplayName}
                                >
                                  {account.platformDisplayName}
                                  {account.platform === "twitter_x" &&
                                    account.isTwitterPremium && (
                                      <img
                                        src="/icons/twitter-premium.svg"
                                        alt="X Premium"
                                        className="h-3 w-3"
                                      />
                                    )}
                                </span>
                                {account.platformUsername ? (
                                  <span
                                    className="truncate text-[10px] text-text-muted"
                                    title={account.platformUsername}
                                  >
                                    @{account.platformUsername}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span
                                className="flex items-center gap-1 truncate text-xs font-medium text-text max-w-[120px] sm:max-w-[160px]"
                                title={
                                  account.platformUsername?.trim()
                                    ? connectionHandleLabel(
                                        account.platform,
                                        account.platformUsername,
                                      )
                                    : undefined
                                }
                              >
                                {connectionHandleLabel(
                                  account.platform,
                                  account.platformUsername,
                                )}
                                {account.platform === "twitter_x" &&
                                  account.isTwitterPremium && (
                                    <img
                                      src="/icons/twitter-premium.svg"
                                      alt="X Premium"
                                      className="h-3 w-3"
                                    />
                                  )}
                              </span>
                            )}
                          </div>
                          {canManageConnections &&
                            !isExpired &&
                            account.platform !== "bluesky" && (
                            <Link
                              href={apiUrl(
                                `/api/connect/${account.platform}/reauth?accountId=${encodeURIComponent(account.id)}`,
                              )}
                              className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-bg-muted hover:text-text cursor-auto"
                              title="Refresh account tokens"
                            >
                              <RefreshCw className="h-3 w-3" strokeWidth={2} />
                            </Link>
                          )}
                          {canManageConnections && isExpired && (
                            <Link
                              href={apiUrl(`/api/connect/${account.platform}`)}
                              className="shrink-0 inline-flex items-center gap-1 rounded border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/20"
                              title="Token expired - Reconnect"
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="hidden sm:inline">
                                Token expired -{" "}
                              </span>
                              Reconnect
                            </Link>
                          )}
                          {isExpiringSoon && account.expiresInDays != null && (
                            <span
                              className="shrink-0 inline-flex items-center gap-0.5 rounded bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200"
                              title="Token expires soon - reconnect to refresh"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Expires in {account.expiresInDays} day
                              {account.expiresInDays !== 1 ? "s" : ""}
                            </span>
                          )}
                          {canManageConnections && (
                            <button
                              type="button"
                              onClick={() => handleOpenDisconnect(account)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-destructive transition-colors hover:bg-destructive/10 touch-manipulation active:bg-destructive/20"
                              title="Remove account"
                              aria-label={`Disconnect ${account.platformDisplayName && account.platformUsername ? `${account.platformDisplayName} (@${account.platformUsername})` : account.platformUsername || account.platform}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Twitter Premium status refresh */}
        {accounts.some((a) => a.platform === "twitter_x") && (
          <div className="rounded-2xl border border-border bg-bg-elevated p-3">
            <p className="mb-2 text-xs font-medium text-text-muted">
              Token management
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshAllPremium}
                disabled={refreshingAllPremium}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-bg-muted disabled:opacity-60",
                )}
                title="Recheck X Premium status for all connected Twitter accounts"
              >
                {refreshingAllPremium ? (
                  <span className="h-4 w-4 text-amber-500 flex items-center justify-center">
                    <IconLoader2 className="animate-spin h-4 w-4" />
                  </span>
                ) : (
                  <IconCrown
                    className={cn("h-4 w-4 text-amber-500")}
                    strokeWidth={1.5}
                  />
                )}
                <span className={refreshingAllPremium ? "animate-pulse" : ""}>
                  Refresh Twitter Premium Status
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
      <DisconnectAccountModal
        isOpen={!!disconnectAccountId}
        onClose={() => setDisconnectAccountId(null)}
        accountId={disconnectAccountId}
        accountLabel={disconnectLabel}
        platform={disconnectPlatform ?? undefined}
        onDisconnected={onAccountDisconnected}
      />
    </>
  );
}
