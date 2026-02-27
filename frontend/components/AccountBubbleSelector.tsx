"use client";

import { useState, useCallback } from "react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive?: boolean | null;
  /** When true, bubble is disabled with red overlay and tooltip to reconnect on Connections page */
  tokenExpired?: boolean;
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
      <p className="rounded-xl border border-amber-100 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 p-4 text-sm text-amber-700 dark:text-amber-200">
        Connect at least one account from the dashboard to post.
      </p>
    );
  }

  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const allSelected =
    selectableAccounts.length > 0 &&
    selectableAccounts.every((a) => selectedIds.has(a.id));
  const avatarSize = compact ? "h-12 w-12" : "h-12 w-12";
  const badgeSize = compact ? "h-4 w-4" : "h-4 w-4";
  const badgeInner = compact ? "h-2.5 w-2.5" : "h-2.5 w-2.5";
  const bubbleGap = compact ? "gap-4" : "gap-4";
  const usernameMaxChars = compact ? 10 : 12;
  const usernameClass = compact
    ? "mt-1.5 max-w-[5rem] truncate text-center text-xs font-medium text-text"
    : "mt-1.5 max-w-[80px] truncate text-center text-xs font-medium text-text";
  const platformClass = compact
    ? "text-xs text-text-muted"
    : "text-xs text-text-muted";
  const initialClass =
    "flex h-full w-full items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground " +
    (compact ? "text-sm" : "text-lg");

  return (
    <div className={cn("flex flex-wrap items-center", bubbleGap)}>
      {!hideSelectAll && (
        <button
          type="button"
          onClick={selectAll}
          className={cn(
            "shrink-0 rounded-full border border-border bg-card font-medium text-muted-foreground transition-colors hover:bg-muted",
            compact ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-xs",
          )}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      )}
      {accounts.map((acc) => {
        const selected = selectedIds.has(acc.id);
        const expired = !!acc.tokenExpired;

        return (
          <div key={acc.id} className="flex flex-col items-center">
            <div
              className={cn(
                "relative flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150",
                avatarSize,
                expired
                  ? "cursor-not-allowed border-red-300 opacity-50 grayscale"
                  : selected
                    ? "border-emerald-500 opacity-100 grayscale-0"
                    : "border-transparent opacity-60 grayscale hover:opacity-80",
              )}
              title={
                expired
                  ? "Token expired — reconnect in Connections page"
                  : undefined
              }
            >
              <button
                type="button"
                onClick={() => !expired && onToggleAccount(acc.id)}
                disabled={expired}
                className={cn(
                  "relative h-full w-full rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:pointer-events-none",
                  expired && "cursor-not-allowed",
                )}
                aria-pressed={selected}
                aria-disabled={expired}
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
                <span
                  className={cn(
                    "absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 border-card bg-card",
                    badgeSize,
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:w-auto [&_svg]:shrink-0",
                      badgeInner,
                    )}
                  >
                    <PlatformIcon
                      platform={acc.platform}
                      size={compact ? 10 : 12}
                    />
                  </span>
                </span>
                {selected && !expired && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <svg
                      className="h-2.5 w-2.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </span>
                )}
                {expired && (
                  <span
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-red-900/40"
                    aria-hidden
                  >
                    <AlertTriangle className="h-6 w-6 text-white drop-shadow-md" />
                  </span>
                )}
              </button>
            </div>
            <span className={usernameClass}>
              {truncate(
                acc.platformUsername || platformName(acc.platform),
                usernameMaxChars,
              )}
            </span>
            <span className={platformClass}>{platformName(acc.platform)}</span>
            {expired && (
              <span
                className="mt-0.5 inline-block rounded bg-red-100 dark:bg-red-950/40 px-1.5 py-0.5 text-[9px] font-medium text-red-700 dark:text-red-200"
                title="Token expired — reconnect in Connections page"
              >
                Token expired
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
