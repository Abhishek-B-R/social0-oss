"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { AccountBubbleSelector } from "@/components/AccountBubbleSelector";
import { PLATFORMS } from "@/lib/platforms";
import { useRememberedAccounts } from "@/lib/remembered-accounts";
import { useRememberedAutoRepostAutoPlug } from "@/lib/remembered-autorepost-autoplug";
import { BulkUploadZone } from "./BulkUploadZone";
import { VideoCard, type VideoItem } from "./VideoCard";
import { BulkScheduleSettings } from "./BulkScheduleSettings";
import {
  BulkAutoFeaturesCard,
  type BulkAutoFeaturesValue,
} from "./BulkAutoFeaturesCard";
import {
  computeBulkSchedule,
  formatSchedulePreview,
} from "@/lib/bulk-schedule";
import { createPost } from "@/app/actions/posts";
import {
  validateVideoAspectRatio,
  formatAspectRatioLabel,
  getAspectRatioDescriptor,
  ASPECT_RATIO_MESSAGE,
  type VideoAspectResult,
} from "@/lib/video-aspect-ratio";
import {
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_DURATION_MESSAGE,
} from "@/lib/video-duration";
import { uploadFile } from "@/lib/upload-file";
import { toast } from "sonner";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";

const LIMITS = {
  totalSize: 250 * 1024 * 1024, // 250MB total batch
  perFile: 250 * 1024 * 1024, // 250MB per file
  maxCount: 40, // 40 videos max at a time
};
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

export function BulkToolsVideoClient({
  accounts,
  accountsLoading = false,
  supportedPlatforms,
}: {
  accounts: Account[];
  accountsLoading?: boolean;
  supportedPlatforms?: string[];
}) {
  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const validIds = useMemo(
    () => new Set(selectableAccounts.map((a) => a.id)),
    [selectableAccounts],
  );
  const { remember, setRemember, getInitialSelectedIds, persistSelection } =
    useRememberedAccounts(REMEMBER_KEY_VIDEO);
  const {
    remember: rememberAutoFeatures,
    setRemember: setRememberAutoFeatures,
    persistAutoRepost,
    persistAutoPlug,
    getInitialState: getAutoFeaturesInitialState,
  } = useRememberedAutoRepostAutoPlug();

  const [items, setItems] = useState<VideoItem[]>([]);
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
  const effectiveGapHours = videosPerDay === 1 ? 24 : gapHours;
  // const [coverFrame, setCoverFrame] = useState<CoverFrame>("middle");
  const [scheduling, setScheduling] = useState(false);
  const [progress, setProgress] = useState("");
  const [success, setSuccess] = useState(false);
  const cancelledRef = useRef(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  const [resurfaceConfig, setResurfaceConfig] =
    useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );
  const hasRestoredAutoFeaturesRef = useRef(false);

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

  const selectedAccountIds = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  );
  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selectedIds.has(a.id)),
    [accounts, selectedIds],
  );
  const hasXForAutoFeatures = selectedAccounts.some(
    (a) => a.platform === "twitter_x",
  );

  // Restore remembered auto features the first time X is selected.
  useEffect(() => {
    if (!hasXForAutoFeatures) return;
    if (!rememberAutoFeatures) return;
    if (hasRestoredAutoFeaturesRef.current) return;
    const { autoRepostConfig, autoPlugConfig } = getAutoFeaturesInitialState();
    if (autoRepostConfig) setResurfaceConfig(autoRepostConfig);
    if (autoPlugConfig) setAutoPlugConfig(autoPlugConfig);
    hasRestoredAutoFeaturesRef.current = true;
  }, [hasXForAutoFeatures, rememberAutoFeatures, getAutoFeaturesInitialState]);

  // Persist remembered auto features when enabled and X is selected.
  useEffect(() => {
    if (!rememberAutoFeatures || !hasXForAutoFeatures) return;
    persistAutoRepost(!!resurfaceConfig, resurfaceConfig);
    persistAutoPlug(!!autoPlugConfig, autoPlugConfig);
  }, [
    rememberAutoFeatures,
    hasXForAutoFeatures,
    resurfaceConfig,
    autoPlugConfig,
    persistAutoRepost,
    persistAutoPlug,
  ]);

  // Clear auto features when X is deselected (they only apply to X).
  useEffect(() => {
    if (hasXForAutoFeatures) return;
    setResurfaceConfig(null);
    setAutoPlugConfig(null);
  }, [hasXForAutoFeatures]);

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
      toast.dismiss();
      if (files.length === 0) return;
      Promise.all(files.map(validateVideoAspectRatio)).then(
        (results: VideoAspectResult[]) => {
          const validFiles: File[] = [];
          let firstInvalid: VideoAspectResult | null = null;
          files.forEach((file, i) => {
            if (results[i].valid) validFiles.push(file);
            else if (!firstInvalid) firstInvalid = results[i];
          });
          if (firstInvalid) {
            const { ratio } = firstInvalid as VideoAspectResult;
            toast.error(
              `${ASPECT_RATIO_MESSAGE} Yours is ${formatAspectRatioLabel(ratio)}${getAspectRatioDescriptor(ratio)}.`,
            );
          }
          if (validFiles.length === 0) return;
          Promise.all(validFiles.map(getVideoDuration)).then((durations) => {
            const withinDuration: File[] = [];
            const overDuration = durations.some(
              (d) => d > MAX_VIDEO_DURATION_SECONDS,
            );
            validFiles.forEach((file, i) => {
              if (durations[i] <= MAX_VIDEO_DURATION_SECONDS)
                withinDuration.push(file);
            });
            if (overDuration) {
              toast.error(VIDEO_DURATION_MESSAGE);
            }
            if (withinDuration.length === 0) return;
            setItems((prev) => {
              const toAdd = withinDuration.slice(
                0,
                Math.max(0, LIMITS.maxCount - prev.length),
              );
              if (toAdd.length === 0) return prev;

              const [h, m] = startTime.split(":").map(Number);
              const start = new Date(startDate + "T00:00:00");
              const dates = computeBulkSchedule(
                prev.length + toAdd.length,
                start,
                h ?? 0,
                m ?? 0,
                videosPerDay,
                effectiveGapHours,
              );
              const newItems: VideoItem[] = toAdd.map((file, i) => ({
                id: crypto.randomUUID(),
                file,
                previewUrl: URL.createObjectURL(file),
                caption: "",
                scheduledAt: dates[prev.length + i] ?? new Date(),
              }));
              return [...prev, ...newItems];
            });
          });
        },
      );
    },
    [startDate, startTime, videosPerDay, effectiveGapHours],
  );

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

    // Require a caption for every video before scheduling
    const missingCaption = items.some((item) => !item.caption.trim());
    if (missingCaption) {
      toast.error("Caption is required for all videos before scheduling.");
      return;
    }

    toast.dismiss();
    cancelledRef.current = false;
    setScheduling(true);
    setIsUploading(true);
    setUploadPercent(0);
    setProgress(
      `Uploading ${items.length} video${items.length === 1 ? "" : "s"}…`,
    );
    const accountIds = selectedAccountIds;

    const autoFeatures: BulkAutoFeaturesValue = {
      autoRepost: hasXForAutoFeatures ? resurfaceConfig : null,
      autoPlug: hasXForAutoFeatures ? autoPlugConfig : null,
    };
    const metadata =
      autoFeatures.autoRepost || autoFeatures.autoPlug
        ? {
            contentType: "video",
            bulkAutoFeatures: {
              autoRepostConfig: autoFeatures.autoRepost,
              autoPlugConfig: autoFeatures.autoPlug,
            },
          }
        : { contentType: "video" };

    try {
      // Phase 1: upload all videos in parallel
      const perFileProgress = new Array(items.length).fill(0);
      const uploadResults = await Promise.allSettled(
        items.map((item, index) =>
          uploadFile(item.file, index, (idx, percent) => {
            // Use average progress across all files.
            // We keep this local to avoid storing per-file state in React for bulk.
            perFileProgress[idx] = percent;
            const sum = perFileProgress.reduce((a, b) => a + b, 0);
            const avg =
              perFileProgress.length > 0
                ? Math.round(sum / perFileProgress.length)
                : percent;
            setUploadPercent(avg);
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

      const failedUploads = uploadResults
        .map((result, index) => ({ result, index }))
        .filter((entry) => entry.result.status === "rejected");

      if (failedUploads.length > 0) {
        toast.error(`${failedUploads.length} video(s) failed to upload.`);
      }

      if (successfulUploads.length === 0) {
        throw new Error("No videos were uploaded successfully.");
      }

      // Phase 2: create posts sequentially for successful uploads
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
          metadata,
        );
        if (!createResult.success) {
          throw new Error(createResult.error);
        }
      }

      setSuccess(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setScheduling(false);
      setProgress("");
      setIsUploading(false);
      setUploadPercent(0);
    }
  };

  useEffect(() => {
    if (!isUploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isUploading]);

  return (
    <div className="space-y-6 -ml-2 sm:-ml-3 lg:-ml-4">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          Bulk Video Scheduling
        </h1>
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
          Beta
        </span>
      </div>

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
                {accountsLoading ? (
                  <div className="flex flex-wrap items-center gap-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex flex-col items-center"
                        aria-hidden
                      >
                        <div className="h-12 w-12 shrink-0 rounded-full bg-bg-muted animate-pulse border-2 border-transparent" />
                        <div className="mt-1.5 h-3 w-14 rounded bg-bg-muted animate-pulse" />
                        <div className="mt-1 h-3 w-10 rounded bg-bg-muted animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (
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
                )}
              </div>
            </div>

            <BulkUploadZone
              accept={VIDEO_ACCEPT}
              maxFiles={LIMITS.maxCount}
              maxSizeBytes={LIMITS.perFile}
              maxTotalBytes={LIMITS.totalSize}
              currentTotalBytes={totalSelectedBytes}
              currentCount={items.length}
              maxSizeLabel="MP4, MOV, AVI. Max 250MB each."
              helperText="Up to 40 videos · 250MB total batch size"
              onFilesSelected={addFiles}
              disabled={items.length >= LIMITS.maxCount}
            />

            <p className="text-xs text-muted-foreground">
              The 250MB total batch size limit is enforced client-side.
            </p>

            {isUploading && !scheduling && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-accent transition-all duration-200"
                      style={{ width: `${uploadPercent}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground">
                    Uploading {items.length} video
                    {items.length === 1 ? "" : "s"}… {uploadPercent}%
                  </span>
                </div>
                <p className="text-[20px] text-amber-600 dark:text-amber-400">
                  ⚠️ Do not close this tab — your videos will not be saved if
                  you leave now.
                </p>
              </div>
            )}

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
              childrenAfterApplySchedule={
                hasXForAutoFeatures ? (
                  <BulkAutoFeaturesCard
                    selectedAccountIds={selectedAccountIds}
                    allAccounts={accounts}
                    value={{
                      autoRepost: resurfaceConfig,
                      autoPlug: autoPlugConfig,
                    }}
                    onChange={(next) => {
                      setResurfaceConfig(next.autoRepost);
                      setAutoPlugConfig(next.autoPlug);
                    }}
                    remember={rememberAutoFeatures}
                    onRememberChange={setRememberAutoFeatures}
                  />
                ) : null
              }
              totalItems={items.length}
              selectedAccountCount={selectedIds.size}
              onScheduleAll={handleScheduleAll}
              scheduling={scheduling || isUploading}
              progressLabel={progress}
            />
          </div>
        </div>
      )}

      {scheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[360px] max-w-[90vw] rounded-2xl bg-card border border-border p-8 shadow-xl flex flex-col items-center gap-4">
            <p className="font-medium text-foreground text-center">
              {progress}
            </p>
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
