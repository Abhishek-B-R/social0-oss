"use client";

import { CalendarClock, Loader2, Upload, X } from "lucide-react";

export type BulkScheduleOverlayPhase = "uploading" | "creating";

type BulkScheduleOverlayProps = {
  variant: "image" | "video";
  phase: BulkScheduleOverlayPhase;
  uploadPercent: number;
  totalItems: number;
  /** 1-based index while creating scheduled posts */
  creatingIndex?: number;
  onCancel: () => void;
};

function itemLabel(variant: "image" | "video", count: number) {
  const word = variant === "image" ? "image" : "video";
  return count === 1 ? word : `${word}s`;
}

export function BulkScheduleOverlay({
  variant,
  phase,
  uploadPercent,
  totalItems,
  creatingIndex = 0,
  onCancel,
}: BulkScheduleOverlayProps) {
  const isUploading = phase === "uploading";
  const label = itemLabel(variant, totalItems);

  const title = isUploading
    ? `Uploading your ${label}`
    : "Scheduling your posts";

  const description = isUploading
    ? `Each ${variant === "image" ? "image" : "video"} is uploaded first, then added to your calendar as a separate scheduled post.`
    : "Saving each post to your schedule. This usually takes a few seconds.";

  const stepLabel = isUploading
    ? `${Math.min(100, Math.max(0, uploadPercent))}% complete · ${totalItems} ${label} total`
    : creatingIndex > 0
      ? `Post ${creatingIndex} of ${totalItems}`
      : `Preparing ${totalItems} scheduled ${label}…`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[2px] dark:bg-black/70 lg:left-64"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-schedule-overlay-title"
      aria-busy="true"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-elevated text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Cancel scheduling"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100/90 dark:bg-emerald-500/20">
            {isUploading ? (
              <Upload className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CalendarClock className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>

          <h2
            id="bulk-schedule-overlay-title"
            className="mt-4 text-xl font-semibold text-foreground"
          >
            {title}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>

          <div className="mt-6 w-full space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-accent transition-all duration-200"
                style={{
                  width: `${
                    isUploading
                      ? Math.min(100, Math.max(0, uploadPercent))
                      : totalItems > 0
                        ? Math.round((creatingIndex / totalItems) * 100)
                        : 0
                  }%`,
                }}
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
              {!isUploading && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              )}
              <span>{stepLabel}</span>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {isUploading
              ? "Keep this tab open while uploads finish. You can cancel before posts are created."
              : "You can leave this page once scheduling finishes — posts will appear on your calendar."}
          </p>

          <button
            type="button"
            onClick={onCancel}
            className="mt-5 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
