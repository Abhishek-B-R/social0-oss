import { useId, useRef, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import Link from "@/components/AppLink";
import { InlineError, useDashboardPath } from "@/components/app";
import { Button } from "@/components/ui/button";
import { PinterestAccountSettings } from "@/components/PinterestAccountSettings";
import { XPostSettingsInline } from "@/components/XPostSettingsInline";
import { BulkAutoFeaturesCard } from "@/components/bulk-tools/BulkAutoFeaturesCard";
import { formatSchedulePreview, patternFitsInDay } from "@/lib/bulk-schedule";
import { getPinterestBoardRequiredMessage } from "@/lib/pinterest-board-validation";
import { cn } from "@/lib/utils";
import {
  CAPTION_MAX,
  GAP_HOURS_OPTIONS,
  PER_DAY_OPTIONS,
  YOUTUBE_TITLE_MAX,
  effectiveGap,
  fitGapHours,
  scheduleDateBounds,
} from "./bulk-import-model";
import { CSV_FIELD_LABEL, type CsvField } from "./bulk-import-csv";
import { ModeSwitch } from "./ModeSwitch";
import type { BulkImportState } from "./use-bulk-import";

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-bg-elevated p-4 sm:p-5">
      <h2 id={id} className="text-sm font-semibold text-text">
        {title}
      </h2>
      {description ? <p className="mt-0.5 text-sm text-text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Next open queue time, or what to do when there is none. */
export function QueueSummary({ wiz }: { wiz: BulkImportState }) {
  const dash = useDashboardPath();
  const q = wiz.nextSlot;
  if (q.isLoading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-text-muted" role="status">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        Checking your posting schedule…
      </p>
    );
  }
  const res = q.data;
  if (q.isError || (res && !res.ok)) {
    return (
      <InlineError
        message={res && !res.ok ? res.error : "Couldn't read your posting schedule."}
        onRetry={() => void q.refetch()}
      />
    );
  }
  if (res?.ok && !res.slot) {
    return (
      <p className="text-sm text-text-muted">
        Your posting schedule has no open times.{" "}
        <Link href={dash("settings/schedule")} className="font-medium text-accent hover:underline">
          Set posting times
        </Link>{" "}
        or pick Schedule.
      </p>
    );
  }
  if (res?.ok && res.slot) {
    return (
      <p className="text-sm text-text-muted">
        The first post takes the next open time,{" "}
        <span className="font-medium text-text">{res.slot.label}</span>
        {res.timezone ? ` (${res.timezone})` : ""}. Each next post takes the
        open time after that.
      </p>
    );
  }
  return null;
}

function CsvCard({ wiz }: { wiz: BulkImportState }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const csv = wiz.csv;
  const preview = wiz.csvPreview;
  const total = wiz.pendingRows.length;
  const hasVideo = wiz.pendingRows.some((r) => r.kind === "video");
  const fields: CsvField[] = ["file", "caption", ...(hasVideo ? (["youtubeTitle"] as const) : []), "date", "time"];

  return (
    // Second column of the Captions section: a divider, not a box in a box.
    <div className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">From a spreadsheet</p>
        <p className="mt-0.5 text-xs text-text-muted">
          A CSV with a row per file. Match by file name, or rows go to files in order.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.tsv,text/tab-separated-values,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void wiz.loadCsv(f);
        }}
      />

      {!csv ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Upload CSV
          </Button>
          <p className="mt-2 text-xs text-text-muted">
            Columns like <code className="rounded bg-bg-muted px-1">file</code>,{" "}
            <code className="rounded bg-bg-muted px-1">caption</code>,{" "}
            <code className="rounded bg-bg-muted px-1">youtube title</code>,{" "}
            <code className="rounded bg-bg-muted px-1">date</code> (2026-03-14 09:30).
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-bg-subtle px-3 py-2">
            <span className="truncate text-sm text-text">
              {csv.fileName}{" "}
              <span className="text-text-muted">
                · {csv.table.rows.length} row{csv.table.rows.length === 1 ? "" : "s"}
              </span>
            </span>
            <button
              type="button"
              onClick={wiz.clearCsv}
              aria-label="Remove spreadsheet"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-muted hover:text-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field} className="block text-xs">
                <span className="mb-1 block font-medium text-text-muted">{CSV_FIELD_LABEL[field]}</span>
                <select
                  value={csv.mapping[field]}
                  onChange={(e) =>
                    wiz.setCsvMapping({ ...csv.mapping, [field]: Number(e.target.value) })
                  }
                  className={cn(inputCls, "py-1.5")}
                >
                  <option value={-1}>{field === "file" ? "Match by order" : "Not used"}</option>
                  {csv.table.headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {preview ? (
            <ul className="space-y-0.5 text-xs text-text-muted" aria-live="polite">
              <li className={cn(preview.matched > 0 ? "text-text" : "text-danger")}>
                Matched {preview.matched} of {total} file{total === 1 ? "" : "s"}{" "}
                {preview.byName ? "by file name" : "by row order"}.
              </li>
              {preview.unmatchedRows > 0 ? (
                <li>
                  {preview.unmatchedRows} spreadsheet row{preview.unmatchedRows === 1 ? " has" : "s have"} no matching file.
                </li>
              ) : null}
              {preview.badDates > 0 ? (
                <li className="text-warning">
                  {preview.badDates} date{preview.badDates === 1 ? "" : "s"} couldn't be read. Use a format like 2026-03-14 09:30.
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={wiz.applyCsv} disabled={!preview || preview.matched === 0}>
              Use these values
            </Button>
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
              Replace file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MapStep({
  wiz,
  onBack,
  onContinue,
}: {
  wiz: BulkImportState;
  onBack: () => void;
  onContinue: () => void;
}) {
  const total = wiz.pendingRows.length;
  const videoCount = wiz.pendingRows.filter((r) => r.kind === "video").length;
  const showYoutube = wiz.hasYouTube && videoCount > 0;
  const p = wiz.pattern;
  const preview = total > 0 ? formatSchedulePreview(total, p.startTime, p.perDay, effectiveGap(p)) : null;
  const { min: today, max: maxDay } = scheduleDateBounds();
  const showPinterest = wiz.pinterestAccounts.length > 0;
  const pinterestMsg = showPinterest
    ? getPinterestBoardRequiredMessage(wiz.pinterestAccounts, wiz.pinterestSettings, "schedule")
    : null;
  const captionId = useId();
  const titleId = useId();

  return (
    <div className="space-y-5">
      <Section
        title="Captions"
        description="Fill every file at once, or skip this and write each caption in the review step."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label htmlFor={captionId} className="text-sm font-medium text-text">
                  Same caption for every file
                </label>
                <span className="text-xs tabular-nums text-text-muted">
                  {wiz.bulkCaption.length} / {CAPTION_MAX}
                </span>
              </div>
              <textarea
                id={captionId}
                value={wiz.bulkCaption}
                onChange={(e) => wiz.setBulkCaption(e.target.value.slice(0, CAPTION_MAX))}
                rows={4}
                placeholder="Write a caption…"
                className={cn(inputCls, "resize-y")}
              />
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={wiz.applyCaptionToAll}
                disabled={!wiz.bulkCaption.trim() || total === 0}
              >
                Add to all {total} file{total === 1 ? "" : "s"}
              </Button>
            </div>
            {showYoutube ? (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <label htmlFor={titleId} className="text-sm font-medium text-text">
                    Same YouTube title for every video
                  </label>
                  <span className="text-xs tabular-nums text-text-muted">
                    {wiz.bulkYoutubeTitle.length} / {YOUTUBE_TITLE_MAX}
                  </span>
                </div>
                <input
                  id={titleId}
                  type="text"
                  value={wiz.bulkYoutubeTitle}
                  maxLength={YOUTUBE_TITLE_MAX}
                  onChange={(e) => wiz.setBulkYoutubeTitle(e.target.value.slice(0, YOUTUBE_TITLE_MAX))}
                  placeholder="Title for YouTube…"
                  className={inputCls}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={wiz.applyYoutubeTitleToAll}
                  disabled={!wiz.bulkYoutubeTitle.trim()}
                >
                  Add to all {videoCount} video{videoCount === 1 ? "" : "s"}
                </Button>
              </div>
            ) : null}
          </div>
          <CsvCard wiz={wiz} />
        </div>
      </Section>

      <Section title="When to post">
        <ModeSwitch value={wiz.mode} onChange={wiz.setMode} />
        <div className="mt-4">
          {wiz.mode === "schedule" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-text-muted">Start date</span>
                  <input
                    type="date"
                    value={p.startDate}
                    min={today}
                    max={maxDay}
                    onChange={(e) => e.target.value && wiz.setPattern({ ...p, startDate: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-text-muted">First post at</span>
                  <input
                    type="time"
                    value={p.startTime}
                    onChange={(e) => e.target.value && wiz.setPattern({ ...p, startTime: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-text-muted">Posts per day</span>
                  <select
                    value={p.perDay}
                    onChange={(e) => {
                      const perDay = Number(e.target.value);
                      wiz.setPattern({ ...p, perDay, gapHours: fitGapHours(perDay, p.gapHours) });
                    }}
                    className={inputCls}
                  >
                    {PER_DAY_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                {p.perDay > 1 ? (
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-text-muted">Time between posts</span>
                    <select
                      value={p.gapHours}
                      onChange={(e) => wiz.setPattern({ ...p, gapHours: Number(e.target.value) })}
                      className={inputCls}
                    >
                      {GAP_HOURS_OPTIONS.map((h) => (
                        // A day's posts must start before the next day's first one.
                        <option key={h} value={h} disabled={!patternFitsInDay(p.perDay, h)}>
                          {h < 1 ? "30 minutes" : `${h} hour${h === 1 ? "" : "s"}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              {preview ? (
                <div className="flex flex-col gap-2 rounded-lg bg-bg-subtle px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="whitespace-pre-line text-xs text-text">{preview}</p>
                  <Button variant="ghost" size="xs" className="self-start sm:self-auto" onClick={wiz.reapplyPattern}>
                    Reset all times to this pattern
                  </Button>
                </div>
              ) : null}
              <p className="text-xs text-text-muted">
                Times are in {wiz.timeZone} (this device). Changing the pattern
                resets every file's time, including times from a spreadsheet.
                You can still change single times in the review step.
              </p>
            </div>
          ) : wiz.mode === "queue" ? (
            <QueueSummary wiz={wiz} />
          ) : (
            <p className="text-sm text-text-muted">
              Each file becomes a draft. Nothing is scheduled; open them from
              Posts › Drafts when you're ready.
            </p>
          )}
        </div>
      </Section>

      {showPinterest || wiz.hasX ? (
        <Section title="Network settings" description="Applied to every post that goes to these networks.">
          <div className="space-y-5">
            {showPinterest ? (
              <div>
                <p className="mb-2 text-sm font-medium text-text">Pinterest</p>
                <PinterestAccountSettings
                  accounts={wiz.pinterestAccounts}
                  settingsByAccount={wiz.pinterestSettings}
                  setSettingsByAccount={wiz.setPinterestSettings}
                  selectedAccountIndex={wiz.pinterestTab}
                  setSelectedAccountIndex={wiz.setPinterestTab}
                />
                {pinterestMsg ? (
                  <p className="mt-2 text-xs text-warning">{pinterestMsg}</p>
                ) : null}
              </div>
            ) : null}
            {wiz.hasX ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium text-text">X</p>
                  <XPostSettingsInline value={wiz.xSettings} onChange={wiz.setXSettings} isVisible />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-text">X automations</p>
                  <p className="mb-2 text-xs text-text-muted">
                    Run after each post publishes on X. They show up on the
                    Automations page.
                  </p>
                  <BulkAutoFeaturesCard
                    selectedAccountIds={wiz.selectedAccounts.map((a) => a.id)}
                    allAccounts={wiz.accounts}
                    value={{ autoRepost: wiz.autoRepost, autoPlug: wiz.autoPlug }}
                    onChange={wiz.setAutoFeatures}
                    remember={wiz.rememberAutoFeatures}
                    onRememberChange={wiz.setRememberAutoFeatures}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onContinue} disabled={total === 0}>
          Review {total} file{total === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
