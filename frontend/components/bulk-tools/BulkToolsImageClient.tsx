"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { AccountBubbleSelector } from "@/components/AccountBubbleSelector";
import { PLATFORMS } from "@/lib/platforms";
import { useRememberedAccounts } from "@/lib/remembered-accounts";
import { BulkUploadZone } from "./BulkUploadZone";
import { ImageCard, type ImageItem } from "./ImageCard";
import { BulkScheduleSettings } from "./BulkScheduleSettings";
import {
  computeBulkSchedule,
  formatSchedulePreview,
} from "@/lib/bulk-schedule";
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

const REMEMBER_KEY_IMAGE = "bulk-image";

export function BulkToolsImageClient({ accounts }: { accounts: Account[] }) {
  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const validIds = useMemo(
    () => new Set(selectableAccounts.map((a) => a.id)),
    [selectableAccounts]
  );
  const {
    remember,
    setRemember,
    getInitialSelectedIds,
    persistSelection,
  } = useRememberedAccounts(REMEMBER_KEY_IMAGE);

  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    getInitialSelectedIds(validIds)
  );
  const [accountSearch, setAccountSearch] = useState("");
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

  useEffect(() => {
    if (remember) persistSelection(selectedIds);
  }, [remember, selectedIds, persistSelection]);

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
      const toAdd = files.slice(0, Math.max(0, MAX_IMAGES - prev.length));
      const now = new Date();
      const newItems: ImageItem[] = toAdd.map((file, i) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
        scheduledAt: new Date(now.getTime() + (prev.length + i) * 60000),
        collapsed: false,
      }));
      return [...prev, ...newItems];
    });
  }, []);

  const toggleItemCollapsed = (id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, collapsed: it.collapsed !== true } : it,
      ),
    );
  };
  const collapseAll = () => {
    setItems((prev) => prev.map((it) => ({ ...it, collapsed: true })));
  };
  const expandAll = () => {
    setItems((prev) => prev.map((it) => ({ ...it, collapsed: false })));
  };

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
      ? formatSchedulePreview(items.length, startTime, videosPerDay, gapHours)
      : null;

  const handleScheduleAll = async () => {
    if (selectedIds.size === 0 || items.length === 0) return;

    // Require a caption for every image before scheduling
    const missingCaption = items.some((item) => !item.caption.trim());
    if (missingCaption) {
      setError("Caption is required for all images before scheduling.");
      return;
    }

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
      <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
        Bulk Image Scheduling
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
          Beta
        </span>
      </h1>

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 p-6 text-center">
          <p className="font-semibold text-emerald-800 dark:text-emerald-200">
            All images scheduled successfully.
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
                    <span className="text-sm text-muted-foreground">Remember</span>
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
              accept={IMAGE_ACCEPT}
              maxFiles={MAX_IMAGES}
              maxSizeBytes={MAX_IMAGE_BYTES}
              maxSizeLabel="JPG, PNG, WEBP, GIF. Max 50MB each."
              onFilesSelected={addFiles}
              disabled={items.length >= MAX_IMAGES}
            />

            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">
                  Your Images ({items.length})
                </h2>
                {items.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={collapseAll}
                      className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
                    >
                      Collapse all
                    </button>
                    <button
                      type="button"
                      onClick={expandAll}
                      className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
                    >
                      Expand all
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <ImageCard
                    key={item.id}
                    item={item}
                    index={index}
                    onCaptionChange={updateCaption}
                    onScheduleChange={updateSchedule}
                    onDelete={removeItem}
                    onToggleCollapsed={toggleItemCollapsed}
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
