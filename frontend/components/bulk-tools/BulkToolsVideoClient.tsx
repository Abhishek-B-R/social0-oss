"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { AccountBubbleSelector } from "@/components/AccountBubbleSelector";
import { PLATFORMS } from "@/lib/platforms";
import {
  useRememberedAccounts,
  useApplyRememberedSelectionWhenReady,
  REMEMBERED_ACCOUNT_KEYS,
} from "@/lib/remembered-accounts";
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
import { measureVideoAspectRatio } from "@/lib/video-aspect-ratio";
import {
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_DURATION_MESSAGE,
} from "@/lib/video-duration";
import { uploadFile } from "@/lib/upload-file";
import {
  CLIENT_MAX_VIDEO_UPLOAD_BYTES,
  CLIENT_MAX_VIDEO_UPLOAD_LABEL,
  formatBytes,
} from "@/lib/media-limits";
import { toast } from "sonner";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import { PinterestConfigInline } from "@/components/PinterestConfigInline";
import type { PinterestPostSettings } from "@/components/PinterestSettingsModal";
import {
  XPostSettingsInline,
  type XPostSettings,
} from "@/components/XPostSettingsInline";

const MAX_VIDEO_BATCH = 40;
const YOUTUBE_TITLE_MAX = 100;
const LIMITS = {
  /** Combined size of all videos in this bulk session — same cap as a single upload. */
  totalSize: CLIENT_MAX_VIDEO_UPLOAD_BYTES,
  perFile: CLIENT_MAX_VIDEO_UPLOAD_BYTES,
  maxCount: MAX_VIDEO_BATCH,
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
  const {
    remember,
    setRememberAndSelection,
    getInitialSelectedIds,
    persistSelection,
  } = useRememberedAccounts(REMEMBERED_ACCOUNT_KEYS.bulkVideo);
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
  const [pinterestSettingsByAccount, setPinterestSettingsByAccount] = useState<
    Record<string, PinterestPostSettings>
  >({});
  const [selectedPinterestAccountIndex, setSelectedPinterestAccountIndex] =
    useState(0);
  const [pinterestError, setPinterestError] = useState<string | null>(null);
  const [showPinterestModal, setShowPinterestModal] = useState(false);
  const [showXModal, setShowXModal] = useState(false);
  const [xPostSettings, setXPostSettings] = useState<XPostSettings>({
    madeWithAi: false,
    paidPartnership: false,
  });
  const [bulkYoutubeTitle, setBulkYoutubeTitle] = useState("");
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [youtubeModalTitle, setYoutubeModalTitle] = useState("");
  const [youtubeModalError, setYoutubeModalError] = useState<string | null>(
    null,
  );

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

  const { isHydrated } = useApplyRememberedSelectionWhenReady({
    skip: false,
    accountsLoading,
    accounts,
    getInitialSelectedIds,
    setSelectedIds,
  });

  useEffect(() => {
    if (!isHydrated) return;
    if (remember) persistSelection(selectedIds);
  }, [isHydrated, remember, selectedIds, persistSelection]);

  const handleRememberChange = useCallback(
    (checked: boolean) => {
      setRememberAndSelection(checked, selectedIds);
    },
    [setRememberAndSelection, selectedIds],
  );

  const selectedAccountIds = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  );
  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selectedIds.has(a.id)),
    [accounts, selectedIds],
  );
  const hasPinterestSelected = useMemo(
    () => selectedAccounts.some((a) => a.platform === "pinterest"),
    [selectedAccounts],
  );
  const hasXSelected = useMemo(
    () => selectedAccounts.some((a) => a.platform === "twitter_x"),
    [selectedAccounts],
  );
  const pinterestAccounts = useMemo(
    () => selectedAccounts.filter((a) => a.platform === "pinterest"),
    [selectedAccounts],
  );
  const hasYouTubeSelected = useMemo(
    () => selectedAccounts.some((a) => a.platform === "youtube"),
    [selectedAccounts],
  );
  const hasTikTokSelected = useMemo(
    () => selectedAccounts.some((a) => a.platform === "tiktok"),
    [selectedAccounts],
  );
  const hasXForAutoFeatures = selectedAccounts.some(
    (a) => a.platform === "twitter_x",
  );
  useEffect(() => {
    if (!hasPinterestSelected) {
      if (pinterestError) setPinterestError(null);
      return;
    }
    const missingBoard = pinterestAccounts.some(
      (acc) => !pinterestSettingsByAccount[acc.id]?.boardId?.trim(),
    );
    if (!missingBoard && pinterestError) {
      setPinterestError(null);
    }
  }, [
    hasPinterestSelected,
    pinterestAccounts,
    pinterestSettingsByAccount,
    pinterestError,
  ]);

  const openYoutubeModalForSchedule = useCallback(() => {
    setYoutubeModalError(null);
    const bulk = bulkYoutubeTitle.trim();
    const nonEmptyTitles = items
      .map((i) => i.youtubeTitle.trim())
      .filter(Boolean);
    const allSame =
      items.length > 0 &&
      nonEmptyTitles.length === items.length &&
      new Set(nonEmptyTitles).size === 1;
    const initial = (
      bulk
        ? bulk
        : allSame
          ? nonEmptyTitles[0]!
          : items.find((i) => i.youtubeTitle.trim())?.youtubeTitle.trim() ?? ""
    ).slice(0, YOUTUBE_TITLE_MAX);
    setYoutubeModalTitle(initial);
    setShowYoutubeModal(true);
  }, [bulkYoutubeTitle, items]);

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
      Promise.all(
        files.map(async (file) => {
          const [m, duration] = await Promise.all([
            measureVideoAspectRatio(file),
            getVideoDuration(file),
          ]);
          return { file, m, duration };
        }),
      ).then((rows) => {
        const withinDuration: typeof rows = [];
        let anyOverDuration = false;
        for (const row of rows) {
          if (row.duration > MAX_VIDEO_DURATION_SECONDS) {
            anyOverDuration = true;
          } else {
            withinDuration.push(row);
          }
        }
        if (anyOverDuration) toast.error(VIDEO_DURATION_MESSAGE);
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
          const newItems: VideoItem[] = toAdd.map((row, i) => ({
            id: crypto.randomUUID(),
            file: row.file,
            previewUrl: URL.createObjectURL(row.file),
            caption: "",
            youtubeTitle: "",
            scheduledAt: dates[prev.length + i] ?? new Date(),
            aspectRatio: row.m.ratio,
            videoWidth: row.m.width,
            videoHeight: row.m.height,
          }));
          return [...prev, ...newItems];
        });
      });
    },
    [
      startDate,
      startTime,
      videosPerDay,
      effectiveGapHours,
    ],
  );

  const updateCaption = (id: string, caption: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, caption } : it)),
    );
  };
  const updateYoutubeTitle = (id: string, youtubeTitle: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, youtubeTitle } : it)),
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

  const applyBulkYoutubeTitle = () => {
    const capped = bulkYoutubeTitle.slice(0, YOUTUBE_TITLE_MAX);
    setItems((prev) => prev.map((it) => ({ ...it, youtubeTitle: capped })));
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

  const runScheduleAll = async () => {
    if (selectedIds.size === 0 || items.length === 0) return;

    // Require a caption for every video before scheduling
    const missingCaption = items.some((item) => !item.caption.trim());
    if (missingCaption) {
      toast.error("Caption is required for all videos before scheduling.");
      return;
    }
    if (hasPinterestSelected) {
      const missingBoard = pinterestAccounts.some(
        (acc) => !pinterestSettingsByAccount[acc.id]?.boardId?.trim(),
      );
      if (missingBoard) {
        setPinterestError(
          "Please select a board for Pinterest before scheduling.",
        );
        toast.error("Please select a board for Pinterest before scheduling.");
        return;
      }
    }
    if (hasYouTubeSelected) {
      const missingYt = items.some((item) => !item.youtubeTitle.trim());
      if (missingYt) {
        toast.error(
          "YouTube title is required for all videos before scheduling.",
        );
        return;
      }
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
    const metadata: Record<string, unknown> =
      autoFeatures.autoRepost || autoFeatures.autoPlug
        ? {
            contentType: "video",
            bulkAutoFeatures: {
              autoRepostConfig: autoFeatures.autoRepost,
              autoPlugConfig: autoFeatures.autoPlug,
            },
          }
        : { contentType: "video" };
    if (hasPinterestSelected) {
      metadata.pinterest = pinterestAccounts.reduce<
        Record<string, { boardId: string; title?: string; link?: string }>
      >((acc, account) => {
        const settings = pinterestSettingsByAccount[account.id];
        if (!settings?.boardId?.trim()) return acc;
        acc[account.id] = {
          boardId: settings.boardId.trim(),
          ...(settings.title?.trim()
            ? { title: settings.title.trim().slice(0, 100) }
            : {}),
          ...(settings.link?.trim() ? { link: settings.link.trim() } : {}),
        };
        return acc;
      }, {});
    }
    if (hasXSelected) {
      metadata.x = {
        madeWithAi: xPostSettings.madeWithAi,
        paidPartnership: xPostSettings.paidPartnership,
      };
    }

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
        const postMetadata: Record<string, unknown> = { ...metadata };
        if (hasYouTubeSelected) {
          postMetadata.youtube = {
            title: item.youtubeTitle.trim().slice(0, YOUTUBE_TITLE_MAX),
          };
        }
        const createResult = await createPost(
          item.caption.trim() || "No caption",
          accountIds,
          "scheduled",
          item.scheduledAt,
          [result.value.id],
          postMetadata,
        );
        if (!createResult.success) {
          throw new Error(createResult.error);
        }
      }

      setSuccess(true);
    } catch {
      toast.error("Failed to schedule videos. Please try again.");
    } finally {
      setScheduling(false);
      setProgress("");
      setIsUploading(false);
      setUploadPercent(0);
    }
  };

  const handleScheduleAll = async () => {
    if (selectedIds.size === 0 || items.length === 0) return;
    if (hasPinterestSelected) {
      setPinterestError(null);
      setShowPinterestModal(true);
      return;
    }
    if (hasXSelected) {
      setShowXModal(true);
      return;
    }
    if (hasYouTubeSelected) {
      openYoutubeModalForSchedule();
      return;
    }
    await runScheduleAll();
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
                      onChange={(e) => handleRememberChange(e.target.checked)}
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
              maxSizeLabel={`MP4, MOV, AVI. Max ${CLIENT_MAX_VIDEO_UPLOAD_LABEL} each.`}
              helperText={`Up to ${LIMITS.maxCount} videos · ${CLIENT_MAX_VIDEO_UPLOAD_LABEL} max per file · ${formatBytes(LIMITS.totalSize)} total combined`}
              onFilesSelected={addFiles}
              disabled={items.length >= LIMITS.maxCount}
            />

            <p className="text-xs text-muted-foreground">
              {CLIENT_MAX_VIDEO_UPLOAD_LABEL} max per file and{" "}
              {formatBytes(LIMITS.totalSize)} total combined are enforced
              client-side.
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
                    tikTokSelected={hasTikTokSelected}
                    showYoutubeTitle={hasYouTubeSelected}
                    onCaptionChange={updateCaption}
                    onYoutubeTitleChange={updateYoutubeTitle}
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
              showYoutubeTitleSection={hasYouTubeSelected}
              bulkYoutubeTitle={bulkYoutubeTitle}
              onBulkYoutubeTitleChange={setBulkYoutubeTitle}
              onApplyYoutubeTitleToAll={applyBulkYoutubeTitle}
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

      {showPinterestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-pinterest-settings-title"
          >
            <h3
              id="bulk-pinterest-settings-title"
              className="text-lg font-semibold text-foreground"
            >
              Pinterest Settings
            </h3>
            <div className="mt-4">
              {pinterestAccounts.length > 1 ? (
                <>
                  <div className="mb-4 flex rounded-lg border border-border bg-bg-muted/30 p-0.5">
                    {pinterestAccounts.map((acc, idx) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setSelectedPinterestAccountIndex(idx)}
                        className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          selectedPinterestAccountIndex === idx
                            ? "bg-bg-elevated text-text shadow-sm"
                            : "text-text-muted hover:text-text"
                        }`}
                      >
                        {acc.platformUsername?.trim()
                          ? `@${acc.platformUsername}`
                          : `Account ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                  <PinterestConfigInline
                    accountId={
                      pinterestAccounts[selectedPinterestAccountIndex]?.id ?? ""
                    }
                    value={
                      pinterestSettingsByAccount[
                        pinterestAccounts[selectedPinterestAccountIndex]?.id ?? ""
                      ] ?? {
                        boardId: "",
                        title: "",
                        link: "",
                        rememberBoard: false,
                        rememberLink: false,
                      }
                    }
                    onChange={(s) => {
                      const id =
                        pinterestAccounts[selectedPinterestAccountIndex]?.id;
                      if (id) {
                        setPinterestSettingsByAccount((prev) => ({
                          ...prev,
                          [id]: s,
                        }));
                      }
                    }}
                    isVisible={true}
                  />
                </>
              ) : (
                <PinterestConfigInline
                  accountId={pinterestAccounts[0]?.id ?? ""}
                  value={
                    pinterestSettingsByAccount[pinterestAccounts[0]?.id ?? ""] ?? {
                      boardId: "",
                      title: "",
                      link: "",
                      rememberBoard: false,
                      rememberLink: false,
                    }
                  }
                  onChange={(s) => {
                    const id = pinterestAccounts[0]?.id;
                    if (id) {
                      setPinterestSettingsByAccount((prev) => ({
                        ...prev,
                        [id]: s,
                      }));
                    }
                  }}
                  isVisible={true}
                />
              )}
              {pinterestError && (
                <p className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {pinterestError}
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle"
                onClick={() => {
                  setShowPinterestModal(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={async () => {
                  const missingBoard = pinterestAccounts.some(
                    (acc) => !pinterestSettingsByAccount[acc.id]?.boardId?.trim(),
                  );
                  if (missingBoard) {
                    setPinterestError(
                      "Please select a board for Pinterest before scheduling.",
                    );
                    return;
                  }
                  setPinterestError(null);
                  setShowPinterestModal(false);
                  if (hasXSelected) {
                    setShowXModal(true);
                  } else if (hasYouTubeSelected) {
                    openYoutubeModalForSchedule();
                  } else {
                    await runScheduleAll();
                  }
                }}
              >
                Continue &amp; Schedule
              </button>
            </div>
          </div>
        </div>
      )}
      {showXModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-x-settings-title"
          >
            <h3
              id="bulk-x-settings-title"
              className="text-lg font-semibold text-foreground"
            >
              X Settings
            </h3>
            <div className="mt-4">
              <XPostSettingsInline
                value={xPostSettings}
                onChange={setXPostSettings}
                isVisible={true}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle"
                onClick={() => setShowXModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={() => {
                  setShowXModal(false);
                  if (hasYouTubeSelected) {
                    openYoutubeModalForSchedule();
                  } else {
                    void runScheduleAll();
                  }
                }}
              >
                Continue &amp; Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {showYoutubeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-youtube-settings-title"
          >
            <h3
              id="bulk-youtube-settings-title"
              className="text-lg font-semibold text-foreground"
            >
              YouTube Settings
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Enter one title to apply to every video, or leave this blank if
              each video already has a title below (max {YOUTUBE_TITLE_MAX}{" "}
              characters).
            </p>
            <div className="mt-4">
              <label
                htmlFor="bulk-youtube-modal-title"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                YouTube title
              </label>
              <input
                id="bulk-youtube-modal-title"
                type="text"
                value={youtubeModalTitle}
                maxLength={YOUTUBE_TITLE_MAX}
                onChange={(e) => {
                  setYoutubeModalTitle(
                    e.target.value.slice(0, YOUTUBE_TITLE_MAX),
                  );
                  if (youtubeModalError) setYoutubeModalError(null);
                }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Enter YouTube title…"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {youtubeModalTitle.length} / {YOUTUBE_TITLE_MAX}
              </p>
              {youtubeModalError && (
                <p className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {youtubeModalError}
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle"
                onClick={() => setShowYoutubeModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={async () => {
                  const t = youtubeModalTitle.trim();
                  if (t) {
                    const capped = t.slice(0, YOUTUBE_TITLE_MAX);
                    setItems((prev) =>
                      prev.map((it) => ({ ...it, youtubeTitle: capped })),
                    );
                    setBulkYoutubeTitle(capped);
                  } else {
                    const missing = items.some((it) => !it.youtubeTitle.trim());
                    if (missing) {
                      setYoutubeModalError(
                        "Enter a YouTube title here to apply to all videos, or fill a title on every video card.",
                      );
                      return;
                    }
                  }
                  setYoutubeModalError(null);
                  setShowYoutubeModal(false);
                  await runScheduleAll();
                }}
              >
                Continue &amp; Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
