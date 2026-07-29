import { useLocation } from "react-router-dom";
import { fetchApi } from "@/lib/fetch-api";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { PublishMode } from "@/api/posts";
import { formatDateTime, formatTimezoneLabel } from "@/lib/date-format";
import { signInUrl } from "@/lib/sign-in-url";
import { getPlanLimits } from "@/lib/plans";
import { Settings, ListOrdered } from "lucide-react";

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
  /** When submit is disabled, show this reason on hover (e.g. "Add a caption", "Add at least one image") */
  submitDisabledReason?: string | null;
  /** When set, disables only the primary action (Post now / Schedule) with this tooltip; Save to Drafts stays enabled */
  primaryActionDisabled?: boolean;
  primaryActionDisabledReason?: string | null;
  /** When true, show times in 24h format */
  use24HourTimeFormat?: boolean;
  /** User's date format (dd/MM/yyyy, MM/dd/yyyy, yyyy-MM-dd) */
  dateFormat?: string | null;
  /** User's IANA timezone (e.g. Asia/Kolkata) for schedule picker and next-slot */
  timezone?: string | null;
  /** Set this ref before calling requestSubmit so handleSubmit uses the correct mode */
  intendedModeRef: React.MutableRefObject<PublishMode | null>;
  /** When user clicks "Next Queue Slot", set to slotId; clear when they change date/time manually. Read on Schedule submit. */
  intendedQueueSlotIdRef?: React.MutableRefObject<string | null>;
  formRef: React.RefObject<HTMLFormElement | null>;
  /** Auto-Repost: compact row with toggle + settings icon when enabled */
  autoRepost?: SidebarAutoRepost | null;
  /** Auto-Plug: compact row with toggle + settings icon when enabled */
  autoPlug?: SidebarAutoPlug | null;
  /** When false, Auto-Repost row is disabled and shows upgrade message (default true) */
  allowAutoRepost?: boolean;
  /** When false, Auto-Plug row is disabled and shows upgrade message (default true) */
  allowAutoPlug?: boolean;
  /** TikTok Settings: compact row with settings icon (opens list modal) */
  tiktokSettings?: SidebarTikTokSettings | null;
  /** When editing a draft: show Delete draft button and call this on confirm */
  draftId?: string | null;
  onDeleteDraft?: () => void;
  /** Remember Auto-Repost & Auto-Plug: when checked, persist settings to localStorage */
  rememberAutoFeatures?: boolean;
  onRememberAutoFeaturesChange?: (checked: boolean) => void;
  /** Guest browsing - show sign-in instead of publish actions. */
  isGuest?: boolean;
  /** Free-tier posts remaining (shown above actions for signed-in free users). */
  freePostsRemaining?: number | null;
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
  submitDisabledReason,
  primaryActionDisabled = false,
  primaryActionDisabledReason = null,
  use24HourTimeFormat = false,
  dateFormat = "dd/MM/yyyy",
  timezone = null,
  intendedModeRef,
  intendedQueueSlotIdRef,
  formRef,
  autoRepost,
  autoPlug,
  allowAutoRepost = true,
  allowAutoPlug = true,
  tiktokSettings,
  draftId,
  onDeleteDraft,
  rememberAutoFeatures = false,
  onRememberAutoFeaturesChange,
  isGuest = false,
  freePostsRemaining = null,
}: SchedulePostSidebarProps) {
  const pathname = useLocation().pathname;
  const isScheduled = mode === "scheduled";

  const defaultScheduledAt = useMemo(() => {
    const d = new Date();
    d.setHours(21, 0, 0, 0);
    const now = new Date();
    if (d <= now) {
      const soon = new Date(now);
      soon.setMinutes(soon.getMinutes() + 5);
      return soon;
    }
    return d;
  }, []);

  const [dateValue, setDateValue] = useState<string>(() => {
    const base = scheduledAt ?? defaultScheduledAt;
    if (timezone?.trim() && scheduledAt) {
      const inTz = toZonedTime(scheduledAt, timezone.trim());
      return format(inTz, "yyyy-MM-dd");
    }
    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const dd = String(base.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [timeValue, setTimeValue] = useState<string>(() => {
    const base = scheduledAt ?? defaultScheduledAt;
    if (timezone?.trim() && scheduledAt) {
      const inTz = toZonedTime(scheduledAt, timezone.trim());
      return format(inTz, "HH:mm");
    }
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
    const localDate = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
    return timezone?.trim()
      ? fromZonedTime(localDate, timezone.trim())
      : localDate;
  }, [dateValue, timeValue, timezone]);

  const scheduledReadable = useMemo(() => {
    if (!combinedDateTime) return null;
    return `Scheduled for ${formatDateTime(combinedDateTime, {
      dateFormat,
      use24HourTimeFormat,
      timezone,
    })}`;
  }, [combinedDateTime, use24HourTimeFormat, dateFormat, timezone]);

  // Keep the parent `scheduledAt` in sync with our inputs while scheduled mode is on.
  if (
    isScheduled &&
    combinedDateTime &&
    scheduledAt?.getTime() !== combinedDateTime.getTime()
  ) {
    setScheduledAt(combinedDateTime);
  }

  // If scheduled mode is enabled and no datetime exists yet, initialize defaults.
  if (isScheduled && !scheduledAt) {
    setScheduledAt(defaultScheduledAt);
    const yyyy = defaultScheduledAt.getFullYear();
    const mm = String(defaultScheduledAt.getMonth() + 1).padStart(2, "0");
    const dd = String(defaultScheduledAt.getDate()).padStart(2, "0");
    setDateValue(`${yyyy}-${mm}-${dd}`);
    const hh = String(defaultScheduledAt.getHours()).padStart(2, "0");
    const mi = String(defaultScheduledAt.getMinutes()).padStart(2, "0");
    setTimeValue(`${hh}:${mi}`);
  }

  const handlePostNow = () => {
    intendedModeRef.current = "now";
    setMode("now");
    setScheduledAt(null);
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

  const [nextSlot, setNextSlot] = useState<{
    slotId: string;
    scheduledAt: string;
    displayLabel: string;
    timezone: string;
    timezoneLabel: string;
  } | null>(null);
  const [nextSlotLoading, setNextSlotLoading] = useState(false);

  useEffect(() => {
    if (!isScheduled) {
      queueMicrotask(() => {
        setNextSlot(null);
        setNextSlotLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setNextSlotLoading(true);
      setNextSlot(null);
    });
    fetchApi("/api/queue/next-slot")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setNextSlotLoading(false);
        if (!data?.available || !data?.slotId) return;
        setNextSlot({
          slotId: data.slotId,
          scheduledAt: data.scheduledAt ?? data.scheduledFor ?? "",
          displayLabel: data.displayLabel ?? data.displayTime ?? "",
          timezone: data.timezone ?? "UTC",
          timezoneLabel: data.timezoneLabel ?? data.timezone ?? "UTC",
        });
      })
      .catch(() => {
        if (!cancelled) setNextSlotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isScheduled]);

  const fillNextSlot = () => {
    if (!nextSlot) return;
    const utc = new Date(nextSlot.scheduledAt);
    const inTz = toZonedTime(utc, nextSlot.timezone);
    setDateValue(format(inTz, "yyyy-MM-dd"));
    setTimeValue(format(inTz, "HH:mm"));
    setScheduledAt(utc);
    if (intendedQueueSlotIdRef)
      intendedQueueSlotIdRef.current = nextSlot.slotId;
  };

  const clearQueueSlotRef = () => {
    if (intendedQueueSlotIdRef) intendedQueueSlotIdRef.current = null;
  };

  const toggleScheduled = () => {
    if (isScheduled) {
      setMode("now");
      setScheduledAt(null);
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
      const hh = String(defaultScheduledAt.getHours()).padStart(2, "0");
      const mi = String(defaultScheduledAt.getMinutes()).padStart(2, "0");
      setTimeValue(`${hh}:${mi}`);
    }
  };

  return (
    <aside
      className="flex w-full flex-col gap-6 pb-24 lg:sticky lg:top-[60px] lg:w-[35%] lg:pb-0 lg:-mt-16"
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
              className={`pointer-events-none bg-gray-600 dark:bg-gray-300 inline-block h-5 w-5 rounded-full border border-gray-400 dark:border-gray-600 shadow ring-0 transition-transform ${
                isScheduled ? "translate-x-5" : "translate-x-0.5"
              }`}
              style={{ marginTop: "0.5px" }}
            />
          </button>
        </div>

        {!isScheduled ? (
          <div className="space-y-2">
            {isGuest ? (
              <>
                <Link
                  href={signInUrl(pathname)}
                  className="flex w-full items-center justify-center rounded-xl bg-accent py-3 font-semibold text-accent-foreground shadow transition-colors hover:bg-accent-hover"
                >
                  Sign in to post
                </Link>
                <p className="text-xs text-center text-text-muted">
                  Write your post now - sign in when you&apos;re ready to
                  publish or save drafts.
                </p>
              </>
            ) : (
              <>
                {typeof freePostsRemaining === "number" && (
                  <p className="text-xs text-text-muted">
                    {freePostsRemaining}/{getPlanLimits("free").maxFreePosts}{" "}
                    free posts remaining
                  </p>
                )}
                <button
                  type="button"
                  onClick={handlePostNow}
                  disabled={
                    loading ||
                    !hasAccountSelected ||
                    submitDisabled ||
                    primaryActionDisabled
                  }
                  title={
                    loading
                      ? undefined
                      : primaryActionDisabled
                        ? (primaryActionDisabledReason ?? undefined)
                        : !hasAccountSelected
                          ? "Select at least one account to post"
                          : submitDisabled
                            ? (submitDisabledReason ??
                              "Complete the form to post")
                            : undefined
                  }
                  className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-foreground shadow transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
                >
                  {loading ? "Saving..." : "Post now"}
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={loading || submitDisabled || !hasAccountSelected}
                  title={
                    loading
                      ? undefined
                      : !hasAccountSelected
                        ? "Select at least one account before saving a draft"
                        : submitDisabled
                          ? (submitDisabledReason ??
                            "Complete the form to save a draft")
                          : undefined
                  }
                  className="w-full rounded-xl border border-border bg-bg-elevated py-3 font-medium text-text transition-colors hover:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save to Drafts
                </button>
                {!hasAccountSelected && (
                  <p className="text-xs text-text-muted">
                    Select an account to post or save a draft
                  </p>
                )}
              </>
            )}
          </div>
        ) : isGuest ? (
          <div className="space-y-2">
            <Link
              href={signInUrl(pathname)}
              className="flex w-full items-center justify-center rounded-xl bg-accent py-3 font-semibold text-accent-foreground shadow transition-colors hover:bg-accent-hover"
            >
              Sign in to schedule
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {nextSlotLoading ? (
              <div
                className="flex w-full items-center gap-2 rounded-xl border border-border bg-bg-muted/30 px-3 py-2.5"
                aria-busy="true"
                aria-live="polite"
              >
                <div
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
                  aria-hidden
                />
                <span className="text-sm text-text-muted">Loading queue…</span>
              </div>
            ) : nextSlot ? (
              <button
                type="button"
                onClick={fillNextSlot}
                className="flex w-full items-center gap-2 rounded-xl border border-border bg-bg-muted/50 px-3 py-2.5 text-left text-sm font-medium text-text transition-colors hover:bg-bg-muted hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <ListOrdered
                  className="h-4 w-4 shrink-0 text-accent"
                  aria-hidden
                />
                <span>Next Queue Slot: {nextSlot.displayLabel}</span>
              </button>
            ) : (
              <Link
                href="/dashboard/settings#queue"
                className="inline-flex w-full justify-center items-center gap-1.5 rounded-lg border border-border bg-bg-muted/40 px-3 py-2 text-sm font-medium text-text hover:border-accent/50 hover:bg-accent/5 hover:text-accent transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Set up queue in Settings
              </Link>
            )}
            <p className="text-xs text-text-muted">
              Timezone: {formatTimezoneLabel(timezone)}
              <Link
                href="/dashboard/settings#preferences"
                className="inline-flex items-center gap-1.5 rounded-lg text-accent ml-2"
              >
                Edit
              </Link>
            </p>
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
                  onChange={(e) => {
                    setDateValue(e.target.value);
                    clearQueueSlotRef();
                  }}
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
                  onChange={(e) => {
                    setTimeValue(e.target.value);
                    clearQueueSlotRef();
                  }}
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
                submitDisabled ||
                primaryActionDisabled
              }
              title={
                loading
                  ? undefined
                  : primaryActionDisabled
                    ? (primaryActionDisabledReason ?? undefined)
                    : !hasAccountSelected
                      ? "Select at least one account to post"
                      : !combinedDateTime
                        ? "Pick a date and time to schedule"
                        : submitDisabled
                          ? (submitDisabledReason ??
                            "Complete the form to schedule")
                          : undefined
              }
              className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-foreground shadow transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
            >
              {loading ? "Saving..." : "Schedule"}
            </button>
          </div>
        )}
      </div>

      {draftId && onDeleteDraft && (
        <div className="flex flex-wrap items-center gap-2 -mt-4">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Are you sure? This cannot be undone.")) {
                onDeleteDraft();
              }
            }}
            className="rounded-xl border border-red-300 bg-red-50 w-full px-4 py-2.5 font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50"
          >
            Delete draft
          </button>
        </div>
      )}

      <div className="space-y-2 shrink-0 min-h-0">
        {(autoRepost?.visible || autoPlug?.visible) &&
          onRememberAutoFeaturesChange != null && (
            <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-border bg-bg-elevated px-3 py-2 -mt-3 min-w-0">
              <input
                type="checkbox"
                checked={rememberAutoFeatures}
                onChange={(e) => onRememberAutoFeaturesChange(e.target.checked)}
                className="rounded border-input bg-bg text-accent focus:ring-accent"
              />
              <span className="text-sm text-text">Remember</span>
            </label>
          )}
        {autoRepost?.visible && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2 -mt-3 min-w-0">
            <div className="flex flex-col gap-0.5 shrink-0 min-w-0">
              <span className="text-sm font-medium text-text truncate">
                Auto-Repost
              </span>
              <span className="text-xs text-text-muted">(Twitter/X only)</span>
              {!allowAutoRepost && (
                <Link
                  href="/dashboard/billing"
                  className="text-xs text-accent hover:text-accent-hover mt-0.5"
                >
                  Upgrade to use
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2">
              {allowAutoRepost ? (
                <>
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
                      autoRepost.enabled
                        ? "bg-accent"
                        : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-bg shadow transition-transform ${
                        autoRepost.enabled ? "translate-x-4" : "translate-x-0.5"
                      } mt-0.5`}
                    />
                  </button>
                </>
              ) : (
                <span
                  role="switch"
                  aria-checked={false}
                  aria-disabled="true"
                  className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600 opacity-60 cursor-not-allowed"
                >
                  <span className="inline-block h-4 w-4 transform translate-x-0.5 rounded-full bg-bg shadow mt-0.5" />
                </span>
              )}
            </div>
          </div>
        )}
        {autoPlug?.visible && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2 min-w-0">
            <div className="flex flex-col gap-0.5 shrink-0 min-w-0">
              <span className="text-sm font-medium text-text truncate">
                Auto-Plug
              </span>
              <span className="text-xs text-text-muted">(Twitter/X only)</span>
              {!allowAutoPlug && (
                <Link
                  href="/dashboard/billing"
                  className="text-xs text-accent hover:text-accent-hover mt-0.5"
                >
                  Upgrade to use
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2">
              {allowAutoPlug ? (
                <>
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
                      autoPlug.enabled
                        ? "Disable Auto-Plug"
                        : "Enable Auto-Plug"
                    }
                    onClick={autoPlug.onToggle}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                      autoPlug.enabled
                        ? "bg-accent"
                        : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-bg shadow transition-transform ${
                        autoPlug.enabled ? "translate-x-4" : "translate-x-0.5"
                      } mt-0.5`}
                    />
                  </button>
                </>
              ) : (
                <span
                  role="switch"
                  aria-checked={false}
                  aria-disabled="true"
                  className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600 opacity-60 cursor-not-allowed"
                >
                  <span className="inline-block h-4 w-4 transform translate-x-0.5 rounded-full bg-bg shadow mt-0.5" />
                </span>
              )}
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
