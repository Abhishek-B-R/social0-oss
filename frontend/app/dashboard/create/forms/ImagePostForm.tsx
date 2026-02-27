/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect, useMemo } from "react";

const PREVIEW_MEDIA_MAX_H = 196;
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { SchedulePostSidebar } from "../SchedulePostSidebar";
import { publishPost } from "@/app/actions/publish";
import {
  createResurfaceSchedule,
  createAutoPlug,
} from "@/app/actions/resurface";
import { useRememberedAccounts } from "@/lib/remembered-accounts";
import { PostFormOptions } from "../PostFormOptions";
import { getResurfacePlatforms } from "@/lib/resurface-utils";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type {
  AutoPlugConfig,
  ConnectedAccount,
} from "@/components/autoplug/AutoPlugPanel";
import { AutoResurfaceSettingsModal } from "@/components/repost/AutoResurfaceSettingsModal";
import { AutoPlugSettingsModal } from "@/components/autoplug/AutoPlugSettingsModal";
import { MdClose } from "react-icons/md";
import { type TikTokPostSettings } from "@/components/TikTokSettings";
import { TikTokSettings } from "@/components/TikTokSettings";
import type { PinterestPostSettings } from "@/components/PinterestSettingsModal";
import { PinterestConfigInline } from "@/components/PinterestConfigInline";
import { UploadPublishOverlay } from "@/components/UploadPublishOverlay";
import { PLATFORMS } from "@/lib/platforms";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  Circle,
  ImagePlus,
} from "lucide-react";

type PlatformCaptionState = {
  overridden: boolean;
  value: string;
};

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

export function ImagePostForm({
  accounts,
  use24HourTimeFormat = false,
  draftId: initialDraftId,
}: {
  accounts: Account[];
  use24HourTimeFormat?: boolean;
  draftId?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageFile[]>([]);
  const imagesRef = useRef<ImageFile[]>([]);
  const validIds = useMemo(
    () => new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id)),
    [accounts],
  );
  const { remember, setRemember, getInitialSelectedIds, persistSelection } =
    useRememberedAccounts("post-form");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialDraftId ? new Set() : getInitialSelectedIds(validIds),
  );
  const [accountSearch, setAccountSearch] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(!!initialDraftId);
  const [error, setError] = useState<string | null>(null);
  type OverlayPhase = "idle" | "uploading" | "publishing" | "done";
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
  const [pinterestSettingsByAccount, setPinterestSettingsByAccount] = useState<
    Record<string, PinterestPostSettings>
  >({});
  const [pinterestError, setPinterestError] = useState<string | null>(null);
  const pinterestSectionRef = useRef<HTMLDivElement>(null);
  type ConfigPanel = "platform-captions" | "pinterest" | "tiktok" | null;
  const [activeConfigPanel, setActiveConfigPanel] = useState<ConfigPanel>(null);
  const [selectedPinterestAccountIndex, setSelectedPinterestAccountIndex] =
    useState(0);
  const [selectedTiktokAccountIndex, setSelectedTiktokAccountIndex] =
    useState(0);
  const configBeforeResurfaceRef = useRef<AutoResurfaceConfig | null>(null);
  const configBeforeAutoPlugRef = useRef<AutoPlugConfig | null>(null);
  type PreviewCardMode = "post" | "media";
  const [previewCardMode, setPreviewCardMode] =
    useState<PreviewCardMode>("post");
  const userToggledPreviewRef = useRef(false);
  const [showCaptionError, setShowCaptionError] = useState(false);
  const [platformCaptions, setPlatformCaptions] = useState<
    Record<string, PlatformCaptionState>
  >({});

  const defaultTiktokSettings: TikTokPostSettings = {
    // Match TikTokSettings defaults: require explicit privacy choice, all interactions off by default.
    privacy_level: "",
    disable_comment: true,
    disable_duet: true,
    disable_stitch: true,
    brand_content_toggle: false,
    brand_organic: false,
    brand_content: false,
  };

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((i) => {
        if (i.preview.startsWith("blob:")) URL.revokeObjectURL(i.preview);
      });
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
        const validAccountIds = new Set(
          accounts.filter((a) => !a.tokenExpired).map((a) => a.id),
        );
        const restoredIds = draft.connectedAccountIds.filter((id) =>
          validAccountIds.has(id),
        );
        setContent(draft.originalContent ?? "");
        setSelectedIds(new Set(restoredIds));
        setScheduledAt(draft.scheduledAt ? new Date(draft.scheduledAt) : null);
        if (draft.scheduledAt) setMode("scheduled");
        const imageMedia = draft.media.filter((m) =>
          m.mimeType.startsWith("image/"),
        );
        setImages(
          imageMedia.map((m, i) => ({
            preview: m.thumbnailUrl ?? m.url ?? "",
            order: i + 1,
            existingId: m.id,
          })),
        );
        const meta = draft.metadata as Record<string, unknown> | null;
        if (meta?.pinterest && typeof meta.pinterest === "object") {
          const pinterest = meta.pinterest as Record<
            string,
            { boardId?: string; title?: string; link?: string }
          >;
          const next: Record<string, PinterestPostSettings> = {};
          for (const id of restoredIds) {
            const acc = accounts.find((a) => a.id === id);
            if (acc?.platform !== "pinterest") continue;
            const p = pinterest[id];
            if (p) {
              next[id] = {
                boardId: p.boardId ?? "",
                title: p.title ?? "",
                link: p.link ?? "",
                rememberBoard: false,
                rememberLink: false,
              };
            }
          }
          if (Object.keys(next).length > 0) setPinterestSettingsByAccount(next);
        }
      } catch {
        if (!cancelled) setError("Failed to load draft");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId, accounts]);

  useEffect(() => {
    if (remember) persistSelection(selectedIds);
  }, [remember, selectedIds, persistSelection]);

  const addImageFromClipboard = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setError(null);
    setImages((prev) => {
      const maxOrder =
        prev.length > 0 ? Math.max(...prev.map((i) => i.order)) : 0;
      return [
        ...prev,
        {
          file,
          preview: URL.createObjectURL(file),
          order: maxOrder + 1,
        },
      ];
    });
  };

  const [isUploadZoneHovered, setIsUploadZoneHovered] = useState(false);
  useEffect(() => {
    if (!isUploadZoneHovered) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            addImageFromClipboard(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isUploadZoneHovered]);

  const handleDeleteDraft = async () => {
    if (!initialDraftId) return;
    try {
      const { deleteDraft } = await import("@/app/actions/posts");
      const result = await deleteDraft(initialDraftId);
      if (result.success) {
        router.push("/dashboard/posts/drafts");
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to delete draft");
    }
  };

  const selectedAccountIds = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  );

  const hasXForResurface =
    getResurfacePlatforms(selectedAccountIds, accounts).length > 0;
  const resurfaceVisible = hasXForResurface; // publishedAt undefined for new posts
  const autoPlugVisible = hasXForResurface; // publishedAt undefined for new posts
  const hasTikTokSelected = accounts.some(
    (a) => selectedIds.has(a.id) && a.platform === "tiktok",
  );

  useEffect(() => {
    if (userToggledPreviewRef.current) return;
    const selectedAccounts = accounts.filter((a) =>
      selectedAccountIds.includes(a.id),
    );
    console.log(
      "selected accounts platforms:",
      selectedAccounts.map((a) => a.platform),
    );
    const hasInstagramOrTikTok = selectedAccounts.some(
      (acc) => acc.platform === "instagram" || acc.platform === "tiktok",
    );
    if (hasInstagramOrTikTok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewCardMode("media");
    } else {
      setPreviewCardMode("post");
    }
  }, [selectedAccountIds, accounts]);

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

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const newImages: ImageFile[] = [];
    const maxOrder =
      images.length > 0 ? Math.max(...images.map((i) => i.order)) : 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) {
        setError("Please select only image files (JPEG, PNG, GIF, WebP).");
        continue;
      }
      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        order: maxOrder + i + 1,
      });
    }
    setError(null);
    setImages((prev) => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const sorted = [...images].sort((a, b) => a.order - b.order);
    const draggedItem = sorted[draggedIndex];
    const newSorted = [...sorted];
    newSorted.splice(draggedIndex, 1);
    newSorted.splice(index, 0, draggedItem);
    setImages(newSorted.map((img, idx) => ({ ...img, order: idx + 1 })));
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const removeImage = (preview: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.preview === preview);
      if (item) URL.revokeObjectURL(item.preview);
      const filtered = prev.filter((i) => i.preview !== preview);
      return filtered.map((img, idx) => ({ ...img, order: idx + 1 }));
    });
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

    if (hasPinterestSelected) {
      const missingBoard = pinterestAccounts.some(
        (acc) => !pinterestSettingsByAccount[acc.id]?.boardId?.trim(),
      );
      if (missingBoard) {
        setPinterestError(
          "Please select a board for Pinterest before posting.",
        );
        setError(null);
        pinterestSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        return;
      }
    }
    setPinterestError(null);
    setLoading(true);
    setError(null);
    setOverlayPhase("uploading");

    const sortedImages = [...images].sort((a, b) => a.order - b.order);
    const mediaIds: string[] = [];
    const total = sortedImages.length;
    for (let i = 0; i < sortedImages.length; i++) {
      const img = sortedImages[i];
      if (img.existingId) {
        mediaIds.push(img.existingId);
        continue;
      }
      if (!img.file) continue;
      setUploadProgress(`${i + 1} of ${total}`);
      try {
        const fd = new FormData();
        fd.set("file", img.file);
        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (data.id) mediaIds.push(data.id);
      } catch {
        setError("Failed to upload an image.");
        setLoading(false);
        setOverlayPhase("idle");
        setUploadProgress(null);
        return;
      }
    }
    setUploadProgress(null);
    setOverlayPhase("publishing");

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
    if (hasPinterestSelected) {
      metadata.pinterest = pinterestAccounts.reduce<
        Record<string, { boardId: string; title?: string; link?: string }>
      >((acc, accnt) => {
        const s = pinterestSettingsByAccount[accnt.id];
        if (!s?.boardId?.trim()) return acc;
        acc[accnt.id] = {
          boardId: s.boardId.trim(),
          ...(s.title?.trim() ? { title: s.title.trim().slice(0, 100) } : {}),
          ...(s.link?.trim() ? { link: s.link.trim() } : {}),
        };
        return acc;
      }, {});
    }
    const accountCaptions: Record<string, string> = {};
    for (const account of selectedAccounts) {
      const platformState = platformCaptions[account.platform] ?? {
        overridden: false,
        value: "",
      };
      if (platformState.overridden) {
        accountCaptions[account.id] = platformState.value.trim();
      }
    }
    if (Object.keys(accountCaptions).length > 0) {
      metadata.accountCaptions = accountCaptions;
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
      if (!publishResult?.success) {
        setError(publishResult?.error ?? "Publish failed");
        setOverlayPhase("idle");
        return;
      }
      setPublishedPostId(result.postId);
      if (
        resurfaceConfig &&
        selectedAccounts.some((a) => a.platform === "twitter_x")
      ) {
        await createResurfaceSchedule(
          result.postId,
          "x",
          resurfaceConfig.intervalHours,
          resurfaceConfig.maxResurfaces,
          resurfaceConfig.plugComment?.trim() || null,
        );
      }
      if (autoPlugConfig) {
        const xAccount = selectedAccounts.find(
          (a) => a.platform === "twitter_x",
        );
        if (xAccount) {
          await createAutoPlug(result.postId, xAccount.id, autoPlugConfig);
        }
      }
    }
    setOverlayPhase("done");
    router.refresh();
  };

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const uniquePlatformsFromSelection = useMemo(
    () => [...new Set(selectedAccounts.map((a) => a.platform))],
    [selectedAccounts],
  );
  const showPlatformCaptionsSection = selectedIds.size >= 2;
  const platformDisplayName = (platformId: string) =>
    PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;
  const hasTikTok = selectedAccounts.some((a) => a.platform === "tiktok");
  const tiktokAccounts = selectedAccounts.filter(
    (a) => a.platform === "tiktok",
  );
  const hasPinterestSelected = selectedAccounts.some(
    (a) => a.platform === "pinterest",
  );
  const pinterestAccounts = selectedAccounts.filter(
    (a) => a.platform === "pinterest",
  );

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const q = accountSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.platformUsername?.toLowerCase().includes(q) ||
        a.platform?.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);

  const sortedImages = useMemo(
    () => [...images].sort((a, b) => a.order - b.order),
    [images],
  );
  const previewImage = sortedImages[previewIndex] ?? null;

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
        : "Post now";

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
              : overlayPhase === "publishing"
                ? "publishing"
                : "publishing"
          }
          uploadProgress={uploadProgress}
          mediaType="image"
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
        <div className="min-w-0 flex-1 space-y-6">
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
              !content.trim() ||
              images.length === 0 ||
              (mode === "scheduled" && !scheduledAt)
            }
            use24HourTimeFormat={use24HourTimeFormat}
            hideScheduleAndActions
            searchSlot={
              <input
                type="search"
                placeholder="Search accounts..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="h-8 w-full rounded border border-input bg-bg px-2 py-1 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            }
            remember={remember}
            onRememberChange={setRemember}
          />

          <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm space-y-4">
            <label className="block text-sm font-semibold text-text">
              Images & caption
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onFileChange}
              className="hidden"
            />
            {images.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onMouseEnter={() => setIsUploadZoneHovered(true)}
                onMouseLeave={() => setIsUploadZoneHovered(false)}
                className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed py-4 text-text-muted transition-colors ${
                  isUploadZoneHovered
                    ? "border-accent bg-accent/5"
                    : "border-border bg-bg-subtle"
                }`}
              >
                <ImagePlus className="mb-2 h-6 w-6" />
                <span className="text-sm font-medium">
                  Click to add image(s)
                </span>
                <span className="text-xs text-text-muted mt-1">
                  Select multiple to add all at once · Hover & paste from
                  clipboard (Ctrl+V)
                </span>
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-text-muted">
                  Carousel post: Drag to reorder (mainly for Instagram)
                </p>
                <div className="flex flex-wrap gap-2">
                  {sortedImages.map((img, index) => (
                    <div
                      key={img.preview}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      onMouseEnter={() => setPreviewIndex(index)}
                      onClick={() => setPreviewIndex(index)}
                      className="relative h-20 w-20 shrink-0 cursor-move overflow-hidden rounded-lg border border-border hover:border-accent transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- blob URL preview */}
                      <img
                        src={img.preview}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                      <div className="absolute left-0 right-0 top-0 bg-black/60 px-1.5 py-0.5 text-center">
                        <span className="text-xs font-bold text-white">
                          {img.order}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(img.preview)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <MdClose className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onMouseEnter={() => setIsUploadZoneHovered(true)}
                    onMouseLeave={() => setIsUploadZoneHovered(false)}
                    className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed text-text-muted transition-colors ${
                      isUploadZoneHovered
                        ? "border-accent bg-accent/5"
                        : "border-border bg-bg-subtle"
                    }`}
                    title="Add more · Hover & paste (Ctrl+V)"
                  >
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-xs mt-0.5">Add more</span>
                  </button>
                </div>
              </div>
            )}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a caption..."
              rows={3}
              className="w-full rounded-xl border border-input bg-bg px-4 py-3 text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {showCaptionError && !content.trim() && (
              <p className="mt-2 text-xs text-destructive">
                Caption is required
              </p>
            )}
          </div>

          {(showPlatformCaptionsSection ||
            hasPinterestSelected ||
            hasTikTokSelected) && (
            <div
              ref={pinterestSectionRef}
              className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm"
            >
              <p className="text-xs text-text-muted mb-3">
                Post configurations & tools
              </p>
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
                {showPlatformCaptionsSection && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveConfigPanel((p) =>
                        p === "platform-captions" ? null : "platform-captions",
                      )
                    }
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors shrink-0 ${
                      activeConfigPanel === "platform-captions"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
                    }`}
                  >
                    <Circle className="h-3.5 w-3.5 text-text-muted" />
                    <span>Platform Captions</span>
                    {activeConfigPanel === "platform-captions" ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {hasPinterestSelected && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveConfigPanel((p) =>
                        p === "pinterest" ? null : "pinterest",
                      )
                    }
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors shrink-0 ${
                      activeConfigPanel === "pinterest"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
                    }`}
                  >
                    {pinterestAccounts.some(
                      (acc) =>
                        !pinterestSettingsByAccount[acc.id]?.boardId?.trim(),
                    ) ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    )}
                    <span>Pinterest Config</span>
                    {activeConfigPanel === "pinterest" ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {hasTikTokSelected && (
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
                )}
              </div>

              {activeConfigPanel === "pinterest" && (
                <div className="mt-2 border-t border-border pt-4">
                  {pinterestAccounts.length > 1 ? (
                    <>
                      <div className="flex rounded-lg border border-border bg-bg-muted/30 p-0.5 mb-4">
                        {pinterestAccounts.map((acc, idx) => (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() =>
                              setSelectedPinterestAccountIndex(idx)
                            }
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
                          pinterestAccounts[selectedPinterestAccountIndex]
                            ?.id ?? ""
                        }
                        value={
                          pinterestSettingsByAccount[
                            pinterestAccounts[selectedPinterestAccountIndex]
                              ?.id ?? ""
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
                            pinterestAccounts[selectedPinterestAccountIndex]
                              ?.id;
                          if (id)
                            setPinterestSettingsByAccount((prev) => ({
                              ...prev,
                              [id]: s,
                            }));
                        }}
                        isVisible={true}
                      />
                    </>
                  ) : (
                    <PinterestConfigInline
                      accountId={pinterestAccounts[0]?.id ?? ""}
                      value={
                        pinterestSettingsByAccount[
                          pinterestAccounts[0]?.id ?? ""
                        ] ?? {
                          boardId: "",
                          title: "",
                          link: "",
                          rememberBoard: false,
                          rememberLink: false,
                        }
                      }
                      onChange={(s) => {
                        const id = pinterestAccounts[0]?.id;
                        if (id)
                          setPinterestSettingsByAccount((prev) => ({
                            ...prev,
                            [id]: s,
                          }));
                      }}
                      isVisible={true}
                    />
                  )}
                  {pinterestError && (
                    <p
                      className="mt-3 text-sm text-destructive font-medium"
                      role="alert"
                    >
                      {pinterestError}
                    </p>
                  )}
                </div>
              )}

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
                        mediaType="photo"
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
                      mediaType="photo"
                    />
                  )}
                </div>
              )}

              {activeConfigPanel === "platform-captions" && (
                <div className="mt-2 border-t border-border pt-4 space-y-4">
                  {uniquePlatformsFromSelection.map((platformId) => {
                    const state =
                      platformCaptions[platformId] ??
                      ({
                        overridden: false,
                        value: "",
                      } as PlatformCaptionState);
                    const displayName = platformDisplayName(platformId);
                    return (
                      <div
                        key={platformId}
                        className="rounded-xl border border-border bg-bg p-4"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-text">
                            {displayName}
                          </span>
                          <div className="flex items-center gap-2">
                            {state.overridden ? (
                              <>
                                <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                                  Edited caption
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPlatformCaptions((prev) => ({
                                      ...prev,
                                      [platformId]: {
                                        overridden: false,
                                        value: "",
                                      },
                                    }))
                                  }
                                  className="text-xs font-medium text-accent hover:text-accent-hover"
                                >
                                  Clear
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-text-muted">
                                  Using main caption
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPlatformCaptions((prev) => ({
                                      ...prev,
                                      [platformId]: {
                                        overridden: true,
                                        value: content.trim(),
                                      },
                                    }))
                                  }
                                  className="text-xs font-medium text-accent hover:text-accent-hover"
                                >
                                  Edit
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <textarea
                          rows={3}
                          placeholder={
                            state.overridden
                              ? undefined
                              : content || "Main caption..."
                          }
                          value={state.overridden ? state.value : ""}
                          readOnly={!state.overridden}
                          onChange={(e) =>
                            state.overridden &&
                            setPlatformCaptions((prev) => ({
                              ...prev,
                              [platformId]: {
                                ...(prev[platformId] ?? {
                                  overridden: false,
                                  value: "",
                                }),
                                overridden: true,
                                value: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-input bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-70"
                        />
                      </div>
                    );
                  })}
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
            !content.trim() ||
            images.length === 0 ||
            (mode === "scheduled" && !scheduledAt)
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
                    if (resurfaceConfig) {
                      setResurfaceConfig(null);
                    } else {
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
                    if (autoPlugConfig) {
                      setAutoPlugConfig(null);
                    } else {
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
          <div className="hidden lg:block">
            <div className="rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex rounded-full border border-border bg-bg-muted p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      userToggledPreviewRef.current = true;
                      setPreviewCardMode("post");
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      previewCardMode === "post"
                        ? "bg-accent text-white"
                        : "bg-transparent text-text-muted hover:bg-bg hover:text-text"
                    }`}
                  >
                    Post Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      userToggledPreviewRef.current = true;
                      setPreviewCardMode("media");
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      previewCardMode === "media"
                        ? "bg-accent text-white"
                        : "bg-transparent text-text-muted hover:bg-bg hover:text-text"
                    }`}
                  >
                    Media Preview
                  </button>
                </div>
              </div>
              {previewCardMode === "post" ? (
                <>
                  <div className="rounded-lg border border-border bg-bg p-3 shadow-sm">
                    <div className="flex gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-bg-muted flex items-center justify-center text-sm font-semibold text-text-muted">
                        {selectedAccounts[0]?.profileImageUrl?.trim() ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={selectedAccounts[0].profileImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          (selectedAccounts[0]?.platformUsername ?? "?")
                            .charAt(0)
                            .toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text">
                          {selectedAccounts[0]?.platformUsername
                            ? `@${selectedAccounts[0].platformUsername}`
                            : "@username"}{" "}
                          <span className="font-normal text-text-muted">
                            · now
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-text/80 whitespace-pre-wrap wrap-break-word">
                          {content.trim() || (
                            <span className="italic text-text-muted">
                              Caption...
                            </span>
                          )}
                        </p>
                        {sortedImages.length > 0 && (
                          <div
                            className="mt-2 w-full max-h-[150px] flex gap-0.5 overflow-hidden rounded-lg"
                            style={{ maxHeight: PREVIEW_MEDIA_MAX_H }}
                          >
                            {sortedImages.length === 1 && (
                              <div className="aspect-video w-full min-h-0 max-h-[150px] overflow-hidden rounded-lg bg-bg-muted">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={sortedImages[0].preview}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                            {sortedImages.length === 2 && (
                              <div className="flex h-[150px] w-full gap-0.5">
                                <div className="flex-1 min-w-0 overflow-hidden rounded-l-lg">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={sortedImages[0].preview}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="flex-1 min-w-0 overflow-hidden rounded-r-lg">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={sortedImages[1].preview}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              </div>
                            )}
                            {sortedImages.length === 3 && (
                              <div className="grid grid-cols-2 gap-0.5 w-full max-h-[150px]">
                                <div className="row-span-2 min-h-0 overflow-hidden rounded-l-lg">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={sortedImages[0].preview}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="min-h-0 overflow-hidden rounded-tr-lg">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={sortedImages[1].preview}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="min-h-0 overflow-hidden rounded-br-lg">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={sortedImages[2].preview}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              </div>
                            )}
                            {sortedImages.length >= 4 && (
                              <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full h-[150px]">
                                {sortedImages.slice(0, 4).map((img) => (
                                  <div
                                    key={img.preview}
                                    className="min-w-0 min-h-0 overflow-hidden rounded-lg"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={img.preview}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-4 text-sm text-text-muted">
                          <span>♡ 0</span>
                          <span>↺ 0</span>
                          <span>💬 0</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {selectedAccounts.length > 1 && (
                    <p className="mt-2 text-xs text-text-muted">
                      Posting to {selectedAccounts.length} platforms
                    </p>
                  )}
                </>
              ) : (
                <>
                  {!previewImage ? (
                    <div className="flex aspect-square w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-bg-muted/30 text-text-muted">
                      <ImagePlus className="mb-2 h-12 w-12" />
                      <span className="text-xs">
                        Upload media to see preview
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-bg-muted">
                        <img
                          src={previewImage.preview}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      </div>
                      {sortedImages.length > 1 && (
                        <div className="mt-2 flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (previewIndex > 0)
                                setPreviewIndex(previewIndex - 1);
                            }}
                            disabled={previewIndex === 0}
                            className="rounded-full p-1 text-text-muted hover:bg-bg hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Previous"
                          >
                            ←
                          </button>
                          <span className="text-xs text-text-muted">
                            {previewIndex + 1} / {sortedImages.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (previewIndex < sortedImages.length - 1)
                                setPreviewIndex(previewIndex + 1);
                            }}
                            disabled={previewIndex === sortedImages.length - 1}
                            className="rounded-full p-1 text-text-muted hover:bg-bg hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Next"
                          >
                            →
                          </button>
                        </div>
                      )}
                      <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                        {sortedImages.map((item, idx) => (
                          <button
                            key={item.preview}
                            type="button"
                            onClick={() => setPreviewIndex(idx)}
                            className={`relative h-12 w-12 shrink-0 overflow-hidden rounded border ${
                              idx === previewIndex
                                ? "border-accent ring-1 ring-accent"
                                : "border-border"
                            }`}
                          >
                            <img
                              src={item.preview}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
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
