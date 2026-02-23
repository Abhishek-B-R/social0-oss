"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";

const MAX_CAPTION = 2200;

export type ImageItem = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  scheduledAt: Date;
  mediaId?: string;
  mediaUrl?: string;
};

type ImageCardProps = {
  item: ImageItem;
  onCaptionChange: (id: string, caption: string) => void;
  onScheduleChange: (id: string, date: Date) => void;
  onDelete: (id: string) => void;
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

export function ImageCard({
  item,
  onCaptionChange,
  onScheduleChange,
  onDelete,
}: ImageCardProps) {
  const [dateStr, setDateStr] = useState(formatDateForInput(item.scheduledAt));
  const [timeStr, setTimeStr] = useState(formatTimeForInput(item.scheduledAt));

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
    <div className="relative flex gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="absolute top-3 right-3 rounded-lg p-1.5 text-red-500 hover:bg-red-50 transition-colors"
        aria-label="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        <img
          src={item.previewUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate text-sm font-medium text-gray-900">
          {item.file.name}
        </p>
        <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>
        <textarea
          value={item.caption}
          onChange={(e) => onCaptionChange(item.id, e.target.value.slice(0, MAX_CAPTION))}
          placeholder="Image caption..."
          rows={1}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">
            {item.caption.length} / {MAX_CAPTION}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateStr}
              onChange={handleDateChange}
              className="rounded border border-gray-200 px-2 py-1.5 text-gray-900"
            />
            <input
              type="time"
              value={timeStr}
              onChange={handleTimeChange}
              className="rounded border border-gray-200 px-2 py-1.5 text-gray-900"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
