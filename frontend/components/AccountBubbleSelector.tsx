"use client";

import { useState, useCallback } from "react";
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
  /** Compact layout: 44px avatar, 8px gap, smaller text */
  compact?: boolean;
  /** When true, do not render the Select all button (parent renders it inline) */
  hideSelectAll?: boolean;
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
  compact = false,
  hideSelectAll = false,
}: AccountBubbleSelectorProps) {
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());

  const markImageFailed = useCallback((accountId: string) => {
    setFailedImageIds((prev) => new Set(prev).add(accountId));
  }, []);

  if (accounts.length === 0) {
    return (
      <p className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
        Connect at least one account from the dashboard to post.
      </p>
    );
  }

  const allSelected = selectedIds.size === accounts.length;
  const avatarSize = compact ? "h-11 w-11" : "h-14 w-14";
  const badgeSize = compact ? "h-3.5 w-3.5" : "h-3.5 w-3.5";
  const badgeInner = compact ? "h-2 w-2" : "h-2.5 w-2.5";
  const bubbleGap = compact ? "gap-2" : "gap-3";
  const usernameMaxChars = compact ? 8 : 10;
  const usernameClass = compact
    ? "mt-1 max-w-[4.5rem] truncate text-center text-[10px] text-gray-900"
    : "mt-1.5 max-w-[72px] truncate text-center text-xs text-gray-900";
  const platformClass = compact ? "text-[9px] text-gray-500" : "text-[10px] text-gray-500";
  const initialClass =
    "flex h-full w-full items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-600 " +
    (compact ? "text-sm" : "text-lg");

  return (
    <div className={cn("flex flex-wrap items-center", bubbleGap)}>
      {!hideSelectAll && (
        <button
          type="button"
          onClick={selectAll}
          className={cn(
            "shrink-0 rounded-full border border-gray-200 bg-white font-medium text-gray-600 transition-colors hover:bg-gray-50",
            compact ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-xs",
          )}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      )}
      {accounts.map((acc) => {
        const selected = selectedIds.has(acc.id);

        return (
          <div key={acc.id} className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => onToggleAccount(acc.id)}
              className={cn(
                "relative flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150",
                avatarSize,
                selected
                  ? "border-emerald-500 opacity-100 grayscale-0"
                  : "border-transparent opacity-60 grayscale hover:opacity-80",
              )}
              aria-pressed={selected}
            >
              {acc.profileImageUrl?.trim() && !failedImageIds.has(acc.id) ? (
                <img
                  src={acc.profileImageUrl}
                  alt={acc.platformUsername || acc.platform}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  className="h-full w-full rounded-full object-cover"
                  onError={() => markImageFailed(acc.id)}
                />
              ) : (
                <span className={initialClass}>
                  {(acc.platformUsername || acc.platform)
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
              <span className={cn("absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 border-white bg-white", badgeSize)}>
                <span className={cn("flex items-center justify-center [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:w-auto [&_svg]:shrink-0", badgeInner)}>
                  <PlatformIcon platform={acc.platform} size={compact ? 8 : 10} />
                </span>
              </span>
              {selected && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </button>
            <span className={usernameClass}>
              {truncate(acc.platformUsername || platformName(acc.platform), usernameMaxChars)}
            </span>
            <span className={platformClass}>
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
          </div>
        );
      })}
    </div>
  );
}
