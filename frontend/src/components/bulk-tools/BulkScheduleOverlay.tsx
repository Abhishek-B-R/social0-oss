import { useEffect, useId } from "react";
import { CalendarClock, Loader2, Upload } from "lucide-react";

export type BulkScheduleOverlayPhase = "uploading" | "creating";

type BulkScheduleOverlayProps = {
  phase: BulkScheduleOverlayPhase;
  uploadPercent: number;
  totalItems: number;
  /** 1-based index while creating posts */
  creatingIndex?: number;
  /** What the posts become: "scheduled", "queued", "drafts". */
  mode?: "schedule" | "queue" | "draft";
  onCancel: () => void;
};

/**
 * Blocking progress panel while a bulk import uploads files and creates
 * posts. Cancel stops further uploads and posts; posts already created stay.
 */
export function BulkScheduleOverlay({
  phase,
  uploadPercent,
  totalItems,
  creatingIndex = 0,
  mode = "schedule",
  onCancel,
}: BulkScheduleOverlayProps) {
  const titleId = useId();
  const isUploading = phase === "uploading";
  const files = `${totalItems} file${totalItems === 1 ? "" : "s"}`;
  const pct = Math.min(100, Math.max(0, uploadPercent));

  // Esc cancels, like the Cancel button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const title = isUploading
    ? `Uploading ${files}`
    : mode === "draft"
      ? "Saving your drafts"
      : mode === "queue"
        ? "Adding posts to your queue"
        : "Scheduling your posts";

  const stepLabel = isUploading
    ? `${pct}% uploaded`
    : creatingIndex > 0
      ? `Post ${creatingIndex} of ${totalItems}`
      : `Preparing ${totalItems} post${totalItems === 1 ? "" : "s"}…`;

  const bar = isUploading
    ? pct
    : totalItems > 0
      ? Math.round((creatingIndex / totalItems) * 100)
      : 0;

  return (
    <div
      className="sheet-scrim bg-scrim backdrop-blur-[2px] lg:left-64"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy="true"
    >
      <div className="sheet-panel relative max-w-md border border-border bg-bg-elevated p-6 shadow-xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-accent/10">
            {isUploading ? (
              <Upload className="size-7 text-accent" aria-hidden />
            ) : (
              <CalendarClock className="size-7 text-accent" aria-hidden />
            )}
          </div>

          <h2 id={titleId} className="mt-4 text-xl font-semibold tracking-tight text-text">
            {title}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
            {isUploading
              ? "Each file uploads first, then becomes its own post."
              : "Creating one post per file. This usually takes a few seconds."}
          </p>

          <div className="mt-6 w-full space-y-2">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={bar}
              aria-label={stepLabel}
            >
              <div
                className="h-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${bar}%` }}
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-text-muted" aria-live="polite">
              {!isUploading ? (
                <Loader2 className="size-3.5 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
              ) : null}
              <span>{stepLabel}</span>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-bg-muted px-3 py-2 text-xs leading-relaxed text-text-muted">
            {isUploading
              ? "Keep this tab open until uploads finish. Nothing is posted until then."
              : "Keep this tab open for a moment. Posts made before you cancel stay."}
          </p>

          <button
            type="button"
            onClick={onCancel}
            className="mt-5 w-full rounded-xl border border-border bg-bg-elevated px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            autoFocus
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
