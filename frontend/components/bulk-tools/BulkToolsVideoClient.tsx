"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { AccountBubbleSelector } from "@/components/AccountBubbleSelector";
import { PLATFORMS } from "@/lib/platforms";
import { useRememberedAccounts } from "@/lib/remembered-accounts";
import { BulkUploadZone } from "./BulkUploadZone";
import { VideoCard, type VideoItem } from "./VideoCard";
import { BulkScheduleSettings } from "./BulkScheduleSettings";
import {
  computeBulkSchedule,
  formatSchedulePreview,
} from "@/lib/bulk-schedule";
import { createPost } from "@/app/actions/posts";

const MAX_VIDEOS = 100;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB - API may limit to 100MB
const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-msvideo";

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
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
function getNowTimeStr(): string {
  const d = new Date();
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

const REMEMBER_KEY_VIDEO = "bulk-video";

export function BulkToolsVideoClient({ accounts }: { accounts: Account[] }) {
  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const validIds = useMemo(
    () => new Set(selectableAccounts.map((a) => a.id)),
    [selectableAccounts],
  );
  const { remember, setRemember, getInitialSelectedIds, persistSelection } =
    useRememberedAccounts(REMEMBER_KEY_VIDEO);

  const [items, setItems] = useState<VideoItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    getInitialSelectedIds(validIds),
  );
  const [accountSearch, setAccountSearch] = useState("");
  const [bulkCaption, setBulkCaption] = useState("");
  const [startDate, setStartDate] = useState(getTodayStr);
  const [startTime, setStartTime] = useState(getNowTimeStr);
  const [videosPerDay, setVideosPerDay] = useState(1);
  const [gapHours, setGapHours] = useState(2);
  // const [coverFrame, setCoverFrame] = useState<CoverFrame>("middle");
  const [scheduling, setScheduling] = useState(false);
  const [progress, setProgress] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const platformName = (id: string) =>
    PLATFORMS.find((p) => p.id === id)?.name ?? id;

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const q = accountSearch.toLowerCase().trim();
    return accounts.filter((a) => {
      const platformDisplay =
        PLATFORMS.find((p) => p.id === a.platform)?.name ?? a.platform;
      return (
        a.platformUsername?.toLowerCase().includes(q) ||
        a.platform?.toLowerCase().includes(q) ||
        platformDisplay.toLowerCase().includes(q)
      );
    });
  }, [accounts, accountSearch]);

  useEffect(() => {
    if (remember) persistSelection(selectedIds);
  }, [remember, selectedIds, persistSelection]);

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    if (selectableAccounts.every((a) => selectedIds.has(a.id)))
      setSelectedIds(new Set());
    else setSelectedIds(new Set(selectableAccounts.map((a) => a.id)));
  };

  const addFiles = useCallback((files: File[]) => {
    setItems((prev) => {
      const toAdd = files.slice(0, Math.max(0, MAX_VIDEOS - prev.length));
      const now = new Date();
      const newItems: VideoItem[] = toAdd.map((file, i) => ({
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

  const effectiveGapHours = videosPerDay === 1 ? 24 : gapHours;

  const applyBulkSchedule = () => {
    const [h, m] = startTime.split(":").map(Number);
    const start = new Date(startDate + "T00:00:00");
    const dates = computeBulkSchedule(
      items.length,
      start,
      h ?? 0,
      m ?? 0,
      videosPerDay,
      effectiveGapHours,
    );
    setItems((prev) =>
      prev.map((it, i) => ({ ...it, scheduledAt: dates[i] ?? it.scheduledAt })),
    );
  };

  useEffect(() => {
    if (items.length === 0) return;
    const [h, m] = startTime.split(":").map(Number);
    const start = new Date(startDate + "T00:00:00");
    const dates = computeBulkSchedule(
      items.length,
      start,
      h ?? 0,
      m ?? 0,
      videosPerDay,
      effectiveGapHours,
    );
    setItems((prev) =>
      prev.map((it, i) => ({ ...it, scheduledAt: dates[i] ?? it.scheduledAt })),
    );
  }, [items.length, startDate, startTime, videosPerDay, effectiveGapHours]);

  const schedulePreview =
    items.length > 0
      ? formatSchedulePreview(
          items.length,
          startTime,
          videosPerDay,
          effectiveGapHours,
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
        setProgress(`Scheduling video ${i + 1} of ${items.length}...`);
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
    <div className="space-y-6 -ml-2 sm:-ml-3 lg:-ml-4">
      <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
        Bulk Video Scheduling
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
          Beta
        </span>
      </h1>

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 p-6 text-center">
          <p className="font-semibold text-emerald-800 dark:text-emerald-200">
            All videos scheduled successfully.
          </p>
          <Link
            href="/dashboard/calendar"
            className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            View Calendar →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-semibold text-foreground">
                  Post to
                </label>
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="search"
                    placeholder="Search accounts..."
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    className="h-9 flex-1 min-w-0 max-w-[220px] rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                  />
                  <label className="flex shrink-0 items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="rounded border-input bg-bg text-accent focus:ring-accent"
                    />
                    <span className="text-sm text-muted-foreground">
                      Remember
                    </span>
                  </label>
                </div>
              </div>
              <AccountBubbleSelector
                accounts={filteredAccounts}
                selectedIds={selectedIds}
                onToggleAccount={toggleAccount}
                selectAll={selectAll}
                platformName={platformName}
              />
            </div>

            <BulkUploadZone
              accept={VIDEO_ACCEPT}
              maxFiles={MAX_VIDEOS}
              maxSizeBytes={MAX_VIDEO_BYTES}
              maxSizeLabel="MP4, MOV, AVI. Max 500MB each."
              onFilesSelected={addFiles}
              disabled={items.length >= MAX_VIDEOS}
            />

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">
                Your Videos ({items.length})
              </h2>
              <div className="space-y-3">
                {items.map((item) => (
                  <VideoCard
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

          {/* Right column */}
          <div className="lg:col-span-1">
            <BulkScheduleSettings
              variant="video"
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
              // coverFrame={coverFrame}
              // onCoverFrameChange={setCoverFrame}
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
        <div className="rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900/60 px-4 py-3 text-sm font-medium border border-red-100">
          {error}
        </div>
      )}

      {scheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-card border border-border p-8 shadow-xl flex flex-col items-center gap-4">
            <p className="font-medium text-foreground">{progress}</p>
            <button
              type="button"
              onClick={() => {
                cancelledRef.current = true;
              }}
              className="rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-background transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
