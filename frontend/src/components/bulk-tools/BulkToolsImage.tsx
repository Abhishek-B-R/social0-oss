
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "@/components/AppLink";
import { BulkAccountPicker } from "@/components/bulk-tools/BulkAccountPicker";
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
  BulkScheduleOverlay,
  type BulkScheduleOverlayPhase,
} from "./BulkScheduleOverlay";
import {
  BulkAutoFeaturesCard,
  type BulkAutoFeaturesValue,
} from "./BulkAutoFeaturesCard";
import {
  computeBulkSchedule,
  formatSchedulePreview,
} from "@/lib/bulk-schedule";
import { createPost } from "@/api/posts";
import { uploadFile } from "@/lib/upload-file";
import { usePostHog } from "@posthog/react";
import { captureBulkPostsScheduled } from "@/lib/posthog-events";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { toast } from "sonner";
import {
  getPinterestBoardRequiredMessage,
  hasMissingPinterestBoard,
} from "@/lib/pinterest-board-validation";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import {
  BulkPinterestModal,
  BulkXModal,
} from "@/components/bulk-tools/BulkScheduleModals";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";
import type { XPostSettings } from "@/components/XPostSettingsInline";

const LIMITS = {
  totalSize: 250 * 1024 * 1024, // 250MB total batch
  maxCount: 100, // 100 images max count (global)
  maxPerSlot: 50, // 50 images per bulk slot/session
};
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

export function BulkToolsImage({
  accounts,
  accountsLoading = false,
  supportedPlatforms,
}: {
  accounts: Account[];
  accountsLoading?: boolean;
  supportedPlatforms?: string[];
}) {
  const posthog = usePostHog();
  const invalidateQueries = useInvalidateQueries();
  const dash = useDashboardPath();
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
  const [schedulePhase, setSchedulePhase] =
    useState<BulkScheduleOverlayPhase>("uploading");
  const [overlayTotal, setOverlayTotal] = useState(0);
  const [creatingIndex, setCreatingIndex] = useState(0);
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
  const [hasRestoredAutoFeatures, setHasRestoredAutoFeatures] = useState(false);

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
  const pinterestBoardMissing = hasMissingPinterestBoard(
    pinterestAccounts,
    pinterestSettingsByAccount,
  );
  if (
    pinterestError &&
    (!hasPinterestSelected || !pinterestBoardMissing)
  ) {
    setPinterestError(null);
  }

  // Restore remembered auto features the first time X is selected.
  if (
    hasXForAutoFeatures &&
    rememberAutoFeatures &&
    !hasRestoredAutoFeatures
  ) {
    const { autoRepostConfig, autoPlugConfig } = getAutoFeaturesInitialState();
    if (autoRepostConfig) setResurfaceConfig(autoRepostConfig);
    if (autoPlugConfig) setAutoPlugConfig(autoPlugConfig);
    setHasRestoredAutoFeatures(true);
  }

  // Clear auto features when X is deselected (they only apply to X).
  if (!hasXForAutoFeatures && (resurfaceConfig || autoPlugConfig)) {
    setResurfaceConfig(null);
    setAutoPlugConfig(null);
  }

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
      const boardMessage = getPinterestBoardRequiredMessage(
        pinterestAccounts,
        pinterestSettingsByAccount,
        "schedule",
      );
      if (boardMessage) {
        setPinterestError(boardMessage);
        toast.error(boardMessage);
        return;
      }
    }

    toast.dismiss();
    cancelledRef.current = false;
    setScheduling(true);
    setSchedulePhase("uploading");
    setOverlayTotal(items.length);
    setCreatingIndex(0);
    setUploadPercent(0);
    setProgress(`Uploading… 0%`);
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
            setProgress(`Uploading… ${avg}%`);
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
      setSchedulePhase("creating");
      setOverlayTotal(successfulUploads.length);
      setCreatingIndex(0);
      setUploadPercent(100);
      setProgress("Scheduling posts…");
      for (let i = 0; i < successfulUploads.length; i++) {
        if (cancelledRef.current) break;
        const { result, index } = successfulUploads[i];
        setCreatingIndex(i + 1);
        setProgress(`Scheduling post ${i + 1} of ${successfulUploads.length}…`);
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
      captureBulkPostsScheduled(
        posthog,
        "image",
        successfulUploads.length,
        accountIds.length,
      );
      invalidateQueries();
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
        <h1 className="mb-2 dash-page-title">
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
            href={dash("calendar")}
            className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            View Calendar →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <BulkAccountPicker
              selectableAccounts={selectableAccounts}
              filteredAccounts={filteredAccounts}
              selectedIds={selectedIds}
              toggleAccount={toggleAccount}
              selectAll={selectAll}
              remember={remember}
              onRememberChange={handleRememberChange}
              accountSearch={accountSearch}
              setAccountSearch={setAccountSearch}
              accountsLoading={accountsLoading}
              platformName={platformName}
              supportedPlatforms={supportedPlatforms}
            />

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
        <BulkScheduleOverlay
          variant="image"
          phase={schedulePhase}
          uploadPercent={uploadPercent}
          totalItems={overlayTotal}
          creatingIndex={creatingIndex}
          onCancel={() => {
            cancelledRef.current = true;
          }}
        />
      )}

      {showPinterestModal && (
        <BulkPinterestModal
          accounts={pinterestAccounts}
          settingsByAccount={pinterestSettingsByAccount}
          setSettingsByAccount={setPinterestSettingsByAccount}
          selectedAccountIndex={selectedPinterestAccountIndex}
          setSelectedAccountIndex={setSelectedPinterestAccountIndex}
          error={pinterestError}
          setError={setPinterestError}
          onCancel={() => setShowPinterestModal(false)}
          onContinue={() => {
            setShowPinterestModal(false);
                  if (hasXSelected) {
                    setShowXModal(true);
                  } else {
                    void runScheduleAll();
                  }
          }}
        />
      )}
      {showXModal && (
        <BulkXModal
          value={xPostSettings}
          onChange={setXPostSettings}
          onCancel={() => setShowXModal(false)}
          onContinue={() => {
            setShowXModal(false);
                  void runScheduleAll();
          }}
        />
      )}
    </div>
  );
}
