"use client";

import { useState, useRef, useMemo, useEffect } from "react";
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
import { TikTokSettingsListModal } from "@/components/TikTokSettingsListModal";
import { MdOutlineVideoLibrary, MdClose, MdImage } from "react-icons/md";
import { type TikTokPostSettings } from "@/components/TikTokSettings";
import { TikTokSettingsModal } from "@/components/TikTokSettingsModal";
import { UploadPublishOverlay } from "@/components/UploadPublishOverlay";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  tokenExpired?: boolean;
};

const defaultTiktokSettings: TikTokPostSettings = {
  privacy_level: "PUBLIC_TO_EVERYONE", // Default to Public
  disable_comment: false,
  disable_duet: false,
  disable_stitch: false,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPostForm({
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
  const coverInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const [content, setContent] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [existingVideoId, setExistingVideoId] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isVertical, setIsVertical] = useState(false);
  const [customThumbnail, setCustomThumbnail] = useState<File | null>(null);
  const [customThumbnailPreview, setCustomThumbnailPreview] = useState<
    string | null
  >(null);
  const validIds = useMemo(
    () => new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id)),
    [accounts],
  );
  const { remember, setRemember, getInitialSelectedIds, persistSelection } =
    useRememberedAccounts("post-form");
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialDraftId ? new Set() : getInitialSelectedIds(validIds),
  );
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(!!initialDraftId);
  const [error, setError] = useState<string | null>(null);
  type OverlayPhase = "idle" | "uploading" | "publishing" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [tiktokSettings, setTiktokSettings] = useState<
    Record<string, TikTokPostSettings>
  >({});
  const [tiktokModalAccountId, setTiktokModalAccountId] = useState<
    string | null
  >(null);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [resurfaceConfig, setResurfaceConfig] =
    useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );
  const [resurfaceModalOpen, setResurfaceModalOpen] = useState(false);
  const [autoplugModalOpen, setAutoplugModalOpen] = useState(false);
  const [tiktokListModalOpen, setTiktokListModalOpen] = useState(false);
  const configBeforeResurfaceRef = useRef<AutoResurfaceConfig | null>(null);
  const configBeforeAutoPlugRef = useRef<AutoPlugConfig | null>(null);
  type PreviewCardMode = "post" | "media";
  const [previewCardMode, setPreviewCardMode] =
    useState<PreviewCardMode>("post");
  const userToggledPreviewRef = useRef(false);
  const [showCaptionError, setShowCaptionError] = useState(false);

  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selectedIds.has(a.id)),
    [accounts, selectedIds],
  );

  const selectedAccountIds = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  );

  const hasXForResurface =
    getResurfacePlatforms(selectedAccountIds, accounts).length > 0;
  const resurfaceVisible = hasXForResurface;
  const autoPlugVisible = hasXForResurface;
  const hasTikTokSelected = accounts.some(
    (a) => selectedIds.has(a.id) && a.platform === "tiktok",
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!videoPreview) setIsVertical(false);
  }, [videoPreview]);

  useEffect(() => {
    if (remember) persistSelection(selectedIds);
  }, [remember, selectedIds, persistSelection]);

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
        const videoMedia = draft.media.find((m) =>
          m.mimeType.startsWith("video/"),
        );
        if (videoMedia) {
          setExistingVideoId(videoMedia.id);
          setVideoPreview(videoMedia.url ?? videoMedia.thumbnailUrl ?? null);
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
  }, [initialDraftId]);

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

  useEffect(() => {
    if (userToggledPreviewRef.current) return;
    const selected = accounts.filter((a) => selectedAccountIds.includes(a.id));
    const hasMediaPreviewPlatform = selected.some(
      (acc) =>
        acc.platform === "instagram" ||
        acc.platform === "tiktok" ||
        acc.platform === "youtube" ||
        acc.platform === "pinterest",
    );
    if (hasMediaPreviewPlatform) {
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
        // Close modal if this account's modal was open
        if (tiktokModalAccountId === id) setTiktokModalAccountId(null);
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

  const [isUploadZoneHovered, setIsUploadZoneHovered] = useState(false);
  const videoPreviewRef = useRef<string | null>(null);
  const customThumbnailPreviewRef = useRef<string | null>(null);
  videoPreviewRef.current = videoPreview;
  customThumbnailPreviewRef.current = customThumbnailPreview;
  useEffect(() => {
    if (!isUploadZoneHovered) return;
    const handlePaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0];
      if (!file || !file.type.startsWith("video/")) return;
      e.preventDefault();
      setError(null);
      if (videoPreviewRef.current) URL.revokeObjectURL(videoPreviewRef.current);
      if (customThumbnailPreviewRef.current)
        URL.revokeObjectURL(customThumbnailPreviewRef.current);
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setVideoDuration(0);
      setCustomThumbnail(null);
      setCustomThumbnailPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isUploadZoneHovered]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file (MP4, WebM, etc.).");
      return;
    }
    setError(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    setVideoDuration(0);
    setCustomThumbnail(null);
    setCustomThumbnailPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeVideo = () => {
    if (videoPreview?.startsWith("blob:")) URL.revokeObjectURL(videoPreview);
    if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
    setVideoFile(null);
    setVideoPreview(null);
    setVideoDuration(0);
    setExistingVideoId(null);
    setCustomThumbnail(null);
    setCustomThumbnailPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
    setCustomThumbnail(file);
    setCustomThumbnailPreview(URL.createObjectURL(file));
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  const clearCoverImage = () => {
    if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
    setCustomThumbnail(null);
    setCustomThumbnailPreview(null);
  };

  const hasTikTok = selectedAccounts.some((a) => a.platform === "tiktok");
  const tiktokAccounts = selectedAccounts.filter(
    (a) => a.platform === "tiktok",
  );

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

        // Validate brand content: if toggle is on, at least one option must be selected
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

        // Validate branded content cannot be private (per TikTok guidelines)
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

    const mediaIds: string[] = [];
    if (existingVideoId && !videoFile) {
      mediaIds.push(existingVideoId);
    } else if (videoFile) {
      try {
        const fd = new FormData();
        fd.set("file", videoFile);
        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (data.id) mediaIds.push(data.id);
      } catch {
        setError("Failed to upload video.");
        setLoading(false);
        setOverlayPhase("idle");
        return;
      }
    }
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
    const meta = Object.keys(metadata).length > 0 ? metadata : undefined;

    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;

    if (initialDraftId) {
      const {
        updateDraft,
        updateAndPublish,
        updatePost,
      } = await import("@/app/actions/posts");
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
            createAutoPlug(
              result.postId,
              xAccount.id,
              autoPlugConfig,
            ).catch(() => {});
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

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const q = accountSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.platformUsername?.toLowerCase().includes(q) ||
        a.platform?.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
        : "Post now";

  const hasVideo = !!videoFile || !!existingVideoId;

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
          uploadProgress={videoFile ? "1 of 1" : null}
          mediaType="video"
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
            onCancel={() => router.push("/dashboard/posts")}
            submitLabel={submitLabel}
            submitDisabled={
              accounts.length === 0 ||
              !content.trim() ||
              !hasVideo ||
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
              Video & caption
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={onFileChange}
              className="hidden"
            />
            {!videoPreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onMouseEnter={() => setIsUploadZoneHovered(true)}
                onMouseLeave={() => setIsUploadZoneHovered(false)}
                className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 text-text-muted transition-colors ${
                  isUploadZoneHovered
                    ? "border-accent bg-accent/5"
                    : "border-border bg-bg-subtle"
                }`}
              >
                <MdOutlineVideoLibrary className="mb-2 h-10 w-10" />
                <span className="text-sm font-medium">Click to add video</span>
                <span className="text-xs text-text-muted mt-1">
                  Hover & paste from clipboard (Ctrl+V)
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative flex h-12 w-16 shrink-0 overflow-hidden rounded border border-border">
                  <video
                    src={videoPreview}
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                    onLoadedMetadata={(e) =>
                      setVideoDuration(e.currentTarget.duration)
                    }
                  />
                  <button
                    type="button"
                    onClick={removeVideo}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 rounded text-white transition-opacity"
                  >
                    <MdClose className="w-3.5 h-3.5" />
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
              <p className="mt-2 text-xs text-destructive">Caption is required</p>
            )}
          </div>
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
          !hasVideo ||
          (mode === "scheduled" && !scheduledAt)
          }
          hasAccountSelected={selectedIds.size > 0}
          error={error}
          use24HourTimeFormat={use24HourTimeFormat}
          onCancel={() => router.push("/dashboard/posts")}
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
          tiktokSettings={
            hasTikTokSelected
              ? {
                  visible: true,
                  onOpenSettings: () => setTiktokListModalOpen(true),
                }
              : null
          }
        >
          <div className="hidden lg:block rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
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
                      {videoPreview && (
                        <div className="mt-2 relative w-full aspect-video max-h-[200px] overflow-hidden rounded-lg bg-bg-muted">
                          <video
                            src={videoPreview}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
                              <svg
                                className="h-5 w-5 ml-0.5 text-white fill-current"
                                viewBox="0 0 24 24"
                                aria-hidden
                              >
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
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
                {!videoPreview ? (
                  <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-bg-muted/30 text-text-muted">
                    <MdOutlineVideoLibrary className="mb-2 h-12 w-12" />
                    <span className="text-xs">Upload media to see preview</span>
                  </div>
                ) : (
                  <>
                    <div
                      className={`mx-auto flex flex-col rounded-3xl overflow-hidden bg-black border-2 border-[#333] aspect-9/16 ${
                        isVertical ? "w-[240px]" : "w-[280px]"
                      }`}
                    >
                      <div
                        className="h-[6px] w-[60px] shrink-0 rounded-full bg-text-muted mt-2 mx-auto"
                        aria-hidden
                      />
                      <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
                        <video
                          src={videoPreview}
                          controls
                          playsInline
                          className={`h-full w-full ${isVertical ? "object-cover" : "object-contain"}`}
                          onLoadedMetadata={(e) => {
                            const v = e.currentTarget;
                            setVideoDuration(v.duration);
                            setIsVertical(v.videoHeight > v.videoWidth);
                          }}
                        />
                      </div>
                      <div
                        className="h-[4px] w-[40px] shrink-0 rounded-full bg-text-muted mb-2 mx-auto"
                        aria-hidden
                      />
                    </div>
                    <p className="mt-2 truncate text-center text-xs text-text-muted">
                      {videoFile?.name}
                    </p>
                    {videoDuration > 0 && (
                      <p className="text-center text-xs text-text-muted">
                        Duration: {formatDuration(videoDuration)}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        onChange={onCoverImageChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text hover:bg-bg-muted transition-colors"
                      >
                        <MdImage className="h-4 w-4" />
                        Set Cover Image
                      </button>
                      {customThumbnailPreview && (
                        <button
                          type="button"
                          onClick={clearCoverImage}
                          className="text-xs font-medium text-text-muted hover:text-text"
                        >
                          Remove cover
                        </button>
                      )}
                    </div>
                    {customThumbnailPreview && (
                      <div className="mt-2 flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={customThumbnailPreview}
                          alt="Cover"
                          className="h-12 w-12 rounded border border-border object-cover"
                        />
                        <span className="text-xs font-medium text-emerald-600">
                          Cover image set ✓
                        </span>
                      </div>
                    )}
                  </>
                )}
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
        {tiktokListModalOpen && (
          <TikTokSettingsListModal
            isOpen={true}
            selectedAccountIds={selectedAccountIds}
            allAccounts={accounts}
            configuredIds={
              selectedAccountIds.length > 0
                ? new Set(
                    accounts
                      .filter(
                        (a) =>
                          selectedIds.has(a.id) &&
                          a.platform === "tiktok" &&
                          tiktokSettings[a.id]?.privacy_level,
                      )
                      .map((a) => a.id),
                  )
                : undefined
            }
            onOpenSettings={(id) => {
              setTiktokModalAccountId(id);
              setTiktokListModalOpen(false);
            }}
            onClose={() => setTiktokListModalOpen(false)}
          />
        )}
        {tiktokModalAccountId && (
          <TikTokSettingsModal
            isOpen={true}
            accountId={tiktokModalAccountId}
            accountUsername={
              accounts.find((a) => a.id === tiktokModalAccountId)
                ?.platformUsername
            }
            value={
              tiktokSettings[tiktokModalAccountId] ?? defaultTiktokSettings
            }
            onChange={(settings) => {
              setTiktokSettings((prev) => ({
                ...prev,
                [tiktokModalAccountId]: settings,
              }));
            }}
            onSave={() => setTiktokModalAccountId(null)}
            onClose={() => setTiktokModalAccountId(null)}
            mediaType="video"
          />
        )}
      </form>
    </>
  );
}
