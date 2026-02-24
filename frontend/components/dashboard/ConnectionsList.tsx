"use client";

import { useState } from "react";
import { getPlatformIcon } from "@/lib/platform-icons";
import { PLATFORMS } from "@/lib/platforms";
import { AccountAvatar } from "@/components/AccountAvatar";
import { ConnectPlatformButton } from "./ConnectPlatformButton";
import { DisconnectAccountModal } from "./DisconnectAccountModal";
import { X } from "lucide-react";

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
  devto: { name: "Dev.to", color: "bg-[#0A0A0A]" },
  hashnode: { name: "Hashnode", color: "bg-[#2962FF]" },
  medium: { name: "Medium", color: "bg-[#000000]" },
};

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

export function ConnectionsList({ accounts }: { accounts: Account[] }) {
  const [disconnectAccountId, setDisconnectAccountId] = useState<string | null>(
    null,
  );
  const [disconnectLabel, setDisconnectLabel] = useState("");

  const byPlatform = PLATFORMS.map((platform) => ({
    platform,
    accounts: accounts.filter((a) => a.platform === platform.id),
  }));

  const handleOpenDisconnect = (account: Account) => {
    const platformName =
      PLATFORMS.find((p) => p.id === account.platform)?.name ??
      account.platform;
    setDisconnectLabel(
      `@${account.platformUsername || "account"} (${platformName})`,
    );
    setDisconnectAccountId(account.id);
  };

  return (
    <>
      <div className="space-y-3">
        <h2 className="text-2xl font-extrabold text-gray-900">
          Connected Accounts
        </h2>
        <p className="text-sm text-gray-500">
          Link your social accounts to publish from one place. You can connect
          multiple accounts per platform.
        </p>
        <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-1.5">
            {byPlatform.map(({ platform, accounts: platformAccounts }) => {
              const ui = PLATFORM_UI[platform.id] ?? {
                name: platform.name,
                color: "bg-gray-500",
              };
              const Icon = getPlatformIcon(platform.id);
              return (
                <div
                  key={platform.id}
                  className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-gray-100 bg-gray-50/50 px-2.5 py-1.5 transition-colors hover:border-gray-200 hover:bg-gray-50"
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
                    <span className="hidden truncate text-sm font-semibold text-gray-900 sm:inline" title={ui.name}>
                      {ui.name}
                    </span>
                  </div>
                  <div className="w-9 shrink-0 sm:w-20">
                    <ConnectPlatformButton
                      platform={platform}
                      size="sm"
                      className="w-full"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">
                    {platformAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex min-w-0 shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-0.5"
                      >
                        <AccountAvatar
                          profileImageUrl={account.profileImageUrl}
                          username={account.platformUsername}
                          platform={account.platform}
                          size="sm"
                        />
                        <span className="max-w-[100px] truncate text-xs font-medium text-gray-900">
                          @{account.platformUsername || "user"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenDisconnect(account)}
                          className="shrink-0 rounded p-0.5 text-red-600 hover:bg-red-50 transition-colors"
                          aria-label={`Disconnect ${account.platformUsername || account.platform}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
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
