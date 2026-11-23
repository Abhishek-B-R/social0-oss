import { useRef, useState } from "react";
import { Crop, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { instagramCropRatio, ratioLabel } from "./media-intake";
import type { ComposerMedia } from "./types";

function VideoBadge() {
  return (
    <span
      className="pointer-events-none absolute right-1 bottom-1 inline-flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-2.5 translate-x-px fill-current">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

function duration(sec?: number): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  media: ComposerMedia[];
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  /** Crop an image for Instagram (shown only when Instagram is selected). */
  onCropForInstagram?: (id: string, ratio: number) => void;
  /** Max items (threads: 4 per post). */
  max?: number;
  addDisabledReason?: string | null;
  size?: "md" | "sm";
  label?: string;
};

/**
 * Thumbnails with order numbers, ratio badges and the "Crop 4:5 for IG"
 * fix. Drag to reorder (Alt + ←/→ with the keyboard).
 */
export function MediaTray({
  media,
  onAddFiles,
  onRemove,
  onMove,
  onCropForInstagram,
  max,
  addDisabledReason,
  size = "md",
  label = "Media",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const full = max != null && media.length >= max;
  const addDisabled = full || !!addDisabledReason;
  const box = size === "md" ? "size-[74px]" : "size-16";

  return (
    <div className="flex flex-wrap items-start gap-2" role="list" aria-label={label}>
      {media.map((m, i) => {
        const ratio = ratioLabel(m.width, m.height);
        const crop = onCropForInstagram ? instagramCropRatio(m) : null;
        const dur = m.kind === "video" ? duration(m.durationSec) : null;
        return (
          <div
            key={m.id}
            role="listitem"
            tabIndex={0}
            draggable
            aria-label={`${m.kind === "video" ? "Video" : "Image"} ${i + 1} of ${media.length}${ratio ? `, ${ratio}` : ""}. Alt and arrow keys to reorder.`}
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/x-composer-media", m.id);
            }}
            onDragOver={(e) => {
              if (dragIndex == null) return;
              e.preventDefault();
              if (dragIndex !== i) {
                onMove(dragIndex, i);
                setDragIndex(i);
              }
            }}
            onDragEnd={() => setDragIndex(null)}
            onKeyDown={(e) => {
              if (!e.altKey) return;
              if (e.key === "ArrowLeft" && i > 0) {
                e.preventDefault();
                onMove(i, i - 1);
              } else if (e.key === "ArrowRight" && i < media.length - 1) {
                e.preventDefault();
                onMove(i, i + 1);
              } else if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                onRemove(m.id);
              }
            }}
            className={cn(
              "group relative shrink-0 cursor-grab overflow-hidden rounded-lg border bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 active:cursor-grabbing",
              box,
              crop ? "border-warning-border ring-1 ring-warning-border" : "border-border",
              dragIndex === i && "opacity-60",
            )}
          >
            {m.kind === "image" ? (
              <img
                src={m.previewUrl}
                alt=""
                draggable={false}
                className="pointer-events-none size-full object-cover"
              />
            ) : (
              <>
                <video
                  src={m.previewUrl}
                  poster={m.posterUrl}
                  muted
                  playsInline
                  preload="metadata"
                  draggable={false}
                  className="pointer-events-none size-full object-cover"
                />
                <VideoBadge />
              </>
            )}
            {media.length > 1 ? (
              <span className="pointer-events-none absolute left-1 top-1 inline-flex min-w-4 items-center justify-center rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
                {i + 1}
              </span>
            ) : null}
            {ratio || dur ? (
              <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] font-medium text-white">
                {[ratio, dur].filter(Boolean).join(" · ")}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(m.id)}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label={`Remove ${m.kind} ${i + 1}`}
              className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80 focus-visible:opacity-100 hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:group-focus-within:opacity-100 touch:size-7"
            >
              <X className="size-3" aria-hidden />
            </button>
            {crop && onCropForInstagram ? (
              <button
                type="button"
                onClick={() => onCropForInstagram(m.id, crop)}
                className="absolute inset-x-1 bottom-5 inline-flex items-center justify-center gap-0.5 rounded bg-warning-solid px-1 py-0.5 text-[9px] font-semibold text-warning-solid-foreground shadow-sm hover:brightness-110"
                title={`Center-crop this image to ${crop === 1.91 ? "1.91:1" : "4:5"} so Instagram doesn't reject or crop it`}
              >
                <Crop className="size-2.5" aria-hidden />
                {crop === 1.91 ? "Crop 1.91:1" : "Crop 4:5"} for IG
              </button>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={addDisabled}
        title={
          full
            ? `Up to ${max} per post`
            : (addDisabledReason ?? "Add images or videos · drop or paste works too")
        }
        className={cn(
          "inline-flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-[1.5px] border-dashed border-border text-xs font-medium text-text-muted transition-colors hover:border-accent/60 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50",
          box,
        )}
      >
        <Plus className="size-4" aria-hidden />
        Media{max ? ` (${media.length}/${max})` : ""}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onAddFiles(files);
        }}
      />
    </div>
  );
}
