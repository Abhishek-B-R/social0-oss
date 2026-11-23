import { useRef, useState, type DragEvent } from "react";
import { Film, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { BulkAccountPicker } from "@/components/bulk-tools/BulkAccountPicker";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/app";
import { formatBytes } from "@/lib/media-limits";
import { cn } from "@/lib/utils";
import { LIMITS, networkName, type BulkKind } from "./bulk-import-model";
import type { BulkImportState } from "./use-bulk-import";

function Thumb({ row }: { row: BulkImportState["rows"][number] }) {
  const src = row.kind === "image" ? row.previewUrl : row.posterUrl;
  return src ? (
    <img src={src} alt="" className="size-full object-cover" />
  ) : (
    <span className="flex size-full items-center justify-center text-text-muted">
      {row.kind === "image" ? <ImageIcon className="size-5" /> : <Film className="size-5" />}
    </span>
  );
}

export function UploadStep({
  wiz,
  onContinue,
}: {
  wiz: BulkImportState;
  onContinue: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const q = accountSearch.trim().toLowerCase();
  const filteredAccounts = q
    ? wiz.accounts.filter(
        (a) =>
          a.platformUsername?.toLowerCase().includes(q) ||
          a.platform.toLowerCase().includes(q) ||
          networkName(a.platform).toLowerCase().includes(q),
      )
    : wiz.accounts;
  const accept = wiz.acceptKinds.flatMap((k) => [...LIMITS[k].accept]).join(",");
  const rows = wiz.pendingRows;
  const usage = (kind: BulkKind) => {
    const list = rows.filter((r) => r.kind === kind);
    return {
      count: list.length,
      bytes: list.reduce((n, r) => n + r.file.size, 0),
    };
  };
  const images = usage("image");
  const videos = usage("video");

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void wiz.addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const what =
    wiz.scope === "image" ? "images" : wiz.scope === "video" ? "videos" : "images or videos";
  const canContinue = rows.length > 0 && wiz.selectedAccounts.length > 0 && wiz.probing === 0;
  const unsupportedForImages =
    wiz.acceptKinds.includes("image") && images.count > 0 && wiz.selectedPlatforms.has("youtube");

  return (
    <div className="space-y-5">
      <BulkAccountPicker
        selectableAccounts={wiz.selectableAccounts}
        filteredAccounts={filteredAccounts}
        accountSearch={accountSearch}
        setAccountSearch={setAccountSearch}
        selectedIds={wiz.selectedIds}
        toggleAccount={wiz.toggleAccount}
        selectAll={wiz.toggleAllAccounts}
        remember={wiz.remember}
        onRememberChange={wiz.setRemember}
        accountsLoading={wiz.accountsLoading}
        platformName={networkName}
        supportedPlatforms={wiz.supportedPlatforms}
      />

      <section aria-labelledby="bulk-files-title" className="rounded-2xl border border-border bg-bg-elevated p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="bulk-files-title" className="text-sm font-semibold text-text">
            Files
          </h2>
          {rows.length > 0 ? (
            <button
              type="button"
              onClick={wiz.clearRows}
              className="text-xs font-medium text-text-muted hover:text-text"
            >
              Remove all
            </button>
          ) : null}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition-colors",
            rows.length > 0 ? "py-6" : "py-12",
            dragging ? "border-accent bg-accent/5" : "border-border bg-bg-subtle/40",
          )}
        >
          <Upload className="mb-2 size-6 text-text-muted" aria-hidden />
          <p className="text-sm font-medium text-text">Drop {what} here</p>
          <p className="mt-1 text-xs text-text-muted">
            {wiz.acceptKinds.includes("image")
              ? `Up to ${LIMITS.image.maxCount} images (${LIMITS.image.label}, ${formatBytes(LIMITS.image.maxTotalBytes)} total)`
              : null}
            {wiz.acceptKinds.length > 1 ? <br /> : null}
            {wiz.acceptKinds.includes("video")
              ? `Up to ${LIMITS.video.maxCount} videos under 5 minutes (${LIMITS.video.label})`
              : null}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void wiz.addFiles(files);
            }}
          />
        </div>

        {wiz.probing > 0 ? (
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-text-muted" role="status">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Reading {wiz.probing} video{wiz.probing === 1 ? "" : "s"}…
          </p>
        ) : null}

        {rows.length > 0 ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {wiz.acceptKinds.includes("image") && images.count > 0 ? (
                <Meter
                  size="sm"
                  label={`${images.count} of ${LIMITS.image.maxCount} images`}
                  hint={`${formatBytes(images.bytes)} of ${formatBytes(LIMITS.image.maxTotalBytes)}`}
                  value={images.bytes}
                  max={LIMITS.image.maxTotalBytes}
                />
              ) : null}
              {wiz.acceptKinds.includes("video") && videos.count > 0 ? (
                <Meter
                  size="sm"
                  label={`${videos.count} of ${LIMITS.video.maxCount} videos`}
                  hint={`${formatBytes(videos.bytes)} of ${formatBytes(LIMITS.video.maxTotalBytes)}`}
                  value={videos.bytes}
                  max={LIMITS.video.maxTotalBytes}
                />
              ) : null}
            </div>
            <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8" aria-label="Added files">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-bg-muted"
                  title={row.file.name}
                >
                  <Thumb row={row} />
                  {row.kind === "video" ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                      {row.durationSec > 0
                        ? `${Math.floor(row.durationSec / 60)}:${String(Math.round(row.durationSec % 60)).padStart(2, "0")}`
                        : "Video"}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => wiz.removeRow(row.id)}
                    aria-label={`Remove ${row.file.name}`}
                    className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {unsupportedForImages ? (
        <p className="text-xs text-text-muted">
          YouTube only takes videos, so images will post to your other accounts.
        </p>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        {!canContinue && rows.length > 0 && wiz.selectedAccounts.length === 0 ? (
          <p className="text-xs text-text-muted sm:mr-auto">Pick at least one account to continue.</p>
        ) : null}
        <Button onClick={onContinue} disabled={!canContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
