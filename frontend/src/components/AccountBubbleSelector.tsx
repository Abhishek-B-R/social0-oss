
import Link from "@/components/AppLink";
import { PlatformIcon } from "@/components/PlatformIcon";
import { AccountAvatar } from "@/components/AccountAvatar";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive?: boolean | null;
  isTwitterPremium?: boolean;
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
  /** Platform IDs this form supports. Shown in empty state when no accounts match. */
  supportedPlatforms?: string[];
  /** Account IDs that are disabled (e.g. video exceeds platform limit). Shown with amber overlay and tooltip. */
  disabledAccountIds?: Set<string>;
  /** Tooltip/reason per disabled account id. Falls back to disabledAccountDefaultReason. */
  disabledReasons?: Record<string, string>;
  /** Default tooltip when an account is in disabledAccountIds and no disabledReasons[id]. */
  disabledAccountDefaultReason?: string;
  /** Account IDs that show a soft warning (e.g. Instagram 3–20 min). Selectable; yellow badge and tooltip. */
  warningAccountIds?: Set<string>;
  /** Tooltip per warning account id. */
  warningReasons?: Record<string, string>;
  /** Short label under bubble when account is in warningAccountIds (e.g. "May limit reach"). */
  warningLabel?: string;
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
  supportedPlatforms,
  disabledAccountIds,
  disabledReasons,
  disabledAccountDefaultReason = "This account cannot be used for this post",
  warningAccountIds,
  warningReasons,
  warningLabel = "May limit reach",
}: AccountBubbleSelectorProps) {
  if (accounts.length === 0) {
    const platformNames =
      supportedPlatforms?.map((id) => platformName(id)).filter(Boolean) ?? [];
    const platformList =
      platformNames.length > 0 ? platformNames.join(", ") : null;
    return (
      <p className="rounded-xl border border-amber-100 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 p-4 text-sm text-amber-700 dark:text-amber-200">
        {platformList ? (
          <>
            Connect at least one account from the{" "}
            <Link
              href="/dashboard/connections"
              className="font-medium underline hover:no-underline"
            >
              connections
            </Link>{" "}
            page that supports this form to post.
            <br />
            Supported platforms: {platformList}.
          </>
        ) : (
          <>
            Connect at least one account from the{" "}
            <Link
              href="/dashboard/connections"
              className="font-medium underline hover:no-underline"
            >
              connections
            </Link>{" "}
            page that supports this form to post.
          </>
        )}
      </p>
    );
  }

  const selectableAccounts = accounts.filter(
    (a) => !a.tokenExpired && !disabledAccountIds?.has(a.id),
  );
  const hasWarning = (id: string) => !!warningAccountIds?.has(id);
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
        const disabledByLimit = !!disabledAccountIds?.has(acc.id);
        const disabled = expired || disabledByLimit;
        const softWarn = hasWarning(acc.id);
        const disabledTitle = expired
          ? "Token expired - reconnect in Connections page"
          : disabledByLimit
            ? (disabledReasons?.[acc.id] ?? disabledAccountDefaultReason)
            : undefined;
        const warningTitle = softWarn
          ? (warningReasons?.[acc.id] ?? warningLabel)
          : undefined;

        return (
          <div key={acc.id} className="flex flex-col items-center">
            <div
              className={cn(
                "relative flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150",
                avatarSize,
                expired
                  ? "cursor-not-allowed border-red-300 opacity-50 grayscale"
                  : disabledByLimit
                    ? "cursor-not-allowed border-amber-400 opacity-60 grayscale"
                    : selected
                      ? "border-emerald-500 opacity-100 grayscale-0"
                      : softWarn
                        ? // Warning-only: keep muted like unselected so it doesn’t look “selected”
                          "border-amber-400/80 opacity-60 grayscale hover:opacity-80"
                        : "border-transparent opacity-60 grayscale hover:opacity-80",
              )}
              title={disabledTitle ?? warningTitle}
            >
              <button
                type="button"
                onClick={() => !disabled && onToggleAccount(acc.id)}
                disabled={disabled}
                className={cn(
                  "relative h-full w-full  rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:pointer-events-none",
                  disabled && "cursor-not-allowed",
                )}
                aria-pressed={selected}
                aria-disabled={disabled}
              >
                <div className="h-full w-full overflow-hidden rounded-full">
                  <AccountAvatar
                    accountId={acc.id}
                    profileImageUrl={acc.profileImageUrl}
                    username={acc.platformUsername}
                    platform={acc.platform}
                    isTwitterPremium={acc.isTwitterPremium ?? false}
                    fill
                  />
                </div>
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
                {selected && !disabled && (
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
                {disabledByLimit && !expired && (
                  <span
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-amber-500/50"
                    aria-hidden
                  >
                    <AlertTriangle className="h-6 w-6 text-amber-950 drop-shadow-md" />
                  </span>
                )}
                {softWarn && !disabled && (
                  <span
                    className="absolute -top-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-950"
                    aria-hidden
                    title={warningTitle}
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
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
                title="Token expired - reconnect in Connections page"
              >
                Token expired
              </span>
            )}
            {disabledByLimit && !expired && (
              <span
                className="mt-0.5 inline-block rounded bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:text-amber-200"
                title={disabledTitle}
              >
                Video too long
              </span>
            )}
            {softWarn && !disabled && (
              <span
                className="mt-0.5 inline-block rounded bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:text-amber-200"
                title={warningTitle}
              >
                {warningLabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
