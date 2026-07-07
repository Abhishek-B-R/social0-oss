
import { useState, useEffect } from "react";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";

const MAX_CAPTION = 2200;

export type ImageItem = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  scheduledAt: Date;
  mediaId?: string;
  mediaUrl?: string;
  /** When true, row shows compact view (thumbnail, filename, date/time, chevron). Default false = expanded. */
  collapsed?: boolean;
};

type ImageCardProps = {
  item: ImageItem;
  index: number;
  onCaptionChange: (id: string, caption: string) => void;
  onScheduleChange: (id: string, date: Date) => void;
  onDelete: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeForInput(d: Date): string {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function formatScheduledLabel(d: Date): string {
  const date = formatDateForInput(d);
  const time = formatTimeForInput(d);
  return `${date} ${time}`;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMaxDateStr(): string {
  const d = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ImageCard({
  item,
  index,
  onCaptionChange,
  onScheduleChange,
  onDelete,
  onToggleCollapsed,
}: ImageCardProps) {
  const [dateStr, setDateStr] = useState(formatDateForInput(item.scheduledAt));
  const [timeStr, setTimeStr] = useState(formatTimeForInput(item.scheduledAt));
  const collapsed = item.collapsed === true;

  useEffect(() => {
    setDateStr(formatDateForInput(item.scheduledAt));
    setTimeStr(formatTimeForInput(item.scheduledAt));
  }, [item.scheduledAt]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setDateStr(v);
    const [y, m, day] = v.split("-").map(Number);
    if (y && m && day) {
      const d = new Date(item.scheduledAt);
      d.setFullYear(y, m - 1, day);
      onScheduleChange(item.id, d);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setTimeStr(v);
    const [h, m] = v.split(":").map(Number);
    if (h !== undefined && m !== undefined) {
      const d = new Date(item.scheduledAt);
      d.setHours(h, m, 0, 0);
      onScheduleChange(item.id, d);
    }
  };

  return (
    <div
      className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-[max-height] duration-200 ease-in-out"
      style={{ maxHeight: collapsed ? 72 : 800 }}
    >
      {collapsed ? (
        <div className="flex items-center gap-3 px-4 py-2 min-h-[60px]">
          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
            <img
              src={item.previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <span className="truncate text-sm font-medium text-foreground">
              #{index + 1} {item.file.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatScheduledLabel(item.scheduledAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onToggleCollapsed(item.id)}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Expand row"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="relative flex gap-4 p-4">
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="absolute top-3 right-3 rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onToggleCollapsed(item.id)}
            className="absolute top-3 right-12 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Collapse row"
          >
            <ChevronUp className="h-4 w-4" />
          </button>

          <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
            <img
              src={item.previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-sm font-medium text-foreground">
              {item.file.name}
            </p>
            <p className="text-xs text-muted-foreground">{formatFileSize(item.file.size)}</p>
            <textarea
              value={item.caption}
              onChange={(e) => onCaptionChange(item.id, e.target.value.slice(0, MAX_CAPTION))}
              placeholder="Image caption..."
              rows={5}
              className="w-full resize-y min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {item.caption.length} / {MAX_CAPTION}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateStr}
                  onChange={handleDateChange}
                  min={getTodayStr()}
                  max={getMaxDateStr()}
                  className="rounded border border-input bg-background px-2 py-1.5 text-foreground"
                />
                <input
                  type="time"
                  value={timeStr}
                  onChange={handleTimeChange}
                  className="rounded border border-input bg-background px-2 py-1.5 text-foreground"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
