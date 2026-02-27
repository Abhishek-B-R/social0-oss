"use client";

import { ScheduleDateTimePicker } from "@/components/ui/ScheduleDateTimePicker";
import { AccountBubbleSelector } from "@/components/AccountBubbleSelector";
import { PLATFORMS } from "@/lib/platforms";
import type { PublishMode } from "@/app/actions/posts";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  tokenExpired?: boolean;
};

type PostFormOptionsProps = {
  accounts: Account[];
  selectedIds: Set<string>;
  onToggleAccount: (id: string) => void;
  selectAll: () => void;
  mode: PublishMode;
  setMode: (m: PublishMode) => void;
  scheduledAt: Date | null;
  setScheduledAt: (d: Date | null) => void;
  error: string | null;
  loading: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
  /** When true, show times in 24h format across schedule/time displays */
  use24HourTimeFormat?: boolean;
  /** Rendered just above "When do you want to publish?" (e.g. Auto-Repost & Auto-Plug) */
  betweenScheduleAndActions?: React.ReactNode;
  /** When true, only render "Post to" + account selector and betweenScheduleAndActions (schedule/actions move to sidebar) */
  hideScheduleAndActions?: boolean;
  /** Optional slot (e.g. search input) rendered between the label and AccountBubbleSelector */
  searchSlot?: React.ReactNode;
  /** When true, show "Remember" checkbox; when checked, parent should persist selection to localStorage */
  remember?: boolean;
  onRememberChange?: (checked: boolean) => void;
};

export function PostFormOptions({
  accounts,
  selectedIds,
  onToggleAccount,
  selectAll,
  mode,
  setMode,
  scheduledAt,
  setScheduledAt,
  error,
  loading,
  submitLabel,
  submitDisabled = false,
  use24HourTimeFormat = false,
  betweenScheduleAndActions,
  hideScheduleAndActions = false,
  searchSlot,
  remember = false,
  onRememberChange,
}: PostFormOptionsProps) {
  const platformName = (platformId: string) =>
    PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;

  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const allSelected =
    selectableAccounts.length > 0 &&
    selectableAccounts.every((a) => selectedIds.has(a.id));

  return (
    <>
      <section className="border-b border-border pt-5 pb-5 -mt-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {searchSlot && (
            <div className="min-w-0 w-full sm:max-w-[340px] [&_input]:h-9">
              {searchSlot}
            </div>
          )}
          {onRememberChange != null && (
            <label className="sm:ml-auto flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => onRememberChange(e.target.checked)}
                className="rounded border-input bg-bg text-accent focus:ring-accent"
              />
              <span className="text-sm text-text">Remember</span>
            </label>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={selectAll}
            className="shrink-0 rounded-full border border-border bg-bg-elevated px-2 py-0.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <AccountBubbleSelector
            accounts={accounts}
            selectedIds={selectedIds}
            onToggleAccount={onToggleAccount}
            selectAll={selectAll}
            platformName={platformName}
            compact
            hideSelectAll
          />
        </div>
      </section>

      {betweenScheduleAndActions}

      {!hideScheduleAndActions && (
        <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
          <p className="block text-sm font-semibold text-text mb-4">
            When do you want to publish?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-bg-muted/30 cursor-pointer hover:bg-bg-muted/50 has-checked:border-accent has-checked:bg-accent/10 transition-colors">
              <input
                type="radio"
                name="publishMode"
                checked={mode === "now"}
                onChange={() => setMode("now")}
                className="mt-0.5 size-4 border-input bg-bg text-accent focus:ring-accent"
              />
              <div>
                <span className="block font-medium text-text">Post now</span>
                <span className="block text-sm text-text-muted mt-0.5">
                  Publish right away
                </span>
              </div>
            </label>
            <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-bg-muted/30 cursor-pointer hover:bg-bg-muted/50 has-checked:border-accent has-checked:bg-accent/10 transition-colors">
              <input
                type="radio"
                name="publishMode"
                checked={mode === "scheduled"}
                onChange={() => setMode("scheduled")}
                className="mt-0.5 size-4 border-input bg-bg text-accent focus:ring-accent"
              />
              <div>
                <span className="block font-medium text-text">
                  Schedule for later
                </span>
                <span className="block text-sm text-text-muted mt-0.5">
                  Pick date & time
                </span>
              </div>
            </label>
          </div>
          {mode === "scheduled" && (
            <div className="mt-4">
              <ScheduleDateTimePicker
                value={scheduledAt}
                onChange={setScheduledAt}
                placeholder="Pick date & time"
                use24HourTimeFormat={use24HourTimeFormat}
              />
            </div>
          )}
          <p className="mt-4 text-sm text-text-muted">
            {mode === "draft" ? (
              <span className="text-accent font-medium">
                Saving as draft — you can publish later from Posts.
              </span>
            ) : (
              <>
                Or{" "}
                <button
                  type="button"
                  onClick={() => setMode("draft")}
                  className="font-medium text-accent hover:text-accent-hover"
                >
                  save as draft
                </button>{" "}
                to finish later.
              </>
            )}
          </p>
        </div>
      )}

      {!hideScheduleAndActions && error && (
        <div className="rounded-xl bg-destructive/10 text-destructive px-4 py-3 text-sm font-medium border border-destructive/30">
          {error}
        </div>
      )}

      {!hideScheduleAndActions && (
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || submitDisabled}
            className="rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 shadow-lg transition-colors"
          >
            {loading ? "Saving..." : submitLabel}
          </button>
        </div>
      )}
    </>
  );
}
