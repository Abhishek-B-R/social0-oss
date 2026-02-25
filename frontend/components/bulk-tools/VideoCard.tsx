"use client";

import { useRef, useEffect, useState } from "react";
import { Trash2, Video } from "lucide-react";

const MAX_CAPTION = 2200;

export type VideoItem = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  scheduledAt: Date;
  /** Set after upload */
  mediaId?: string;
  mediaUrl?: string;
};

type VideoCardProps = {
  item: VideoItem;
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

export function VideoCard({
  item,
  onCaptionChange,
  onScheduleChange,
  onDelete,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbReady, setThumbReady] = useState(false);
  const [dateStr, setDateStr] = useState(formatDateForInput(item.scheduledAt));
  const [timeStr, setTimeStr] = useState(formatTimeForInput(item.scheduledAt));

  useEffect(() => {
    setDateStr(formatDateForInput(item.scheduledAt));
    setTimeStr(formatTimeForInput(item.scheduledAt));
  }, [item.scheduledAt]);

  const handleSeeked = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState >= 2) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          setThumbReady(true);
        }
      }
    }
  };

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

      <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100 relative">
        <video
          ref={videoRef}
          src={item.previewUrl}
          className="absolute inset-0 h-full w-full object-cover opacity-0 pointer-events-none"
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.duration && isFinite(v.duration)) v.currentTime = 0.1;
          }}
          onSeeked={handleSeeked}
        />
        <canvas
          ref={canvasRef}
          className="h-full w-full object-cover block"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {!thumbReady && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-100">
            <Video className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate text-sm font-medium text-gray-900">
          {item.file.name}
        </p>
        <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>
        <textarea
          value={item.caption}
          onChange={(e) => onCaptionChange(item.id, e.target.value.slice(0, MAX_CAPTION))}
          placeholder="Video caption..."
          rows={5}
          className="w-full resize-y min-h-[120px] rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
