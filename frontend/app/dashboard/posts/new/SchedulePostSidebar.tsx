"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublishMode } from "@/app/actions/posts";
import { Settings } from "lucide-react";

export type SidebarAutoRepost = {
  visible: boolean;
  enabled: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
};

export type SidebarAutoPlug = {
  visible: boolean;
  enabled: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
};

export type SidebarTikTokSettings = {
  visible: boolean;
  onOpenSettings: () => void;
};

type SchedulePostSidebarProps = {
  /** Preview card(s) rendered above the schedule card */
  children?: React.ReactNode;
  mode: PublishMode;
  setMode: (m: PublishMode) => void;
  scheduledAt: Date | null;
  setScheduledAt: (d: Date | null) => void;
  loading: boolean;
  submitDisabled: boolean;
  hasAccountSelected: boolean;
  error: string | null;
  onCancel: () => void;
  /** When true, show times in 24h format */
  use24HourTimeFormat?: boolean;
  /** Set this ref before calling requestSubmit so handleSubmit uses the correct mode */
  intendedModeRef: React.MutableRefObject<PublishMode | null>;
  formRef: React.RefObject<HTMLFormElement | null>;
  /** Auto-Repost: compact row with toggle + settings icon when enabled */
  autoRepost?: SidebarAutoRepost | null;
  /** Auto-Plug: compact row with toggle + settings icon when enabled */
  autoPlug?: SidebarAutoPlug | null;
  /** TikTok Settings: compact row with settings icon (opens list modal) */
  tiktokSettings?: SidebarTikTokSettings | null;
};

export function SchedulePostSidebar({
  children,
  mode,
  setMode,
  scheduledAt,
  setScheduledAt,
  loading,
  submitDisabled,
  hasAccountSelected,
  error,
  onCancel,
  use24HourTimeFormat = false,
  intendedModeRef,
  formRef,
  autoRepost,
  autoPlug,
  tiktokSettings,
}: SchedulePostSidebarProps) {
  const isScheduled = mode === "scheduled";

  const defaultScheduledAt = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }, []);

  const [dateValue, setDateValue] = useState<string>(() => {
    const base = scheduledAt ?? defaultScheduledAt;
    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const dd = String(base.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [timeValue, setTimeValue] = useState<string>(() => {
    const base = scheduledAt ?? defaultScheduledAt;
    const hh = String(base.getHours()).padStart(2, "0");
    const mi = String(base.getMinutes()).padStart(2, "0");
    return `${hh}:${mi}`;
  });

  const combinedDateTime = useMemo(() => {
    if (!dateValue || !timeValue) return null;
    const [yyyy, mm, dd] = dateValue.split("-").map(Number);
    const [hh, mi] = timeValue.split(":").map(Number);
    if (
      !yyyy ||
      !mm ||
      !dd ||
      Number.isNaN(yyyy) ||
      Number.isNaN(mm) ||
      Number.isNaN(dd) ||
      Number.isNaN(hh) ||
      Number.isNaN(mi)
    ) {
      return null;
    }
    return new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
  }, [dateValue, timeValue]);

  const scheduledReadable = useMemo(() => {
    if (!combinedDateTime) return null;
    const datePart = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(combinedDateTime);
    const timePart = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: !use24HourTimeFormat,
    }).format(combinedDateTime);
    return `Scheduled for ${datePart} at ${timePart}`;
  }, [combinedDateTime, use24HourTimeFormat]);

  // Keep the parent `scheduledAt` in sync with our inputs while scheduled mode is on.
  useEffect(() => {
    if (!isScheduled) return;
    if (!combinedDateTime) return;
    if (scheduledAt?.getTime() === combinedDateTime.getTime()) return;
    setScheduledAt(combinedDateTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScheduled, combinedDateTime]);

  // If scheduled mode is enabled and no datetime exists yet, initialize to tomorrow 09:00.
  useEffect(() => {
    if (!isScheduled) return;
    if (scheduledAt) return;
    setScheduledAt(defaultScheduledAt);
    const yyyy = defaultScheduledAt.getFullYear();
    const mm = String(defaultScheduledAt.getMonth() + 1).padStart(2, "0");
    const dd = String(defaultScheduledAt.getDate()).padStart(2, "0");
    setDateValue(`${yyyy}-${mm}-${dd}`);
    setTimeValue("09:00");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScheduled]);

  const handlePostNow = () => {
    intendedModeRef.current = "now";
    setMode("now");
    formRef.current?.requestSubmit();
  };

  const handleSaveDraft = () => {
    intendedModeRef.current = "draft";
    setMode("draft");
    formRef.current?.requestSubmit();
  };

  const handleSchedule = () => {
    intendedModeRef.current = "scheduled";
    setMode("scheduled");
    formRef.current?.requestSubmit();
  };

  const toggleScheduled = () => {
    if (isScheduled) {
      setMode("now");
      return;
    }
    // Turn on scheduling and ensure we have a sane default.
    setMode("scheduled");
    if (!scheduledAt) {
      setScheduledAt(defaultScheduledAt);
      const yyyy = defaultScheduledAt.getFullYear();
      const mm = String(defaultScheduledAt.getMonth() + 1).padStart(2, "0");
      const dd = String(defaultScheduledAt.getDate()).padStart(2, "0");
      setDateValue(`${yyyy}-${mm}-${dd}`);
      setTimeValue("09:00");
    }
  };

  return (
    <aside
      className="flex w-full flex-col gap-6 pb-24 lg:sticky lg:top-[60px] lg:max-h-[calc(100vh-100px)] lg:w-[35%] lg:overflow-y-auto lg:pb-0 -mt-20"
      style={{ minWidth: 0 }}
    >
      {children}

      <div className="rounded-xl border border-border bg-bg-elevated -mt-3 px-4 py-2 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-sm font-semibold text-text">Schedule post</span>
          <button
            type="button"
            role="switch"
            aria-checked={isScheduled}
            onClick={toggleScheduled}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20 ${
              isScheduled
                ? "border-accent bg-accent"
                : "border-gray-400 bg-bg-muted dark:border-gray-600"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-bg border border-gray-400 dark:border-gray-600 shadow ring-0 transition-transform ${
                isScheduled ? "translate-x-5" : "translate-x-0.5"
              }`}
              style={{ marginTop: 1 }}
            />
          </button>
        </div>

        {!isScheduled ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handlePostNow}
              disabled={loading || !hasAccountSelected || submitDisabled}
              className="w-full rounded-xl bg-accent py-3 font-semibold text-white shadow transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
            >
              {loading ? "Saving..." : "Post now"}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={loading || submitDisabled}
              className="w-full rounded-xl border border-border bg-bg-elevated py-3 font-medium text-text transition-colors hover:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save to Drafts
            </button>
            {!hasAccountSelected && (
              <p className="text-xs text-text-muted">
                Select an account to post
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="schedule-date"
                  className="block text-xs font-medium text-text-muted mb-1"
                >
                  Date
                </label>
                <input
                  id="schedule-date"
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  className="w-full rounded-xl border border-input bg-bg px-3 py-3 text-sm font-medium text-text shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="schedule-time"
                  className="block text-xs font-medium text-text-muted mb-1"
                >
                  Time
                </label>
                <input
                  id="schedule-time"
                  type="time"
                  value={timeValue}
                  onChange={(e) => setTimeValue(e.target.value)}
                  className="w-full rounded-xl border border-input bg-bg px-3 py-3 text-sm font-medium text-text shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>

            <p className="text-xs text-text-muted">
              {scheduledReadable ?? "Pick a date and time to schedule"}
            </p>

            <button
              type="button"
              onClick={handleSchedule}
              disabled={
                loading ||
                !hasAccountSelected ||
                !combinedDateTime ||
                submitDisabled
              }
              className="w-full rounded-xl bg-accent py-3 font-semibold text-white shadow transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
            >
              {loading ? "Saving..." : "Schedule"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl border border-border bg-bg-elevated px-4 py-2.5 font-medium text-text transition-colors hover:bg-bg-muted -mt-4"
      >
        Cancel
      </button>

      <div className="space-y-2 shrink-0 min-h-0">
        {autoRepost?.visible && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2 -mt-3 min-w-0">
            <span className="text-sm font-medium text-text truncate shrink-0">
              Auto-Repost
            </span>
            <div className="flex items-center gap-2">
              {autoRepost.enabled && (
                <button
                  type="button"
                  onClick={autoRepost.onOpenSettings}
                  className="rounded-lg p-1.5 text-text-muted hover:bg-bg-muted hover:text-text transition-colors"
                  aria-label="Auto-Repost settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={autoRepost.enabled}
                aria-label={
                  autoRepost.enabled
                    ? "Disable Auto-Repost"
                    : "Enable Auto-Repost"
                }
                onClick={autoRepost.onToggle}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                  autoRepost.enabled ? "bg-emerald-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-bg shadow transition-transform ${
                    autoRepost.enabled ? "translate-x-4" : "translate-x-0.5"
                  } mt-0.5`}
                />
              </button>
            </div>
          </div>
        )}
        {autoPlug?.visible && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2 min-w-0">
            <span className="text-sm font-medium text-text truncate shrink-0">
              Auto-Plug
            </span>
            <div className="flex items-center gap-2">
              {autoPlug.enabled && (
                <button
                  type="button"
                  onClick={autoPlug.onOpenSettings}
                  className="rounded-lg p-1.5 text-text-muted hover:bg-bg-muted hover:text-text transition-colors"
                  aria-label="Auto-Plug settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={autoPlug.enabled}
                aria-label={
                  autoPlug.enabled ? "Disable Auto-Plug" : "Enable Auto-Plug"
                }
                onClick={autoPlug.onToggle}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                  autoPlug.enabled ? "bg-emerald-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-bg shadow transition-transform ${
                    autoPlug.enabled ? "translate-x-4" : "translate-x-0.5"
                  } mt-0.5`}
                />
              </button>
            </div>
          </div>
        )}
        {tiktokSettings?.visible && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-1 min-w-0">
            <span className="text-sm font-medium text-text truncate shrink-0">
              TikTok Settings
            </span>
            <button
              type="button"
              onClick={tiktokSettings.onOpenSettings}
              className="rounded-lg p-1.5 text-text-muted hover:bg-bg-muted hover:text-text transition-colors"
              aria-label="TikTok settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
