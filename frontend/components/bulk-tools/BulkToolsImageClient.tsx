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
import { uploadFile } from "@/lib/upload-file";

const LIMITS = {
  totalSize: 250 * 1024 * 1024, // 250MB total batch
  maxCount: 100, // 100 images max count (global)
  maxPerSlot: 50, // 50 images per bulk slot/session
};
const MAX_IMAGES = LIMITS.maxCount;
const MAX_IMAGES_PER_SLOT = LIMITS.maxPerSlot;
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

export function BulkToolsImageClient({
  accounts,
  supportedPlatforms,
}: {
  accounts: Account[];
  supportedPlatforms?: string[];
}) {
  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const validIds = useMemo(
    () => new Set(selectableAccounts.map((a) => a.id)),
    [selectableAccounts],
  );
  const { remember, setRemember, getInitialSelectedIds, persistSelection } =
    useRememberedAccounts(REMEMBER_KEY_IMAGE);

  const [items, setItems] = useState<ImageItem[]>([]);
  const totalSelectedBytes = useMemo(
    () => items.reduce((sum, it) => sum + (it.file?.size ?? 0), 0),
    [items],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    getInitialSelectedIds(validIds),
  );
  const [accountSearch, setAccountSearch] = useState("");
  const [bulkCaption, setBulkCaption] = useState("");
  const [startDate, setStartDate] = useState(getTodayStr);
  const [startTime, setStartTime] = useState(getNowTimeStr);
  const [videosPerDay, setVideosPerDay] = useState(1);
  const [gapHours, setGapHours] = useState(2);
  const [scheduling, setScheduling] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
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

  const addFiles = useCallback(
    (files: File[]) => {
      setItems((prev) => {
        const toAdd = files.slice(
          0,
          Math.max(0, MAX_IMAGES_PER_SLOT - prev.length),
        );
        if (toAdd.length === 0) return prev;

        const [h, m] = startTime.split(":").map(Number);
        const start = new Date(startDate + "T00:00:00");
        const effectiveGapHours = videosPerDay === 1 ? 24 : gapHours;
        const dates = computeBulkSchedule(
          prev.length + toAdd.length,
          start,
          h ?? 0,
          m ?? 0,
          videosPerDay,
          effectiveGapHours,
        );

        const newItems: ImageItem[] = toAdd.map((file, i) => ({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          caption: "",
          scheduledAt: dates[prev.length + i] ?? new Date(),
          collapsed: false,
        }));
        return [...prev, ...newItems];
      });
    },
    [gapHours, startDate, startTime, videosPerDay],
  );

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
    setUploadPercent(0);
    setProgress(
      `Uploading ${items.length} image${items.length === 1 ? "" : "s"}… 0%`,
    );
    const accountIds = Array.from(selectedIds);

    try {
      // Phase 1: upload all images in parallel
      const perFileProgress = new Array(items.length).fill(0);
      const uploadResults = await Promise.allSettled(
        items.map((item, index) =>
          uploadFile(item.file, index, (idx, percent) => {
            perFileProgress[idx] = percent;
            const sum = perFileProgress.reduce((a, b) => a + b, 0);
            const avg =
              perFileProgress.length > 0
                ? Math.round(sum / perFileProgress.length)
                : percent;
            setUploadPercent(avg);
            setProgress(
              `Uploading ${items.length} image${items.length === 1 ? "" : "s"}… ${avg}%`,
            );
          }),
        ),
      );

      const successfulUploads = uploadResults
        .map((result, index) => ({ result, index }))
        .filter(
          (
            entry,
          ): entry is {
            result: PromiseFulfilledResult<{ id: string; url: string }>;
            index: number;
          } => entry.result.status === "fulfilled",
        );

      const failedUploads = uploadResults.filter(
        (entry) => entry.status === "rejected",
      );

      if (failedUploads.length > 0) {
        setError(`${failedUploads.length} image(s) failed to upload.`);
      }

      if (successfulUploads.length === 0) {
        throw new Error("No images were uploaded successfully.");
      }

      // Phase 2: create posts sequentially for successful uploads
      setUploadPercent(100);
      setProgress("Creating scheduled posts…");
      for (const { result, index } of successfulUploads) {
        if (cancelledRef.current) break;
        const item = items[index];
        const createResult = await createPost(
          item.caption.trim() || "No caption",
          accountIds,
          "scheduled",
          item.scheduledAt,
          [result.value.id],
        );
        if (!createResult.success) {
          throw new Error(createResult.error);
        }
      }

      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setScheduling(false);
      setProgress("");
      setUploadPercent(0);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          Bulk Image Scheduling
        </h1>
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
          Beta
        </span>
      </div>

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
              <p className="block text-sm font-semibold text-foreground mb-3">
                Post to
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-between">
                <div className="flex items-center gap-5">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="shrink-0 rounded-full border border-border bg-bg-elevated px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                  >
                    {selectableAccounts.length > 0 &&
                    selectableAccounts.every((a) => selectedIds.has(a.id))
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                  <label className="flex shrink-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="rounded border-input bg-bg text-accent focus:ring-accent"
                    />
                    <span className="text-sm text-foreground">Remember</span>
                  </label>
                </div>
                <div className="min-w-0 flex-1 sm:max-w-[280px] [&_input]:h-9">
                  <input
                    type="search"
                    placeholder="Search accounts..."
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    className="h-9 w-full rounded border border-input bg-bg px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                  />
                </div>
              </div>
              <div className="mt-4">
                <AccountBubbleSelector
                  accounts={filteredAccounts}
                  selectedIds={selectedIds}
                  onToggleAccount={toggleAccount}
                  selectAll={selectAll}
                  platformName={platformName}
                  compact
                  hideSelectAll
                  supportedPlatforms={supportedPlatforms}
                />
              </div>
            </div>

            <BulkUploadZone
              accept={IMAGE_ACCEPT}
              maxFiles={MAX_IMAGES_PER_SLOT}
              maxSizeBytes={MAX_IMAGE_BYTES}
              maxSizeLabel="JPG, PNG, WEBP, GIF. Max 50MB each."
              maxTotalBytes={LIMITS.totalSize}
              currentTotalBytes={totalSelectedBytes}
              currentCount={items.length}
              helperText={`Up to ${MAX_IMAGES_PER_SLOT} images per slot · 250MB total batch size`}
              onFilesSelected={addFiles}
              disabled={items.length >= MAX_IMAGES_PER_SLOT}
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
                {error && (
                  <div
                    className="relative rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900/60 px-4 py-3 pr-10 text-sm font-medium border border-red-100"
                    role="alert"
                  >
                    {error}
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-red-700/70 hover:bg-red-100 hover:text-red-800 dark:text-red-200/80 dark:hover:bg-red-900/30"
                      aria-label="Dismiss error"
                    >
                      ×
                    </button>
                  </div>
                )}
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

      {scheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[360px] max-w-[90vw] rounded-2xl bg-card border border-border p-8 shadow-xl flex flex-col items-center gap-4">
            <p className="font-medium text-foreground">{progress}</p>
            <div className="w-full">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-accent transition-all duration-200"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <div className="mt-1 text-center text-xs font-medium text-foreground">
                {uploadPercent}%
              </div>
            </div>
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
