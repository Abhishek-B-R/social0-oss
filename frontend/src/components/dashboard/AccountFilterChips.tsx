import type { ReactNode } from "react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { AccountPlatformMark } from "@/components/PlatformIcon";
import { SquaresFour } from "@/icons/phosphor";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export type FilterAccount = {
  id: string;
  platform: string;
  username: string | null;
  profileImageUrl: string | null;
  missingScopes?: string[];
};

function handleLabel(username: string | null | undefined): string {
  if (!username) return "account";
  return username.startsWith("@") ? username.slice(1) : username;
}

export function AccountFilterChips({
  accounts,
  selectedId,
  onSelect,
  loading,
  emptyLabel,
}: {
  accounts: FilterAccount[];
  /** `undefined` = not yet resolved (nothing selected); `null` = All */
  selectedId: string | null | undefined;
  onSelect: (id: string | null) => void;
  loading?: boolean;
  emptyLabel: string;
}) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-3" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex w-16 flex-col items-center gap-1.5">
            <div className="h-12 w-12 animate-pulse rounded-full bg-bg-muted" />
            <div className="h-2.5 w-12 animate-pulse rounded bg-bg-muted" />
          </div>
        ))}
      </div>
    );
  }
  if (!accounts.length) {
    return <p className="text-sm text-text-muted">{emptyLabel}</p>;
  }
  const allSelected = selectedId === null;
  return (
    <div className="flex flex-wrap items-start gap-3">
      <ChipButton selected={allSelected} onClick={() => onSelect(null)}>
        <span
          className={cn(
            "relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-[transform,border-color,background-color,color,opacity] duration-150 ease-out",
            allSelected
              ? "border-accent bg-accent/15 text-accent"
              : "border-transparent bg-bg-muted text-text-muted opacity-70 hover:opacity-100",
          )}
        >
          <SquaresFour size={22} weight={allSelected ? "fill" : "regular"} />
          {allSelected ? <SelectedCheck /> : null}
        </span>
        <ChipLabel selected={allSelected}>All</ChipLabel>
      </ChipButton>
      {accounts.map((a) => {
        const selected = selectedId === a.id;
        const needsReconnect = Boolean(a.missingScopes?.length);
        return (
          <ChipButton
            key={a.id}
            selected={selected}
            onClick={() => onSelect(a.id)}
            title={
              needsReconnect
                ? `Reconnect ${PLATFORM_LABEL[a.platform] ?? a.platform}`
                : `@${handleLabel(a.username)} · ${PLATFORM_LABEL[a.platform] ?? a.platform}`
            }
          >
            <span
              className={cn(
                "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-[transform,border-color,opacity] duration-150 ease-out",
                selected
                  ? "border-accent opacity-100"
                  : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              <span className="h-full w-full overflow-hidden rounded-full">
                <AccountAvatar
                  profileImageUrl={a.profileImageUrl}
                  username={a.username}
                  platform={a.platform}
                  fill
                />
              </span>
              <AccountPlatformMark platform={a.platform} />
              {selected ? <SelectedCheck /> : null}
              {needsReconnect ? (
                <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-amber-500" />
              ) : null}
            </span>
            <ChipLabel selected={selected}>{handleLabel(a.username)}</ChipLabel>
          </ChipButton>
        );
      })}
    </div>
  );
}

function ChipButton({
  selected,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className="flex w-16 flex-col items-center gap-1.5 rounded-2xl transition-transform duration-150 ease-out active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

function ChipLabel({
  selected,
  children,
}: {
  selected: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "w-full truncate text-center text-[11px] font-semibold",
        selected ? "text-accent" : "text-text-muted",
      )}
    >
      {children}
    </span>
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
