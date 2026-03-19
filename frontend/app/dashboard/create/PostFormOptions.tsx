"use client";

import { useRouter } from "next/navigation";
import { ScheduleDateTimePicker } from "@/components/ui/ScheduleDateTimePicker";
import { AccountBubbleSelector } from "@/components/AccountBubbleSelector";
import { Button } from "@/components/ui/button";
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
  loading: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
  /** When true, show times in 24h format across schedule/time displays */
  use24HourTimeFormat?: boolean;
  /** User's date format (dd/MM/yyyy, MM/dd/yyyy, yyyy-MM-dd) */
  dateFormat?: string | null;
  /** Rendered just above "When do you want to publish?" (e.g. Auto-Repost & Auto-Plug) */
  betweenScheduleAndActions?: React.ReactNode;
  /** When true, only render "Post to" + account selector and betweenScheduleAndActions (schedule/actions move to sidebar) */
  hideScheduleAndActions?: boolean;
  /** Optional slot (e.g. search input) rendered between the label and AccountBubbleSelector */
  searchSlot?: React.ReactNode;
  /** When true, show "Remember" checkbox; when checked, parent should persist selection to localStorage */
  remember?: boolean;
  onRememberChange?: (checked: boolean) => void;
  /** Platform IDs this form supports. Shown in empty state when no accounts match. */
  supportedPlatforms?: string[];
  /** When true, show skeleton placeholders in the account grid instead of AccountBubbleSelector. */
  accountsLoading?: boolean;
  /** Account IDs disabled for this post (e.g. video exceeds platform limit). */
  disabledAccountIds?: Set<string>;
  /** Reason per disabled account id. */
  disabledReasons?: Record<string, string>;
  disabledAccountDefaultReason?: string;
  /** Account IDs with soft warning (e.g. Instagram 3–20 min). Selectable; yellow badge. */
  warningAccountIds?: Set<string>;
  warningReasons?: Record<string, string>;
  warningLabel?: string;
  /** When true, show upgrade CTA instead of account picker (free tier). */
  showUpgradeCta?: boolean;
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
  loading,
  submitLabel,
  submitDisabled = false,
  use24HourTimeFormat = false,
  dateFormat = "dd/MM/yyyy",
  betweenScheduleAndActions,
  hideScheduleAndActions = false,
  searchSlot,
  remember = false,
  onRememberChange,
  supportedPlatforms,
  accountsLoading = false,
  disabledAccountIds,
  disabledReasons,
  disabledAccountDefaultReason,
  warningAccountIds,
  warningReasons,
  warningLabel,
  showUpgradeCta = false,
}: PostFormOptionsProps) {
  const router = useRouter();
  const platformName = (platformId: string) =>
    PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;

  const selectableAccounts = accounts.filter(
    (a) => !a.tokenExpired && !disabledAccountIds?.has(a.id),
  );
  const allSelected =
    selectableAccounts.length > 0 &&
    selectableAccounts.every((a) => selectedIds.has(a.id));

  return (
    <>
      <section className="border-b border-border pt-5 pb-5 -mt-16">
        {showUpgradeCta ? (
          <div className="rounded-xl border border-border p-5 space-y-3 text-center">
            <p className="font-medium text-text">
              Subscribe to start posting
            </p>
            <p className="text-sm text-muted-foreground">
              Connect your social accounts and publish across platforms.
            </p>
            <Button
              onClick={() => router.push("/dashboard/billing")}
              className="w-full sm:w-auto"
            >
              View plans
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-between">
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={selectAll}
                  className="shrink-0 rounded-full border border-border bg-bg-elevated px-2 py-0.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
                {onRememberChange != null && (
                  <label className="flex shrink-0 items-center gap-2 cursor-pointer">
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
              {searchSlot && (
                <div className="min-w-0 flex-1 sm:max-w-[280px] [&_input]:h-9">
                  {searchSlot}
                </div>
              )}
            </div>
            <div className="mt-4">
              {accountsLoading ? (
                <div className="flex flex-wrap items-center gap-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center" aria-hidden>
                      <div className="h-12 w-12 shrink-0 rounded-full bg-bg-muted animate-pulse border-2 border-transparent" />
                      <div className="mt-1.5 h-3 w-14 rounded bg-bg-muted animate-pulse" />
                      <div className="mt-1 h-3 w-10 rounded bg-bg-muted animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <AccountBubbleSelector
                  accounts={accounts}
                  selectedIds={selectedIds}
                  onToggleAccount={onToggleAccount}
                  selectAll={selectAll}
                  platformName={platformName}
                  compact
                  hideSelectAll
                  supportedPlatforms={supportedPlatforms}
                  disabledAccountIds={disabledAccountIds}
                  disabledReasons={disabledReasons}
                  disabledAccountDefaultReason={disabledAccountDefaultReason}
                  warningAccountIds={warningAccountIds}
                  warningReasons={warningReasons}
                  warningLabel={warningLabel}
                />
              )}
            </div>
          </>
        )}
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
                minDate={new Date()}
                placeholder="Pick date & time"
                use24HourTimeFormat={use24HourTimeFormat}
                dateFormat={dateFormat}
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
