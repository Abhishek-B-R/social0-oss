import { useState } from "react";
import { format } from "date-fns";
import { AlertCircle, AlertTriangle, ChevronDown, Film, ImageIcon, Play, Trash2 } from "lucide-react";
import { NetworkIcon, NetworkStack } from "@/components/app";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getMostRestrictiveLimit } from "@/lib/platform-limits";
import { formatBytes } from "@/lib/media-limits";
import { cn } from "@/lib/utils";
import {
  CAPTION_MAX,
  YOUTUBE_TITLE_MAX,
  accountsForRow,
  combineDateTime,
  networkName,
  supportedPlatformsFor,
  scheduleDateBounds,
  toDateInput,
  toTimeInput,
  type BulkRow,
  type ImportMode,
  type IssueFix,
  type RowIssue,
} from "./bulk-import-model";
import type { AccountForForm } from "@/lib/accounts-for-form";

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

function focusLater(id: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el instanceof HTMLElement) {
      el.focus();
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}

function fixLabel(fix: IssueFix): string {
  switch (fix.type) {
    case "skip":
      return fix.label;
    case "caption":
      return "Edit caption";
    case "title":
      return "Add title";
    case "time":
      return "Change time";
    case "remove":
      return "Remove file";
  }
}

/** Date + time inputs that keep half-typed values until they parse. */
function RowTimeInputs({
  row,
  disabled,
  onChange,
}: {
  row: BulkRow;
  disabled: boolean;
  onChange: (d: Date) => void;
}) {
  const ms = row.scheduledAt.getTime();
  const valid = !Number.isNaN(ms);
  const [dateStr, setDateStr] = useState(() => (valid ? toDateInput(row.scheduledAt) : ""));
  const [timeStr, setTimeStr] = useState(() => (valid ? toTimeInput(row.scheduledAt) : ""));
  const [synced, setSynced] = useState(ms);
  if (synced !== ms && !(Number.isNaN(synced) && Number.isNaN(ms))) {
    setSynced(ms);
    setDateStr(valid ? toDateInput(row.scheduledAt) : "");
    setTimeStr(valid ? toTimeInput(row.scheduledAt) : "");
  }
  const { min: today, max: maxDay } = scheduleDateBounds();
  return (
    <div className="flex flex-wrap gap-2">
      <input
        id={`bulk-date-${row.id}`}
        type="date"
        aria-label={`Date for ${row.file.name}`}
        value={dateStr}
        min={today}
        max={maxDay}
        disabled={disabled}
        onChange={(e) => {
          setDateStr(e.target.value);
          const d = combineDateTime(e.target.value, timeStr);
          if (!Number.isNaN(d.getTime())) onChange(d);
        }}
        className={cn(inputCls, "w-auto min-w-[9rem] flex-1 py-1.5")}
      />
      <input
        type="time"
        aria-label={`Time for ${row.file.name}`}
        value={timeStr}
        disabled={disabled}
        onChange={(e) => {
          setTimeStr(e.target.value);
          const d = combineDateTime(dateStr, e.target.value);
          if (!Number.isNaN(d.getTime())) onChange(d);
        }}
        className={cn(inputCls, "w-auto min-w-[7rem] flex-1 py-1.5")}
      />
    </div>
  );
}

function whenLabel(row: BulkRow, mode: ImportMode): string {
  if (mode === "queue") return "Next open time";
  if (mode === "draft") return "Draft";
  const t = row.scheduledAt.getTime();
  return Number.isNaN(t) ? "No time" : format(row.scheduledAt, "EEE d MMM, HH:mm");
}

export function ReviewRow({
  row,
  issues,
  selectedAccounts,
  mode,
  expanded,
  disabled,
  onToggleExpanded,
  onExpand,
  onUpdate,
  onToggleSkip,
  onRemove,
}: {
  row: BulkRow;
  issues: RowIssue[];
  selectedAccounts: AccountForForm[];
  mode: ImportMode;
  expanded: boolean;
  disabled: boolean;
  onToggleExpanded: () => void;
  onExpand: () => void;
  onUpdate: (patch: Partial<BulkRow>) => void;
  onToggleSkip: (platform: string) => void;
  onRemove: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const targets = accountsForRow(row, selectedAccounts);
  const supported = supportedPlatformsFor(row.kind);
  const selectedPlatforms = [...new Set(selectedAccounts.map((a) => a.platform))];
  const targetPlatforms = [...new Set(targets.map((a) => a.platform))];
  const limit = Math.min(CAPTION_MAX, getMostRestrictiveLimit(targets));
  const showTitle = row.kind === "video" && targetPlatforms.includes("youtube");
  const firstLine = row.caption.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const failedImport = row.status === "failed" && row.importError;
  const tone = errors.length > 0 || failedImport ? "danger" : warnings.length > 0 ? "warning" : "ok";
  const thumb = row.kind === "image" ? row.previewUrl : row.posterUrl;
  const bodyId = `bulk-row-body-${row.id}`;

  const runFix = (fix: IssueFix) => {
    switch (fix.type) {
      case "skip":
        onToggleSkip(fix.platform);
        return;
      case "remove":
        onRemove();
        return;
      case "caption":
        onExpand();
        focusLater(`bulk-caption-${row.id}`);
        return;
      case "title":
        onExpand();
        focusLater(`bulk-title-${row.id}`);
        return;
      case "time":
        onExpand();
        focusLater(`bulk-date-${row.id}`);
        return;
    }
  };

  return (
    <li
      className={cn(
        "rounded-xl border bg-bg-elevated transition-colors",
        tone === "danger" ? "border-danger-border" : "border-border",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5",
          tone === "danger" && "bg-danger-soft/40",
          expanded && "border-b border-border",
        )}
      >
        <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-bg-muted">
          {thumb ? (
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-text-muted">
              {row.kind === "image" ? <ImageIcon className="size-4" /> : <Film className="size-4" />}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="block truncate text-sm font-medium text-text">
            {row.file.name}
            {firstLine ? (
              <span className="font-normal text-text-muted"> · “{firstLine}”</span>
            ) : null}
          </span>
          <span
            className={cn(
              "block truncate text-xs",
              tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-text-muted",
            )}
          >
            {failedImport
              ? `Import failed: ${row.importError}`
              : errors[0]?.message ??
                warnings[0]?.message ??
                `${whenLabel(row, mode)} · ${formatBytes(row.file.size)}`}
          </span>
        </button>
        <div className="hidden shrink-0 md:block">
          <NetworkStack
            size={14}
            items={targetPlatforms.map((p) => ({ network: p }))}
          />
        </div>
        <span className="hidden w-32 shrink-0 text-right text-xs tabular-nums text-text-muted lg:block">
          {whenLabel(row, mode)}
        </span>
        {errors.length > 0 && errors[0].fixes[0] && !expanded ? (
          <button
            type="button"
            onClick={() => runFix(errors[0].fixes[0])}
            disabled={disabled}
            className="hidden h-8 shrink-0 items-center rounded-lg border border-border bg-bg-elevated px-2.5 text-xs font-medium text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:inline-flex"
          >
            {fixLabel(errors[0].fixes[0])}
          </button>
        ) : tone !== "ok" ? (
          // Ready rows carry no badge; only something to look at does.
          <span
            className={cn(
              "hidden shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium sm:inline-block",
              tone === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
            )}
          >
            {failedImport
              ? "Failed"
              : errors.length > 0
                ? `${errors.length} to fix`
                : `${warnings.length} note${warnings.length === 1 ? "" : "s"}`}
          </span>
        ) : (
          <span className="sr-only">Ready</span>
        )}
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={expanded ? `Collapse ${row.file.name}` : `Edit ${row.file.name}`}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <ChevronDown
            className={cn("size-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${row.file.name}`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>

      {expanded ? (
        <div id={bodyId} className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:p-4">
          <div className="relative mx-auto aspect-square w-32 overflow-hidden rounded-lg bg-bg-muted sm:mx-0">
            {thumb ? (
              <img src={thumb} alt={`Preview of ${row.file.name}`} className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-text-muted">
                {row.kind === "image" ? <ImageIcon className="size-6" /> : <Film className="size-6" />}
              </span>
            )}
            {row.kind === "video" ? (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                aria-label={`Play ${row.file.name}`}
                className="absolute inset-0 flex items-center justify-center bg-black/10 text-white transition-colors hover:bg-black/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                <span className="rounded-full bg-black/55 p-2">
                  <Play className="ml-0.5 size-5 fill-current" aria-hidden />
                </span>
              </button>
            ) : null}
          </div>

          <div className="min-w-0 space-y-3">
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <label htmlFor={`bulk-caption-${row.id}`} className="text-xs font-medium text-text-muted">
                  Caption
                </label>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    row.caption.trim().length > limit ? "text-danger" : "text-text-muted",
                  )}
                >
                  {row.caption.length} / {limit.toLocaleString()}
                </span>
              </div>
              <textarea
                id={`bulk-caption-${row.id}`}
                value={row.caption}
                disabled={disabled}
                onChange={(e) => onUpdate({ caption: e.target.value.slice(0, CAPTION_MAX) })}
                rows={4}
                placeholder={row.kind === "image" ? "Image caption…" : "Video caption…"}
                className={cn(inputCls, "resize-y")}
              />
            </div>

            {showTitle ? (
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label htmlFor={`bulk-title-${row.id}`} className="text-xs font-medium text-text-muted">
                    YouTube title
                  </label>
                  <span className="text-xs tabular-nums text-text-muted">
                    {row.youtubeTitle.length} / {YOUTUBE_TITLE_MAX}
                  </span>
                </div>
                <input
                  id={`bulk-title-${row.id}`}
                  type="text"
                  value={row.youtubeTitle}
                  maxLength={YOUTUBE_TITLE_MAX}
                  disabled={disabled}
                  onChange={(e) => onUpdate({ youtubeTitle: e.target.value.slice(0, YOUTUBE_TITLE_MAX) })}
                  placeholder="Title for YouTube…"
                  className={inputCls}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-text-muted">When</p>
                {mode === "schedule" ? (
                  <RowTimeInputs
                    row={row}
                    disabled={disabled}
                    onChange={(scheduledAt) => onUpdate({ scheduledAt })}
                  />
                ) : (
                  <p className="text-sm text-text">
                    {mode === "queue" ? "Takes the next open time in your schedule" : "Saved as a draft"}
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-text-muted">Post to</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Networks for this file">
                  {selectedPlatforms.map((p) => {
                    const unsupported = !supported.includes(p);
                    const skipped = row.skippedPlatforms.includes(p);
                    const on = !unsupported && !skipped;
                    return (
                      <button
                        key={p}
                        type="button"
                        disabled={unsupported || disabled}
                        aria-pressed={on}
                        onClick={() => onToggleSkip(p)}
                        title={
                          unsupported
                            ? `${networkName(p)} only takes videos`
                            : skipped
                              ? `Post this file to ${networkName(p)} again`
                              : `Don't post this file to ${networkName(p)}`
                        }
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                          on
                            ? "border-border bg-bg-elevated text-text hover:bg-bg-muted"
                            : "border-dashed border-border bg-transparent text-text-muted",
                          unsupported && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <NetworkIcon network={p} size={12} label="" />
                        <span className={cn(!on && "line-through")}>{networkName(p)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {failedImport || issues.length > 0 ? (
              <ul className="space-y-1.5" aria-label="Problems with this file">
                {failedImport ? (
                  <li className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-text">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0 flex-1">
                      Last try failed: {row.importError}. Fix anything below, then import again.
                    </span>
                  </li>
                ) : null}
                {issues.map((issue) => (
                  <li
                    key={issue.code}
                    className={cn(
                      "flex flex-wrap items-start gap-2 rounded-lg px-3 py-2 text-sm text-text",
                      issue.severity === "error" ? "bg-danger-soft" : "bg-warning-soft",
                    )}
                  >
                    {issue.severity === "error" ? (
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">{issue.message}</span>
                    {issue.fixes.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {issue.fixes.map((fix) => (
                          <button
                            key={fixLabel(fix)}
                            type="button"
                            disabled={disabled}
                            onClick={() => runFix(fix)}
                            className="inline-flex h-7 items-center rounded-md border border-border bg-bg-elevated px-2 text-xs font-medium text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
                          >
                            {fixLabel(fix)}
                          </button>
                        ))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {row.kind === "video" ? (
        <Dialog open={playing} onOpenChange={setPlaying}>
          <DialogContent className="sm:max-w-2xl">
            <DialogTitle className="truncate pr-8 text-base">{row.file.name}</DialogTitle>
            {playing ? (
              <video
                src={row.previewUrl}
                className="aspect-video w-full rounded-lg bg-black object-contain"
                controls
                autoPlay
                muted
                playsInline
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </li>
  );
}
