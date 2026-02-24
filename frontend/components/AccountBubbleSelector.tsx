"use client";

import { PlatformIcon } from "@/components/PlatformIcon";
import { cn } from "@/lib/utils";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive?: boolean | null;
};

type AccountBubbleSelectorProps = {
  accounts: Account[];
  selectedIds: Set<string>;
  onToggleAccount: (id: string) => void;
  selectAll: () => void;
  platformName: (platformId: string) => string;
  /** For TikTok: show settings control when provided */
  onOpenTikTokSettings?: (accountId: string) => void;
  tiktokConfiguredIds?: Set<string>;
};

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

export function AccountBubbleSelector({
  accounts,
  selectedIds,
  onToggleAccount,
  selectAll,
  platformName,
  onOpenTikTokSettings,
  tiktokConfiguredIds,
}: AccountBubbleSelectorProps) {
  if (accounts.length === 0) {
    return (
      <p className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
        Connect at least one account from the dashboard to post.
      </p>
    );
  }

  const allSelected = selectedIds.size === accounts.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={selectAll}
          className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        {accounts.map((acc) => {
          const selected = selectedIds.has(acc.id);
          const isTiktok = acc.platform === "tiktok";
          const showTiktokSettings = isTiktok && onOpenTikTokSettings;

          return (
            <div key={acc.id} className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onToggleAccount(acc.id)}
                className={cn(
                  "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150",
                  selected
                    ? "border-emerald-500 opacity-100 grayscale-0"
                    : "border-transparent opacity-60 grayscale hover:opacity-80",
                )}
                aria-pressed={selected}
              >
                {acc.profileImageUrl?.trim() ? (
                  <img
                    src={acc.profileImageUrl}
                    alt={acc.platformUsername || acc.platform}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-600">
                    {(acc.platformUsername || acc.platform).charAt(0).toUpperCase()}
                  </span>
                )}
                {/* Platform icon bottom-right — 14px badge; icon scales to fit, aspect ratio preserved */}
                <span className="absolute bottom-0 right-0 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-white">
                  <span className="flex h-2.5 w-2.5 items-center justify-center [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:w-auto [&_svg]:shrink-0">
                    <PlatformIcon platform={acc.platform} size={10} />
                  </span>
                </span>
                {/* Selected checkmark top-right */}
                {selected && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </button>
              <span className="mt-1.5 max-w-[72px] truncate text-center text-xs text-gray-900">
                {truncate(acc.platformUsername || platformName(acc.platform), 10)}
              </span>
              <span className="text-[10px] text-gray-500">
                {platformName(acc.platform)}
              </span>
              {acc.platform === "medium" && (
                <span
                  className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800"
                  title="Editing and deleting not supported"
                >
                  Publish only
                </span>
              )}
              {showTiktokSettings && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenTikTokSettings(acc.id);
                  }}
                  className="mt-0.5 text-[10px] font-medium text-emerald-600 hover:text-emerald-700"
                  title={tiktokConfiguredIds?.has(acc.id) ? "TikTok settings (configured)" : "TikTok settings"}
                >
                  ⚙ Settings
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
