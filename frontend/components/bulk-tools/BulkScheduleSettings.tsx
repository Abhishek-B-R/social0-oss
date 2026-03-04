"use client";

import { HelpCircle } from "lucide-react";

const CAPTION_MAX = 2200;
const VIDEOS_PER_DAY_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1);
const GAP_HOURS_OPTIONS = [0.5, 1, 2, 3, 4, 6, 8, 12, 24] as const;
// const COVER_FRAME_OPTIONS = [
//   { value: "first", label: "First Frame" },
//   { value: "middle", label: "Middle Frame" },
// ] as const;

// export type CoverFrame = (typeof COVER_FRAME_OPTIONS)[number]["value"];

type BulkScheduleSettingsProps = {
  variant: "video" | "image";
  /** Section 1 */
  bulkCaption: string;
  onBulkCaptionChange: (v: string) => void;
  onApplyCaption: () => void;
  /** Section 2 */
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  videosPerDay: number;
  gapHours: number;
  onStartDateChange: (v: string) => void;
  onStartTimeChange: (v: string) => void;
  onVideosPerDayChange: (v: number) => void;
  onGapHoursChange: (v: number) => void;
  onApplyBulkSchedule: () => void;
  schedulePreview: string | null;
  /** Section 3 */
  // coverFrame?: CoverFrame;
  // onCoverFrameChange?: (v: CoverFrame) => void;
  totalItems: number;
  selectedAccountCount: number;
  onScheduleAll: () => void;
  scheduling: boolean;
  progressLabel?: string;
};

export function BulkScheduleSettings({
  variant,
  bulkCaption,
  onBulkCaptionChange,
  onApplyCaption,
  startDate,
  startTime,
  videosPerDay,
  gapHours,
  onStartDateChange,
  onStartTimeChange,
  onVideosPerDayChange,
  onGapHoursChange,
  onApplyBulkSchedule,
  schedulePreview,
  // coverFrame = "middle",
  // onCoverFrameChange,
  totalItems,
  selectedAccountCount,
  onScheduleAll,
  scheduling,
  progressLabel,
}: BulkScheduleSettingsProps) {
  const captionCount = bulkCaption.length;

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm -mt-14">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-foreground">
          Bulk Schedule Settings
        </h3>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      {/* Section 1: Bulk Caption */}
      <div>
        <div className="flex justify-between">
          <h4 className="text-sm font-semibold text-foreground mb-2">
            Bulk Caption
          </h4>
          <span className="text-xs text-muted-foreground ml-2">
            {captionCount} / {CAPTION_MAX}
          </span>
        </div>
        <textarea
          value={bulkCaption}
          onChange={(e) =>
            onBulkCaptionChange(e.target.value.slice(0, CAPTION_MAX))
          }
          placeholder={`Enter a caption to apply to all ${variant === "video" ? "videos" : "images"}.`}
          rows={4}
          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />

        <button
          type="button"
          onClick={onApplyCaption}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors w-full"
        >
          Apply Caption to All {variant === "video" ? "Videos" : "Images"}
        </button>
      </div>

      {/* Section 2: Schedule Settings */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">
          Schedule Settings
        </h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => onStartTimeChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {variant === "video" ? "Videos" : "Images"} per day (1–24)
            </label>
            <select
              value={videosPerDay}
              onChange={(e) => onVideosPerDayChange(Number(e.target.value))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              {VIDEOS_PER_DAY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {videosPerDay > 1 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Time between posts (hours)
              </label>
              <select
                value={gapHours}
                onChange={(e) => onGapHoursChange(Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {GAP_HOURS_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h === 24 ? "24 hours" : `${h} hour${h === 1 ? "" : "s"}`}
                  </option>
                ))}
              </select>
              {gapHours < 24 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Within same day
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onApplyBulkSchedule}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            Apply Bulk Schedule
          </button>
          {schedulePreview && (
            <div className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground whitespace-pre-wrap">
              {schedulePreview}
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Confirm & Schedule All */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-1">
          Confirm & Schedule All
        </h4>
        <p className="text-xs text-muted-foreground mb-3">
          Review individual {variant === "video" ? "videos" : "images"}, then
          click below to schedule all.
        </p>
        {/* {variant === "video" && onCoverFrameChange && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Video Cover Frame
            </label>
            <select
              value={coverFrame}
              onChange={(e) => onCoverFrameChange(e.target.value as CoverFrame)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              {COVER_FRAME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )} */}
        <button
          type="button"
          onClick={onScheduleAll}
          disabled={
            selectedAccountCount === 0 || totalItems === 0 || scheduling
          }
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {scheduling
            ? (progressLabel ?? `Scheduling...`)
            : `Schedule All ${totalItems} ${variant === "video" ? "Videos" : "Images"}`}
        </button>
        {selectedAccountCount === 0 && totalItems > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Please select at least one account.
          </p>
        )}
      </div>
    </div>
  );
}
