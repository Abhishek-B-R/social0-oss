"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { publishPost } from "@/app/actions/publish";
import {
  createResurfaceSchedule,
  createAutoPlug,
} from "@/app/actions/resurface";
import { useRememberedAccounts } from "@/lib/remembered-accounts";
import { PostFormOptions } from "../PostFormOptions";
import { SchedulePostSidebar } from "../SchedulePostSidebar";
import { getResurfacePlatforms } from "@/lib/resurface-utils";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type {
  AutoPlugConfig,
  ConnectedAccount,
} from "@/components/autoplug/AutoPlugPanel";
import { AutoResurfaceSettingsModal } from "@/components/repost/AutoResurfaceSettingsModal";
import { AutoPlugSettingsModal } from "@/components/autoplug/AutoPlugSettingsModal";
import {
  MdOutlineAddPhotoAlternate,
  MdOutlineVideocam,
  MdClose,
} from "react-icons/md";
import { type TikTokPostSettings } from "@/components/TikTokSettings";
import { TikTokSettings } from "@/components/TikTokSettings";
import { UploadPublishOverlay } from "@/components/UploadPublishOverlay";
import { ChevronDown, ChevronUp, Circle } from "lucide-react";
import { uploadFile } from "@/lib/upload-file";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  tokenExpired?: boolean;
};

type ImageFile = {
  file?: File;
  preview: string;
  order: number;
  existingId?: string;
};
type VideoFile = {
  file?: File;
  preview: string;
  order: number;
  existingId?: string;
};

export function CollectionPostForm({
  accounts,
  use24HourTimeFormat = false,
  draftId: initialDraftId,
}: {
  accounts: Account[];
  use24HourTimeFormat?: boolean;
  draftId?: string;
}) {
  const router = useRouter();
  const unifiedInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageFile[]>([]);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [carouselPreviewIndex, setCarouselPreviewIndex] = useState(0);
  const validIds = useMemo(
    () => new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id)),
    [accounts],
  );
  const { remember, setRemember, getInitialSelectedIds, persistSelection } =
    useRememberedAccounts("post-form");
  const [accountSearch, setAccountSearch] = useState("");
  const imagesRef = useRef<ImageFile[]>([]);
  const videosRef = useRef<VideoFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialDraftId ? new Set() : getInitialSelectedIds(validIds),
  );
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(!!initialDraftId);
  const [error, setError] = useState<string | null>(null);
  type OverlayPhase = "idle" | "uploading" | "publishing" | "saving" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [tiktokSettings, setTiktokSettings] = useState<
    Record<string, TikTokPostSettings>
  >({});
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [resurfaceConfig, setResurfaceConfig] =
    useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );
  const [resurfaceModalOpen, setResurfaceModalOpen] = useState(false);
  const [autoplugModalOpen, setAutoplugModalOpen] = useState(false);
  type ConfigPanel = "tiktok" | null;
  const [activeConfigPanel, setActiveConfigPanel] = useState<ConfigPanel>(null);
  const [selectedTiktokAccountIndex, setSelectedTiktokAccountIndex] =
    useState(0);
  const configBeforeResurfaceRef = useRef<AutoResurfaceConfig | null>(null);
  const configBeforeAutoPlugRef = useRef<AutoPlugConfig | null>(null);
  const [showCaptionError, setShowCaptionError] = useState(false);
  const [fileProgresses, setFileProgresses] = useState<number[]>([]);

  const defaultTiktokSettings: TikTokPostSettings = {
    privacy_level: "PUBLIC_TO_EVERYONE", // Default to Public
    disable_comment: false,
    disable_duet: false,
    disable_stitch: false,
    brand_content_toggle: false,
    brand_organic: false,
    brand_content: false,
  };

  useEffect(() => {
    imagesRef.current = images;
    videosRef.current = videos;
  }, [images, videos]);
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((i) => URL.revokeObjectURL(i.preview));
      videosRef.current.forEach((v) => URL.revokeObjectURL(v.preview));
    };
  }, []);

  useEffect(() => {
    if (!initialDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getDraft } = await import("@/app/actions/posts");
        const result = await getDraft(initialDraftId);
        if (cancelled) return;
        if (!result.success) {
          setError(result.error);
          return;
        }
        const { draft } = result;
        setContent(draft.originalContent ?? "");
        setSelectedIds(new Set(draft.connectedAccountIds));
        setScheduledAt(draft.scheduledAt ? new Date(draft.scheduledAt) : null);
        if (draft.scheduledAt) setMode("scheduled");
        const orderedMedia = draft.media.map((m, i) => ({
          ...m,
          order: i + 1,
        }));
        const draftImages = orderedMedia
          .filter((m) => m.mimeType.startsWith("image/"))
          .map((m) => ({
            preview: m.thumbnailUrl ?? m.url ?? "",
            order: m.order,
            existingId: m.id,
          }));
        const draftVideos = orderedMedia
          .filter((m) => m.mimeType.startsWith("video/"))
          .map((m) => ({
            preview: m.thumbnailUrl ?? m.url ?? "",
            order: m.order,
            existingId: m.id,
          }));
        if (draftImages.length > 0) setImages(draftImages);
        if (draftVideos.length > 0) setVideos(draftVideos);
      } catch {
        if (!cancelled) setError("Failed to load draft");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId]);

  useEffect(() => {
    if (remember) persistSelection(selectedIds);
  }, [remember, selectedIds, persistSelection]);

  const handleDeleteDraft = async () => {
    if (!initialDraftId) return;
    const { deleteDraft } = await import("@/app/actions/posts");
    const result = await deleteDraft(initialDraftId);
    if (result.success) {
      router.push("/dashboard/posts/drafts");
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Don't auto-open modal - only open when badge is clicked
      }
      return next;
    });
  };

  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const selectAll = () => {
    if (selectableAccounts.every((a) => selectedIds.has(a.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableAccounts.map((a) => a.id)));
    }
  };

  const getMaxOrder = () => {
    const imageOrders = images.map((i) => i.order);
    const videoOrders = videos.map((v) => v.order);
    return Math.max(0, ...imageOrders, ...videoOrders);
  };

  const onImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const newImages: ImageFile[] = [];
    const maxOrder = getMaxOrder();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) {
        setError("Please select only image files.");
        continue;
      }
      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        order: maxOrder + i + 1,
      });
    }
    if (newImages.length > 0) {
      setError(null);
      setImages((prev) => [...prev, ...newImages]);
    }
    if (unifiedInputRef.current) unifiedInputRef.current.value = "";
  };

  const onVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const newVideos: VideoFile[] = [];
    const maxOrder = getMaxOrder();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("video/")) {
        setError("Please select only video files.");
        continue;
      }
      newVideos.push({
        file,
        preview: URL.createObjectURL(file),
        order: maxOrder + i + 1,
      });
    }
    if (newVideos.length > 0) {
      setError(null);
      setVideos((prev) => [...prev, ...newVideos]);
    }
    if (unifiedInputRef.current) unifiedInputRef.current.value = "";
  };

  const onUnifiedFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setError(null);
    const maxOrder = getMaxOrder();
    let orderOffset = 0;
    const newImages: ImageFile[] = [];
    const newVideos: VideoFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        newImages.push({
          file,
          preview: URL.createObjectURL(file),
          order: maxOrder + orderOffset + 1,
        });
        orderOffset++;
      } else if (file.type.startsWith("video/")) {
        newVideos.push({
          file,
          preview: URL.createObjectURL(file),
          order: maxOrder + orderOffset + 1,
        });
        orderOffset++;
      }
    }
    if (newImages.length > 0) setImages((prev) => [...prev, ...newImages]);
    if (newVideos.length > 0) setVideos((prev) => [...prev, ...newVideos]);
    if (unifiedInputRef.current) unifiedInputRef.current.value = "";
  };

  const [isUploadZoneHovered, setIsUploadZoneHovered] = useState(false);
  useEffect(() => {
    if (!isUploadZoneHovered) return;
    const handlePaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0];
      if (!file) return;
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        setError(null);
        const maxOrder = getMaxOrder();
        setImages((prev) => [
          ...prev,
          { file, preview: URL.createObjectURL(file), order: maxOrder + 1 },
        ]);
      } else if (file.type.startsWith("video/")) {
        e.preventDefault();
        setError(null);
        const maxOrder = getMaxOrder();
        setVideos((prev) => [
          ...prev,
          { file, preview: URL.createObjectURL(file), order: maxOrder + 1 },
        ]);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isUploadZoneHovered]);

  const getAllItems = () => {
    return [
      ...images.map((img) => ({ ...img, type: "image" as const })),
      ...videos.map((vid) => ({ ...vid, type: "video" as const })),
    ].sort((a, b) => a.order - b.order);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const sorted = getAllItems();
    const draggedItem = sorted[draggedIndex];
    const newSorted = [...sorted];
    newSorted.splice(draggedIndex, 1);
    newSorted.splice(index, 0, draggedItem);
    const reordered = newSorted.map((item, idx) => ({
      ...item,
      order: idx + 1,
    }));
    const newImages = reordered
      .filter((i) => i.type === "image")
      .map((i) => ({
        ...(i.file && { file: i.file }),
        preview: i.preview,
        order: i.order,
        ...(i.existingId && { existingId: i.existingId }),
      }));
    const newVideos = reordered
      .filter((i) => i.type === "video")
      .map((i) => ({
        ...(i.file && { file: i.file }),
        preview: i.preview,
        order: i.order,
        ...(i.existingId && { existingId: i.existingId }),
      }));
    setImages(newImages);
    setVideos(newVideos);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const removeImage = (preview: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.preview === preview);
      if (item?.preview.startsWith("blob:")) URL.revokeObjectURL(item.preview);
      const filtered = prev.filter((i) => i.preview !== preview);
      const allItems = [...filtered, ...videos].sort(
        (a, b) => a.order - b.order,
      );
      return filtered.map((img) => {
        const newOrder =
          allItems.findIndex((i) => i.preview === img.preview) + 1;
        return { ...img, order: newOrder };
      });
    });
    const allItems = [
      ...images.filter((i) => i.preview !== preview),
      ...videos,
    ].sort((a, b) => a.order - b.order);
    setVideos((prev) =>
      prev.map((vid) => {
        const newOrder =
          allItems.findIndex((i) => i.preview === vid.preview) + 1;
        return { ...vid, order: newOrder };
      }),
    );
    setDraggedIndex(null);
  };

  const removeVideo = (preview: string) => {
    setVideos((prev) => {
      const item = prev.find((v) => v.preview === preview);
      if (item?.preview.startsWith("blob:")) URL.revokeObjectURL(item.preview);
      const filtered = prev.filter((v) => v.preview !== preview);
      const allItems = [...images, ...filtered].sort(
        (a, b) => a.order - b.order,
      );
      return filtered.map((vid) => {
        const newOrder =
          allItems.findIndex((i) => i.preview === vid.preview) + 1;
        return { ...vid, order: newOrder };
      });
    });
    const allItems = [
      ...images,
      ...videos.filter((v) => v.preview !== preview),
    ].sort((a, b) => a.order - b.order);
    setImages((prev) =>
      prev.map((img) => {
        const newOrder =
          allItems.findIndex((i) => i.preview === img.preview) + 1;
        return { ...img, order: newOrder };
      }),
    );
    setDraggedIndex(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setShowCaptionError(true);
      return;
    }
    setShowCaptionError(false);

    const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
    const hasTikTok = selectedAccounts.some((a) => a.platform === "tiktok");
    const tiktokAccounts = selectedAccounts.filter(
      (a) => a.platform === "tiktok",
    );

    if (hasTikTok) {
      for (const tiktokAccount of tiktokAccounts) {
        const settings =
          tiktokSettings[tiktokAccount.id] ?? defaultTiktokSettings;
        // Default settings have privacy_level: "PUBLIC_TO_EVERYONE", so this should always pass
        if (!settings.privacy_level) {
          setError(
            `TikTok: Privacy level is required. Please select a privacy level for @${tiktokAccount.platformUsername ?? "TikTok"}.`,
          );
          return;
        }

        if (
          settings.brand_content_toggle &&
          !settings.brand_organic &&
          !settings.brand_content
        ) {
          setError(
            `TikTok: If promoting a brand/product/service, you must select at least one option (Your brand or Branded content).`,
          );
          return;
        }

        if (settings.brand_content && settings.privacy_level === "SELF_ONLY") {
          setError(
            `TikTok: Branded content visibility cannot be set to private. Please select Public or Friends.`,
          );
          return;
        }
      }
    }

    setLoading(true);
    setError(null);
    setOverlayPhase("uploading");

    const sortedItems = getAllItems();
    const mediaIds: (string | null)[] = new Array(sortedItems.length).fill(
      null,
    );

    type UploadTarget = {
      file: File;
      mediaIndex: number;
    };

    const uploadTargets: UploadTarget[] = [];

    sortedItems.forEach((item, mediaIndex) => {
      if (item.existingId) {
        mediaIds[mediaIndex] = item.existingId;
      } else if (item.file) {
        uploadTargets.push({ file: item.file, mediaIndex });
      }
    });

    if (uploadTargets.length > 0) {
      setFileProgresses(new Array(uploadTargets.length).fill(0));
      const uploadResults = await Promise.allSettled(
        uploadTargets.map((target, fileIndex) =>
          uploadFile(target.file, fileIndex, (idx, percent) => {
            setFileProgresses((prev) => {
              const next = [...prev];
              next[idx] = percent;
              const sum = next.reduce((a, b) => a + b, 0);
              const avg =
                next.length > 0 ? Math.round(sum / next.length) : percent;
              setUploadProgress(`${avg}%`);
              return next;
            });
          }),
        ),
      );

      const failed = uploadResults
        .map((result, i) => ({ result, target: uploadTargets[i] }))
        .filter(
          (
            entry,
          ): entry is { result: PromiseRejectedResult; target: UploadTarget } =>
            entry.result.status === "rejected",
        );

      if (failed.length > 0) {
        const firstReason = failed[0].result.reason;
        const message =
          firstReason instanceof Error
            ? firstReason.message
            : typeof firstReason === "string"
              ? firstReason
              : "Failed to upload one or more media items.";
        setError(message);
        setLoading(false);
        setOverlayPhase("idle");
        setUploadProgress(null);
        return;
      }

      uploadTargets.forEach((target, i) => {
        const result = uploadResults[i] as PromiseFulfilledResult<{ id: string }>;
        mediaIds[target.mediaIndex] = result.value.id;
      });
    }

    setUploadProgress(null);
    setOverlayPhase(
      (intendedModeRef.current ?? mode) === "draft" ? "saving" : "publishing",
    );

    const text = content.trim();
    const accountIds = Array.from(selectedIds);

    const metadata: Record<string, unknown> = {};
    if (hasTikTok) {
      metadata.tiktok = tiktokAccounts.reduce<
        Record<string, TikTokPostSettings>
      >((acc, tiktokAccount) => {
        acc[tiktokAccount.id] =
          tiktokSettings[tiktokAccount.id] ?? defaultTiktokSettings;
        return acc;
      }, {});
    }
    const meta = Object.keys(metadata).length > 0 ? metadata : undefined;

    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;

    if (initialDraftId) {
      const { updateDraft, updateAndPublish, updatePost } =
        await import("@/app/actions/posts");
      if (effectiveMode === "draft") {
        const result = await updateDraft(
          initialDraftId,
          text,
          accountIds,
          mediaIds,
          meta,
        );
        setLoading(false);
        setOverlayPhase("idle");
        if (result.success) {
          router.push("/dashboard/posts/drafts");
          router.refresh();
        } else {
          setError(result.error);
        }
        return;
      }
      if (effectiveMode === "now") {
        const result = await updateAndPublish(
          initialDraftId,
          text,
          accountIds,
          mediaIds,
          meta,
        );
        setLoading(false);
        if (!result.success) {
          setError(result.error);
          setOverlayPhase("idle");
          return;
        }
        setPublishedPostId(result.postId);
        setOverlayPhase("done");
        router.refresh();
        if (
          resurfaceConfig &&
          selectedAccounts.some((a) => a.platform === "twitter_x")
        ) {
          createResurfaceSchedule(
            result.postId,
            "x",
            resurfaceConfig.intervalHours,
            resurfaceConfig.maxResurfaces,
            resurfaceConfig.plugComment?.trim() || null,
          ).catch(() => {});
        }
        if (autoPlugConfig) {
          const xAccount = selectedAccounts.find(
            (a) => a.platform === "twitter_x",
          );
          if (xAccount) {
            createAutoPlug(result.postId, xAccount.id, autoPlugConfig).catch(
              () => {},
            );
          }
        }
        return;
      }
      if (effectiveMode === "scheduled") {
        const result = await updatePost(
          initialDraftId,
          text,
          accountIds,
          scheduledAt,
          mediaIds,
          meta,
        );
        setLoading(false);
        setOverlayPhase("idle");
        if (result.success) {
          router.push("/dashboard/posts/scheduled");
          router.refresh();
        } else {
          setError(result.error);
        }
        return;
      }
    }

    const result = await createPost(
      text,
      accountIds,
      effectiveMode,
      scheduledAt,
      mediaIds,
      meta,
    );
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      setOverlayPhase("idle");
      return;
    }
    if (effectiveMode === "now" && result.postId) {
      const publishResult = await publishPost(result.postId);
      const succeededCount =
        publishResult?.results?.filter((r) => r.status === "published")
          .length ?? 0;
      if (succeededCount === 0) {
        setError(publishResult?.error ?? "Publish failed");
        setOverlayPhase("idle");
        return;
      }
      setPublishedPostId(result.postId);
      setOverlayPhase("done");
      if (
        resurfaceConfig &&
        selectedAccounts.some((a) => a.platform === "twitter_x")
      ) {
        createResurfaceSchedule(
          result.postId,
          "x",
          resurfaceConfig.intervalHours,
          resurfaceConfig.maxResurfaces,
          resurfaceConfig.plugComment?.trim() || null,
        ).catch(() => {});
      }
      if (autoPlugConfig) {
        const xAccount = selectedAccounts.find(
          (a) => a.platform === "twitter_x",
        );
        if (xAccount) {
          createAutoPlug(result.postId, xAccount.id, autoPlugConfig).catch(
            () => {},
          );
        }
      }
      router.push(`/dashboard/posts/${result.postId}`);
      router.refresh();
      return;
    }
    if (effectiveMode === "draft") {
      setOverlayPhase("idle");
      router.push("/dashboard/posts/drafts");
      router.refresh();
      return;
    }
    if (effectiveMode === "scheduled") {
      setOverlayPhase("idle");
      router.push("/dashboard/posts/scheduled");
      router.refresh();
      return;
    }
    setOverlayPhase("idle");
    router.refresh();
  };

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const selectedAccountIds = Array.from(selectedIds);
  const hasXForResurface =
    getResurfacePlatforms(selectedAccountIds, accounts).length > 0;
  const resurfaceVisible = hasXForResurface;
  const autoPlugVisible = hasXForResurface;
  const hasTikTok = selectedAccounts.some((a) => a.platform === "tiktok");
  const tiktokAccounts = selectedAccounts.filter(
    (a) => a.platform === "tiktok",
  );

  const hasContent = content.trim().length > 0;
  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
        : "Post now";

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const q = accountSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.platformUsername?.toLowerCase().includes(q) ||
        a.platform?.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);

  const allItemsSorted = useMemo(() => getAllItems(), [getAllItems]);
  const previewItem = allItemsSorted[carouselPreviewIndex] ?? null;

  if (draftLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted">
        Loading draft...
      </div>
    );
  }

  return (
    <>
      {overlayPhase !== "idle" && (
        <UploadPublishOverlay
          phase={
            overlayPhase === "uploading"
              ? "uploading"
              : overlayPhase === "saving"
                ? "saving"
                : overlayPhase === "publishing"
                  ? "publishing"
                  : "publishing"
          }
          uploadProgress={uploadProgress}
          mediaType="mixed"
          isScheduling={mode === "scheduled"}
          showLinks={overlayPhase === "done"}
          publishedPostId={overlayPhase === "done" ? publishedPostId : null}
          publishedToX={selectedAccounts.some(
            (a) => a.platform === "twitter_x",
          )}
          resurfacePreFill={
            overlayPhase === "done" && resurfaceConfig
              ? {
                  intervalHours: resurfaceConfig.intervalHours,
                  maxResurfaces: resurfaceConfig.maxResurfaces,
                  plugComment: resurfaceConfig.plugComment ?? "",
                }
              : null
          }
        />
      )}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 lg:flex-row lg:items-start"
      >
        <div className="min-w-0 flex-1 space-y-6 lg:max-w-[65%]">
          <PostFormOptions
            accounts={filteredAccounts}
            selectedIds={selectedIds}
            onToggleAccount={toggleAccount}
            selectAll={selectAll}
            mode={mode}
            setMode={setMode}
            scheduledAt={scheduledAt}
            setScheduledAt={setScheduledAt}
            error={error}
            loading={loading}
            submitLabel={submitLabel}
            submitDisabled={
              accounts.length === 0 ||
              (mode === "scheduled" && !scheduledAt) ||
              !hasContent
            }
            use24HourTimeFormat={use24HourTimeFormat}
            hideScheduleAndActions
            searchSlot={
              <input
                type="search"
                placeholder="Search accounts..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="h-8 w-full text-xs rounded border border-border px-2 py-1 text-text placeholder-text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            }
            remember={remember}
            onRememberChange={setRemember}
          />

          {(() => {
            const totalAttachments = images.length + videos.length;
            const hasTwitterX = selectedAccounts.some(
              (a) => a.platform === "twitter_x",
            );
            const hasBluesky = selectedAccounts.some(
              (a) => a.platform === "bluesky",
            );
            const hasPinterest = selectedAccounts.some(
              (a) => a.platform === "pinterest",
            );
            const platformsLabel =
              hasTwitterX && hasBluesky
                ? "X (Twitter) and Bluesky"
                : hasTwitterX
                  ? "X (Twitter)"
                  : hasBluesky
                    ? "Bluesky"
                    : "";
            const showMax4Warning =
              totalAttachments > 4 && (hasTwitterX || hasBluesky);
            const showPinterestWarning =
              totalAttachments > 1 && hasPinterest;
            if (!showMax4Warning && !showPinterestWarning) return null;
            return (
              <div className="space-y-1">
                {showMax4Warning && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    ⚠ {platformsLabel} support up to 4 media attachments per post.
                    You&apos;ve added more than 4, so only the first 4 will be
                    published on those platforms; extra media will be ignored there.
                  </div>
                )}
                {showPinterestWarning && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    ⚠ Pinterest supports only 1 media attachment per post.
                    You&apos;ve added more than 1, so only the first media item
                    will be used on Pinterest; the rest will be ignored there.
                  </div>
                )}
              </div>
            );
          })()}

          <div className="rounded-2xl border border-border bg-bg p-6 shadow-sm space-y-4 -mt-4">
            <label className="block text-sm font-semibold text-text">
              Collection of images and videos (one post)
            </label>
            <p className="text-sm text-text-muted -mt-2">
              Add a caption plus multiple images and/or video in a single post.
            </p>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your caption..."
              rows={3}
              className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {showCaptionError && !content.trim() && (
              <p className="mt-2 text-xs text-destructive">
                Caption is required
              </p>
            )}

            <input
              ref={unifiedInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={onUnifiedFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => unifiedInputRef.current?.click()}
              onMouseEnter={() => setIsUploadZoneHovered(true)}
              onMouseLeave={() => setIsUploadZoneHovered(false)}
              className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 text-text-muted transition-colors ${
                isUploadZoneHovered
                  ? "border-accent bg-accent/5"
                  : "border-border bg-bg-subtle"
              }`}
            >
              <div className="flex items-center gap-2">
                <MdOutlineAddPhotoAlternate className="mb-2 h-8 w-8 text-text-muted" />
                <MdOutlineVideocam className="mb-2 h-8 w-8 text-text-muted" />
              </div>
              <span className="text-sm font-medium">
                Click to add images or videos
              </span>
              <span className="text-xs text-text-muted mt-1">
                JPG, PNG, GIF, MP4, MOV · Hover & paste from clipboard (Ctrl+V)
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
              <span>Images {images.length > 0 && `(${images.length})`}</span>
              <span>Videos {videos.length > 0 && `(${videos.length})`}</span>
            </div>

            {(images.length > 0 || videos.length > 0) && (
              <div className="space-y-3 pt-2 border-t border-border-subtle">
                <p className="text-xs text-text-muted">
                  Carousel post: Drag to reorder (mainly for Instagram)
                </p>
                <div className="flex flex-wrap gap-2">
                  {getAllItems().map((item, index) => {
                    const isVideo = item.type === "video";
                    return (
                      <div
                        key={item.preview}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className="relative shrink-0 cursor-move overflow-hidden rounded-lg border border-border hover:border-accent transition-colors h-20 w-20"
                      >
                        {isVideo ? (
                          <video
                            src={item.preview}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            draggable={false}
                          />
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element -- blob URL preview */
                          <img
                            src={item.preview}
                            alt=""
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        )}
                        {isVideo && (
                          <div className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5">
                            <MdOutlineVideocam className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div className="absolute left-0 right-0 top-0 bg-black/60 px-1.5 py-0.5 text-center">
                          <span className="text-xs font-bold text-white">
                            {item.order}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            isVideo
                              ? removeVideo(item.preview)
                              : removeImage(item.preview)
                          }
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <MdClose className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          {hasTikTok && (
            <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
              <p className="text-xs text-text-muted mb-3">
                Post configurations & tools
              </p>
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() =>
                    setActiveConfigPanel((p) =>
                      p === "tiktok" ? null : "tiktok",
                    )
                  }
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors shrink-0 ${
                    activeConfigPanel === "tiktok"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
                  }`}
                >
                  <Circle className="h-3.5 w-3.5 text-text-muted" />
                  <span>TikTok Config</span>
                  {activeConfigPanel === "tiktok" ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {activeConfigPanel === "tiktok" && (
                <div className="mt-2 border-t border-border pt-4">
                  {tiktokAccounts.length > 1 ? (
                    <>
                      <div className="flex rounded-lg border border-border bg-bg-muted/30 p-0.5 mb-4">
                        {tiktokAccounts.map((acc, idx) => (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => setSelectedTiktokAccountIndex(idx)}
                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                              selectedTiktokAccountIndex === idx
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
                      <TikTokSettings
                        accountId={
                          tiktokAccounts[selectedTiktokAccountIndex]?.id ?? ""
                        }
                        value={
                          tiktokSettings[
                            tiktokAccounts[selectedTiktokAccountIndex]?.id ?? ""
                          ] ?? defaultTiktokSettings
                        }
                        onChange={(s) => {
                          const id =
                            tiktokAccounts[selectedTiktokAccountIndex]?.id;
                          if (id)
                            setTiktokSettings((prev) => ({ ...prev, [id]: s }));
                        }}
                        mediaType={videos.length > 0 ? "video" : "photo"}
                      />
                    </>
                  ) : (
                    <TikTokSettings
                      accountId={tiktokAccounts[0]?.id ?? ""}
                      value={
                        tiktokSettings[tiktokAccounts[0]?.id ?? ""] ??
                        defaultTiktokSettings
                      }
                      onChange={(s) => {
                        const id = tiktokAccounts[0]?.id;
                        if (id)
                          setTiktokSettings((prev) => ({ ...prev, [id]: s }));
                      }}
                      mediaType={videos.length > 0 ? "video" : "photo"}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <SchedulePostSidebar
          mode={mode}
          setMode={setMode}
          scheduledAt={scheduledAt}
          setScheduledAt={setScheduledAt}
          loading={loading}
          submitDisabled={
            accounts.length === 0 ||
            (mode === "scheduled" && !scheduledAt) ||
            !hasContent
          }
          hasAccountSelected={selectedIds.size > 0}
          error={error}
          use24HourTimeFormat={use24HourTimeFormat}
          intendedModeRef={intendedModeRef}
          formRef={formRef}
          draftId={initialDraftId ?? null}
          onDeleteDraft={initialDraftId ? handleDeleteDraft : undefined}
          autoRepost={
            resurfaceVisible
              ? {
                  visible: true,
                  enabled: !!resurfaceConfig,
                  onToggle: () => {
                    if (resurfaceConfig) setResurfaceConfig(null);
                    else {
                      configBeforeResurfaceRef.current = resurfaceConfig;
                      setResurfaceModalOpen(true);
                    }
                  },
                  onOpenSettings: () => {
                    configBeforeResurfaceRef.current = resurfaceConfig;
                    setResurfaceModalOpen(true);
                  },
                }
              : null
          }
          autoPlug={
            autoPlugVisible
              ? {
                  visible: true,
                  enabled: !!autoPlugConfig,
                  onToggle: () => {
                    if (autoPlugConfig) setAutoPlugConfig(null);
                    else {
                      configBeforeAutoPlugRef.current = autoPlugConfig;
                      setAutoplugModalOpen(true);
                    }
                  },
                  onOpenSettings: () => {
                    configBeforeAutoPlugRef.current = autoPlugConfig;
                    setAutoplugModalOpen(true);
                  },
                }
              : null
          }
        >
          <div className="hidden lg:block rounded-xl border border-border bg-bg p-4 shadow-sm -mt-3">
            <h3 className="mb-3 text-sm font-semibold text-text">
              Carousel preview
            </h3>
            {allItemsSorted.length === 0 ? (
              <div className="flex aspect-square w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-bg-subtle text-text-subtle">
                <MdOutlineAddPhotoAlternate className="mb-2 h-12 w-12" />
                <span className="text-xs">Upload media to see preview</span>
              </div>
            ) : (
              <>
                <div className="relative aspect-square w-full max-h-60 overflow-hidden rounded-lg bg-bg-muted">
                  {previewItem?.type === "video" ? (
                    <video
                      src={previewItem.preview}
                      className="h-full w-full object-contain"
                      controls
                      muted
                      playsInline
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewItem?.preview}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (carouselPreviewIndex > 0)
                        setCarouselPreviewIndex(carouselPreviewIndex - 1);
                    }}
                    disabled={carouselPreviewIndex === 0}
                    className="rounded-full p-1 text-text-muted hover:bg-bg hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Previous"
                  >
                    ←
                  </button>
                  <span className="text-xs text-text-muted">
                    {carouselPreviewIndex + 1} / {allItemsSorted.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (carouselPreviewIndex < allItemsSorted.length - 1)
                        setCarouselPreviewIndex(carouselPreviewIndex + 1);
                    }}
                    disabled={
                      carouselPreviewIndex === allItemsSorted.length - 1
                    }
                    className="rounded-full p-1 text-text-muted hover:bg-bg hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Next"
                  >
                    →
                  </button>
                </div>
                <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                  {allItemsSorted.map((item, idx) => (
                    <button
                      key={item.preview}
                      type="button"
                      onClick={() => setCarouselPreviewIndex(idx)}
                      className={`relative h-12 w-12 shrink-0 overflow-hidden rounded border ${
                        idx === carouselPreviewIndex
                          ? "border-accent ring-1 ring-accent"
                          : "border-border"
                      }`}
                    >
                      {item.type === "video" ? (
                        <video
                          src={item.preview}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.preview}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                      {item.type === "video" && (
                        <div className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 rounded-full bg-black/70 px-1 py-0.5">
                          <MdOutlineVideocam className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </SchedulePostSidebar>

        {resurfaceModalOpen && (
          <AutoResurfaceSettingsModal
            isOpen={true}
            selectedAccountIds={selectedAccountIds}
            allAccounts={accounts}
            initialConfig={resurfaceConfig}
            onChange={setResurfaceConfig}
            onDone={() => setResurfaceModalOpen(false)}
            onCancel={() => {
              setResurfaceConfig(configBeforeResurfaceRef.current ?? null);
              setResurfaceModalOpen(false);
            }}
            use24HourTimeFormat={use24HourTimeFormat}
          />
        )}
        {autoplugModalOpen && (
          <AutoPlugSettingsModal
            isOpen={true}
            selectedAccountIds={selectedAccountIds}
            allAccounts={accounts as ConnectedAccount[]}
            initialConfig={autoPlugConfig}
            onChange={setAutoPlugConfig}
            onDone={() => setAutoplugModalOpen(false)}
            onCancel={() => {
              setAutoPlugConfig(configBeforeAutoPlugRef.current ?? null);
              setAutoplugModalOpen(false);
            }}
          />
        )}
      </form>
    </>
  );
}
