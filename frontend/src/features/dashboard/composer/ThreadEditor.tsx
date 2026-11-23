import { Plus, Trash2 } from "lucide-react";
import { AutoResizeTextarea } from "@/components/ui/AutoResizeTextarea";
import { cn } from "@/lib/utils";
import { MediaTray } from "./MediaTray";
import { THREAD_MAX_MEDIA_PER_POST } from "./rules";
import type { ComposerPart } from "./types";

type Props = {
  /** All parts; part 0 is edited by the main editor above. */
  parts: ComposerPart[];
  /** Strictest character limit across selected thread networks. */
  limit: number | null;
  onChangeText: (partId: string, text: string) => void;
  onAddFiles: (partId: string, files: File[]) => void;
  onRemoveMedia: (partId: string, mediaId: string) => void;
  onMoveMedia: (partId: string, from: number, to: number) => void;
  onRemovePart: (partId: string) => void;
  onAddPart: () => void;
  onPaste: (partId: string, e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
};

/** Posts 2…n of a thread, stacked with a connector line. */
export function ThreadEditor({
  parts,
  limit,
  onChangeText,
  onAddFiles,
  onRemoveMedia,
  onMoveMedia,
  onRemovePart,
  onAddPart,
  onPaste,
}: Props) {
  const rest = parts.slice(1);
  return (
    <div className="relative space-y-2 pl-5">
      <span
        aria-hidden
        className="absolute bottom-10 left-[7px] top-0 w-px bg-border"
      />
      {rest.map((part, i) => {
        const n = i + 2;
        const len = part.text.trim().length;
        const over = limit != null && len > limit;
        return (
          <div
            key={part.id}
            className="relative rounded-xl border border-border bg-bg-subtle p-3"
          >
            <span
              aria-hidden
              className="absolute -left-[17px] top-4 size-2.5 rounded-full border-2 border-bg-elevated bg-border"
            />
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor={`part-${part.id}`} className="text-xs font-semibold text-text-muted">
                Post {n}
              </label>
              <button
                type="button"
                onClick={() => onRemovePart(part.id)}
                aria-label={`Remove post ${n}`}
                className="inline-flex size-7 items-center justify-center rounded-lg text-text-muted hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:size-11"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
            <AutoResizeTextarea
              id={`part-${part.id}`}
              value={part.text}
              onChange={(e) => onChangeText(part.id, e.target.value)}
              onPaste={(e) => onPaste(part.id, e)}
              placeholder="What's in this post?"
              rows={2}
              maxHeight={220}
              className="w-full rounded-lg border border-input bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <div className="mt-2 flex items-end justify-between gap-2">
              <MediaTray
                media={part.media}
                size="sm"
                max={THREAD_MAX_MEDIA_PER_POST}
                label={`Media for post ${n}`}
                onAddFiles={(files) => onAddFiles(part.id, files)}
                onRemove={(id) => onRemoveMedia(part.id, id)}
                onMove={(from, to) => onMoveMedia(part.id, from, to)}
              />
              <span
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  over ? "text-warning" : "text-text-muted",
                )}
                aria-live="polite"
              >
                {len}
                {limit != null ? `/${limit}` : ""}
              </span>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAddPart}
        className="relative flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span
          aria-hidden
          className="absolute -left-[17px] top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-bg-elevated bg-border"
        />
        <Plus className="size-3.5" aria-hidden />
        Add another post
      </button>
    </div>
  );
}
