"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { AccountBubbleSelector } from "@/components/AccountBubbleSelector";
import { PLATFORMS } from "@/lib/platforms";
import { BulkUploadZone } from "./BulkUploadZone";
import { ImageCard, type ImageItem } from "./ImageCard";
import { BulkScheduleSettings } from "./BulkScheduleSettings";
import { computeBulkSchedule, formatSchedulePreview } from "@/lib/bulk-schedule";
import { createPost } from "@/app/actions/posts";

const MAX_IMAGES = 100;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50MB - API may limit to 10MB
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  tokenExpired?: boolean;
};

function getTodayStr(): string {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function getNowTimeStr(): string {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

export function BulkToolsImageClient({ accounts }: { accounts: Account[] }) {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCaption, setBulkCaption] = useState("");
  const [startDate, setStartDate] = useState(getTodayStr);
  const [startTime, setStartTime] = useState(getNowTimeStr);
  const [videosPerDay, setVideosPerDay] = useState(1);
  const [gapHours, setGapHours] = useState(2);
  const [scheduling, setScheduling] = useState(false);
  const [progress, setProgress] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const platformName = (id: string) =>
    PLATFORMS.find((p) => p.id === id)?.name ?? id;

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const selectAll = () => {
    if (selectableAccounts.every((a) => selectedIds.has(a.id)))
      setSelectedIds(new Set());
    else setSelectedIds(new Set(selectableAccounts.map((a) => a.id)));
  };

  const addFiles = useCallback((files: File[]) => {
    setItems((prev) => {
      const toAdd = files.slice(0, Math.max(0, MAX_IMAGES - prev.length));
      const now = new Date();
      const newItems: ImageItem[] = toAdd.map((file, i) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
        scheduledAt: new Date(now.getTime() + (prev.length + i) * 60000),
      }));
      return [...prev, ...newItems];
    });
  }, []);

  const updateCaption = (id: string, caption: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, caption } : it)),
    );
  };
  const updateSchedule = (id: string, date: Date) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, scheduledAt: date } : it)),
    );
  };
  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const applyBulkCaption = () => {
    const capped = bulkCaption.slice(0, 2200);
    setItems((prev) => prev.map((it) => ({ ...it, caption: capped })));
  };

  const applyBulkSchedule = () => {
    const [h, m] = startTime.split(":").map(Number);
    const start = new Date(startDate + "T00:00:00");
    const dates = computeBulkSchedule(
      items.length,
      start,
      h ?? 0,
      m ?? 0,
      videosPerDay,
      gapHours,
    );
    setItems((prev) =>
      prev.map((it, i) => ({ ...it, scheduledAt: dates[i] ?? it.scheduledAt })),
    );
  };

  const schedulePreview =
    items.length > 0
      ? formatSchedulePreview(
          items.length,
          startTime,
          videosPerDay,
          gapHours,
        )
      : null;

  const handleScheduleAll = async () => {
    if (selectedIds.size === 0 || items.length === 0) return;
    setError(null);
    cancelledRef.current = false;
    setScheduling(true);
    const accountIds = Array.from(selectedIds);

    try {
      for (let i = 0; i < items.length; i++) {
        if (cancelledRef.current) break;
        setProgress(`Scheduling image ${i + 1} of ${items.length}...`);
        const item = items[i];
        const formData = new FormData();
        formData.append("file", item.file);
        const uploadRes = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}));
          throw new Error(data.error ?? `Upload failed: ${uploadRes.status}`);
        }
        const uploadData = (await uploadRes.json()) as { id: string };
        const result = await createPost(
          item.caption.trim() || "No caption",
          accountIds,
          "scheduled",
          item.scheduledAt,
          [uploadData.id],
        );
        if (!result.success) throw new Error(result.error);
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setScheduling(false);
      setProgress("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/bulk-tools"
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          ← Bulk tools
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm font-medium text-gray-900">
          Bulk Image Upload
        </span>
      </div>
      <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
        Bulk Image Scheduling
        <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
          Beta
        </span>
      </h1>

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="font-semibold text-emerald-800">
            All images scheduled successfully.
          </p>
          <Link
            href="/dashboard/calendar"
            className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            View Calendar →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <label className="mb-3 block text-sm font-semibold text-gray-900">
                Post to
              </label>
              <AccountBubbleSelector
                accounts={accounts}
                selectedIds={selectedIds}
                onToggleAccount={toggleAccount}
                selectAll={selectAll}
                platformName={platformName}
              />
            </div>

            <BulkUploadZone
              accept={IMAGE_ACCEPT}
              maxFiles={MAX_IMAGES}
              maxSizeBytes={MAX_IMAGE_BYTES}
              maxSizeLabel="JPG, PNG, WEBP, GIF. Max 50MB each."
              onFilesSelected={addFiles}
              disabled={items.length >= MAX_IMAGES}
            />

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Your Images ({items.length})
              </h2>
              <div className="space-y-3">
                {items.map((item) => (
                  <ImageCard
                    key={item.id}
                    item={item}
                    onCaptionChange={updateCaption}
                    onScheduleChange={updateSchedule}
                    onDelete={removeItem}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <BulkScheduleSettings
              variant="image"
              bulkCaption={bulkCaption}
              onBulkCaptionChange={setBulkCaption}
              onApplyCaption={applyBulkCaption}
              startDate={startDate}
              startTime={startTime}
              videosPerDay={videosPerDay}
              gapHours={gapHours}
              onStartDateChange={setStartDate}
              onStartTimeChange={setStartTime}
              onVideosPerDayChange={setVideosPerDay}
              onGapHoursChange={setGapHours}
              onApplyBulkSchedule={applyBulkSchedule}
              schedulePreview={schedulePreview}
              totalItems={items.length}
              selectedAccountCount={selectedIds.size}
              onScheduleAll={handleScheduleAll}
              scheduling={scheduling}
              progressLabel={progress}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-100">
          {error}
        </div>
      )}

      {scheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-white p-8 shadow-xl flex flex-col items-center gap-4">
            <p className="font-medium text-gray-900">{progress}</p>
            <button
              type="button"
              onClick={() => { cancelledRef.current = true; }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
