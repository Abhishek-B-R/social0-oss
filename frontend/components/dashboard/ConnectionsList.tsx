"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPlatformIcon } from "@/lib/platform-icons";
import { PLATFORMS } from "@/lib/platforms";
import { AccountAvatar } from "@/components/AccountAvatar";
import { ConnectPlatformButton } from "./ConnectPlatformButton";
import { DisconnectAccountModal } from "./DisconnectAccountModal";
import { AlertTriangle, X } from "lucide-react";
import { IconRefresh, IconCrown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

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

type AccountLimit = { currentTotal: number; limitTotal: number };

export function ConnectionsList({
  accounts,
  accountLimit,
}: {
  accounts: Account[];
  accountLimit?: AccountLimit;
}) {
  const [disconnectAccountId, setDisconnectAccountId] = useState<string | null>(
    null,
  );
  const [disconnectLabel, setDisconnectLabel] = useState("");
  const [isRefreshingPremium, setIsRefreshingPremium] = useState<string | null>(
    null,
  );
  const router = useRouter();

  const handleRefreshPremium = async (accountId: string) => {
    setIsRefreshingPremium(accountId);
    try {
      const res = await fetch("/api/accounts/refresh-premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) throw new Error("Failed");
      router.refresh();
    } finally {
      setIsRefreshingPremium(null);
    }
  };

  const atLimit =
    !!accountLimit && accountLimit.currentTotal >= accountLimit.limitTotal;
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
    setDisconnectAccountId(account.id);
  };

  return (
    <>
      <div className="space-y-3">
        <h2 className="text-2xl font-extrabold text-text">
          Connected Accounts
        </h2>
        <p className="text-sm text-text-muted">
          Link your social accounts to publish from one place. You can connect
          multiple accounts per platform.
        </p>
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
                  <div className="w-9 shrink-0 sm:w-20">
                    <ConnectPlatformButton
                      platform={platform}
                      size="sm"
                      className="w-full"
                      disabled={atLimit}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">
                    {platformAccounts.map((account) => {
                      const isExpired = account.tokenStatus === "expired";
                      const isExpiringSoon =
                        account.tokenStatus === "expiring_soon";
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
                            profileImageUrl={account.profileImageUrl}
                            username={account.platformUsername}
                            platform={account.platform}
                            isTwitterPremium={account.isTwitterPremium ?? false}
                            size="sm"
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex flex-col justify-center">
                            {account.platformDisplayName &&
                            account.platformUsername ? (
                              <>
                                <span
                                  className="truncate text-xs font-medium text-text"
                                  title={account.platformDisplayName}
                                >
                                  {account.platformDisplayName}
                                </span>
                                <span
                                  className="truncate text-[10px] text-text-muted"
                                  title={account.platformUsername}
                                >
                                  @{account.platformUsername}
                                </span>
                              </>
                            ) : (
                              <span
                                className="truncate text-xs font-medium text-text max-w-[120px] sm:max-w-[160px]"
                                title={
                                  account.platformUsername
                                    ? `@${account.platformUsername}`
                                    : undefined
                                }
                              >
                                @{account.platformUsername || "user"}
                              </span>
                            )}
                          </div>
                          {account.platform === "twitter_x" && (
                            <div className="flex shrink-0 items-center gap-1">
                              {account.isTwitterPremium && (
                                <span
                                  className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400"
                                  title="X Premium"
                                >
                                  <IconCrown
                                    className="h-3 w-3"
                                    strokeWidth={1.5}
                                  />
                                  <span className="hidden sm:inline">
                                    Premium
                                  </span>
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  handleRefreshPremium(account.id)
                                }
                                disabled={
                                  isRefreshingPremium === account.id
                                }
                                className={cn(
                                  "flex items-center gap-0.5 rounded p-0.5 text-[10px] text-text-muted transition-colors hover:text-text hover:bg-bg-muted disabled:opacity-50",
                                  isRefreshingPremium === account.id &&
                                    "cursor-wait",
                                )}
                                title="Refresh Premium status"
                              >
                                <IconRefresh
                                  className={cn(
                                    "h-3 w-3",
                                    isRefreshingPremium === account.id &&
                                      "animate-spin",
                                  )}
                                  strokeWidth={1.5}
                                />
                              </button>
                            </div>
                          )}
                          {isExpired && (
                            <Link
                              href={`/api/connect/${account.platform}`}
                              className="shrink-0 inline-flex items-center gap-1 rounded border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/20"
                              title="Token expired — Reconnect"
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="hidden sm:inline">
                                Token expired —{" "}
                              </span>
                              Reconnect
                            </Link>
                          )}
                          {isExpiringSoon && account.expiresInDays != null && (
                            <span
                              className="shrink-0 inline-flex items-center gap-0.5 rounded bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200"
                              title="Token expires soon — reconnect to refresh"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Expires in {account.expiresInDays} day
                              {account.expiresInDays !== 1 ? "s" : ""}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenDisconnect(account)}
                            className="shrink-0 rounded p-0.5 text-destructive transition-colors hover:bg-destructive/10"
                            aria-label={`Disconnect ${account.platformDisplayName && account.platformUsername ? `${account.platformDisplayName} (@${account.platformUsername})` : account.platformUsername || account.platform}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <DisconnectAccountModal
        isOpen={!!disconnectAccountId}
        onClose={() => setDisconnectAccountId(null)}
        accountId={disconnectAccountId}
        accountLabel={disconnectLabel}
      />
    </>
  );
}
