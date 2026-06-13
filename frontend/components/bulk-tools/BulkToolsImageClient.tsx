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
import { ImageCard, type ImageItem } from "./ImageCard";
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
import { uploadFile } from "@/lib/upload-file";
import { toast } from "sonner";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import { PinterestConfigInline } from "@/components/PinterestConfigInline";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";
import {
  XPostSettingsInline,
  type XPostSettings,
} from "@/components/XPostSettingsInline";

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

export function BulkToolsImageClient({
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
  } = useRememberedAccounts(REMEMBERED_ACCOUNT_KEYS.bulkImage);
  const {
    remember: rememberAutoFeatures,
    setRemember: setRememberAutoFeatures,
    persistAutoRepost,
    persistAutoPlug,
    getInitialState: getAutoFeaturesInitialState,
  } = useRememberedAutoRepostAutoPlug();

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
  const cancelledRef = useRef(false);
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

  const [resurfaceConfig, setResurfaceConfig] =
    useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );
  const hasRestoredAutoFeaturesRef = useRef(false);

  const platformName = (id: string) =>
    PLATFORMS.find((p) => p.id === id)?.name ?? id;

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
  const hasPinterestSelected = selectedAccounts.some(
    (a) => a.platform === "pinterest",
  );
  const hasXSelected = selectedAccounts.some((a) => a.platform === "twitter_x");
  const pinterestAccounts = selectedAccounts.filter(
    (a) => a.platform === "pinterest",
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

  const runScheduleAll = async () => {
    if (selectedIds.size === 0 || items.length === 0) return;

    // Require a caption for every image before scheduling
    const missingCaption = items.some((item) => !item.caption.trim());
    if (missingCaption) {
      toast.error("Caption is required for all images before scheduling.");
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

    toast.dismiss();
    cancelledRef.current = false;
    setScheduling(true);
    setUploadPercent(0);
    setProgress(
      `Uploading ${items.length} image${items.length === 1 ? "" : "s"}… 0%`,
    );
    const accountIds = selectedAccountIds;

    const autoFeatures: BulkAutoFeaturesValue = {
      autoRepost: hasXForAutoFeatures ? resurfaceConfig : null,
      autoPlug: hasXForAutoFeatures ? autoPlugConfig : null,
    };
    const metadata: Record<string, unknown> =
      autoFeatures.autoRepost || autoFeatures.autoPlug
        ? {
            contentType: "image",
            bulkAutoFeatures: {
              autoRepostConfig: autoFeatures.autoRepost,
              autoPlugConfig: autoFeatures.autoPlug,
            },
          }
        : { contentType: "image" };
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
        toast.error(`${failedUploads.length} image(s) failed to upload.`);
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
          metadata,
        );
        if (!createResult.success) {
          throw new Error(createResult.error);
        }
      }

      setSuccess(true);
    } catch {
      toast.error("Failed to schedule images. Please try again.");
    } finally {
      setScheduling(false);
      setProgress("");
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
    await runScheduleAll();
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
                onClick={async () => {
                  setShowXModal(false);
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
