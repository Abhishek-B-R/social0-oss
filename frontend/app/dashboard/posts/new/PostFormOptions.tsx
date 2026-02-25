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
  onCancel: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
  /** Rendered just above "When do you want to publish?" (e.g. Auto-Repost & Auto-Plug) */
  betweenScheduleAndActions?: React.ReactNode;
  /** When true, only render "Post to" + account selector and betweenScheduleAndActions (schedule/actions move to sidebar) */
  hideScheduleAndActions?: boolean;
  /** Optional slot (e.g. search input) rendered between the label and AccountBubbleSelector */
  searchSlot?: React.ReactNode;
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
  onCancel,
  submitLabel,
  submitDisabled = false,
  betweenScheduleAndActions,
  hideScheduleAndActions = false,
  searchSlot,
}: PostFormOptionsProps) {
  const platformName = (platformId: string) =>
    PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;

  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const allSelected =
    selectableAccounts.length > 0 &&
    selectableAccounts.every((a) => selectedIds.has(a.id));

  return (
    <>
      <section className="border-b border-gray-200 pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="shrink-0 text-sm font-semibold text-gray-900">
            Post to
          </label>
          {searchSlot && (
            <div className="min-w-0 w-full sm:ml-auto sm:max-w-[340px]">
              {searchSlot}
            </div>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="shrink-0 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
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
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="block text-sm font-semibold text-gray-900 mb-4">
            When do you want to publish?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 has-checked:border-emerald-500 has-checked:bg-emerald-50/50 transition-colors">
              <input
                type="radio"
                name="publishMode"
                checked={mode === "now"}
                onChange={() => setMode("now")}
                className="mt-0.5 size-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="block font-medium text-gray-900">
                  Post now
                </span>
                <span className="block text-sm text-gray-500 mt-0.5">
                  Publish right away
                </span>
              </div>
            </label>
            <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 has-checked:border-emerald-500 has-checked:bg-emerald-50/50 transition-colors">
              <input
                type="radio"
                name="publishMode"
                checked={mode === "scheduled"}
                onChange={() => setMode("scheduled")}
                className="mt-0.5 size-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="block font-medium text-gray-900">
                  Schedule for later
                </span>
                <span className="block text-sm text-gray-500 mt-0.5">
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
              />
            </div>
          )}
          <p className="mt-4 text-sm text-gray-500">
            {mode === "draft" ? (
              <span className="text-emerald-700 font-medium">
                Saving as draft — you can publish later from Posts.
              </span>
            ) : (
              <>
                Or{" "}
                <button
                  type="button"
                  onClick={() => setMode("draft")}
                  className="font-medium text-emerald-600 hover:text-emerald-700"
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
        <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-100">
          {error}
        </div>
      )}

      {!hideScheduleAndActions && (
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || submitDisabled}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 shadow-lg transition-colors"
          >
            {loading ? "Saving..." : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 bg-white px-6 py-3 font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
