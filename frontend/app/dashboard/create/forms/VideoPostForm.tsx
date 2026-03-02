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
import { MdOutlineVideoLibrary, MdClose } from "react-icons/md";
import { type TikTokPostSettings } from "@/components/TikTokSettings";
import { TikTokSettings } from "@/components/TikTokSettings";
import type { PinterestPostSettings } from "@/components/PinterestSettingsModal";
import { PinterestConfigInline } from "@/components/PinterestConfigInline";
import { UploadPublishOverlay } from "@/components/UploadPublishOverlay";
import { PLATFORMS } from "@/lib/platforms";
import {
  validateVideoAspectRatio,
  formatAspectRatioLabel,
  getAspectRatioDescriptor,
  ASPECT_RATIO_MESSAGE,
} from "@/lib/video-aspect-ratio";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  Circle,
  Clapperboard,
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
  platformMetadata?: Record<string, unknown>;
};

const defaultTiktokSettings: TikTokPostSettings = {
  privacy_level: "SELF_ONLY", // Default to Public
  disable_comment: true,
  disable_duet: true,
  disable_stitch: true,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
};

// function formatDuration(seconds: number): string {
//   const m = Math.floor(seconds / 60);
//   const s = Math.floor(seconds % 60);
//   return `${m}:${s.toString().padStart(2, "0")}`;
// }

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
  type OverlayPhase = "idle" | "uploading" | "publishing" | "saving" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selectedIds.has(a.id)),
    [accounts, selectedIds],
  );

  const selectedAccountIds = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  );
  const uniquePlatformsFromSelection = useMemo(
    () => [...new Set(selectedAccounts.map((a) => a.platform))],
    [selectedAccounts],
  );
  const showPlatformCaptionsSection = selectedIds.size >= 2;
  const platformDisplayName = (platformId: string) =>
    PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;

  const hasXForResurface =
    getResurfacePlatforms(selectedAccountIds, accounts).length > 0;
  const resurfaceVisible = hasXForResurface;
  const autoPlugVisible = hasXForResurface;
  const hasTikTokSelected = accounts.some(
    (a) => selectedIds.has(a.id) && a.platform === "tiktok",
  );

  useEffect(() => {
    if (!videoPreview) setIsVertical(false);
  }, [videoPreview]);

  useEffect(() => {
    if (remember) persistSelection(selectedIds);
  }, [remember, selectedIds, persistSelection]);

  // Initialize Pinterest board from DB (platformMetadata.pinterestDefaultBoardId)
  useEffect(() => {
    if (initialDraftId) return;
    setPinterestSettingsByAccount((prev) => {
      let next = prev;
      for (const acc of accounts) {
        if (acc.platform !== "pinterest") continue;
        const meta = acc.platformMetadata as
          | Record<string, unknown>
          | undefined;
        const defaultBoardId =
          typeof meta?.pinterestDefaultBoardId === "string"
            ? meta.pinterestDefaultBoardId.trim()
            : "";
        if (!defaultBoardId || prev[acc.id]?.boardId) continue;
        next = {
          ...next,
          [acc.id]: {
            boardId: defaultBoardId,
            title: next[acc.id]?.title ?? "",
            link: next[acc.id]?.link ?? "",
            rememberBoard: next[acc.id]?.rememberBoard ?? false,
            rememberLink: next[acc.id]?.rememberLink ?? false,
          },
        };
      }
      return next;
    });
  }, [accounts, initialDraftId]);

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
        const meta = draft.metadata as Record<string, unknown> | null;
        if (meta?.tiktok && typeof meta.tiktok === "object") {
          const tiktok = meta.tiktok as Record<string, TikTokPostSettings>;
          const next: Record<string, TikTokPostSettings> = {};
          for (const id of draft.connectedAccountIds) {
            const acc = accounts.find((a) => a.id === id);
            if (acc?.platform !== "tiktok") continue;
            const t = tiktok[id];
            if (t && typeof t === "object") {
              next[id] = {
                privacy_level:
                  typeof t.privacy_level === "string" ? t.privacy_level : "",
                disable_comment: !!t.disable_comment,
                disable_duet: !!t.disable_duet,
                disable_stitch: !!t.disable_stitch,
                brand_content_toggle: !!t.brand_content_toggle,
                brand_organic: !!t.brand_organic,
                brand_content: !!t.brand_content,
              };
            }
          }
          if (Object.keys(next).length > 0) setTiktokSettings(next);
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
      validateVideoAspectRatio(file).then((result) => {
        if (!result.valid) {
          setError(
            `${ASPECT_RATIO_MESSAGE} Yours is ${formatAspectRatioLabel(result.ratio)}${getAspectRatioDescriptor(result.ratio)}.`,
          );
          return;
        }
        if (videoPreviewRef.current)
          URL.revokeObjectURL(videoPreviewRef.current);
        if (customThumbnailPreviewRef.current)
          URL.revokeObjectURL(customThumbnailPreviewRef.current);
        setVideoFile(file);
        setVideoPreview(URL.createObjectURL(file));
        setVideoDuration(0);
        setCustomThumbnail(null);
        setCustomThumbnailPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      });
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isUploadZoneHovered]);

  useEffect(() => {
    if (!isUploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isUploading]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file (MP4, WebM, etc.).");
      return;
    }
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    validateVideoAspectRatio(file).then((result) => {
      if (!result.valid) {
        setError(
          `${ASPECT_RATIO_MESSAGE} Yours is ${formatAspectRatioLabel(result.ratio)}${getAspectRatioDescriptor(result.ratio)}.`,
        );
        return;
      }
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setVideoDuration(0);
      setCustomThumbnail(null);
      setCustomThumbnailPreview(null);
    });
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

  // const onCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = e.target.files?.[0];
  //   if (!file || !file.type.startsWith("image/")) return;
  //   if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
  //   setCustomThumbnail(file);
  //   setCustomThumbnailPreview(URL.createObjectURL(file));
  //   if (coverInputRef.current) coverInputRef.current.value = "";
  // };

  // const clearCoverImage = () => {
  //   if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
  //   setCustomThumbnail(null);
  //   setCustomThumbnailPreview(null);
  // };

  const hasTikTok = selectedAccounts.some((a) => a.platform === "tiktok");
  const tiktokAccounts = selectedAccounts.filter(
    (a) => a.platform === "tiktok",
  );
  const tiktokMissingPrivacy =
    hasTikTokSelected &&
    tiktokAccounts.some((acc) => {
      const s = tiktokSettings[acc.id];
      return s !== undefined && (s.privacy_level ?? "").trim() === "";
    });
  const hasPinterestSelected = selectedAccounts.some(
    (a) => a.platform === "pinterest",
  );
  const pinterestAccounts = selectedAccounts.filter(
    (a) => a.platform === "pinterest",
  );
  const hasVideo = !!videoFile || !!existingVideoId;
  const submitDisabled =
    accounts.length === 0 ||
    !content.trim() ||
    !hasVideo ||
    (mode === "scheduled" && !scheduledAt) ||
    isUploading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setShowCaptionError(true);
      return;
    }
    setShowCaptionError(false);

    if ((intendedModeRef.current ?? mode) === "scheduled") {
      if (!scheduledAt) {
        setError("Please select a date and time.");
        return;
      }
      if (scheduledAt <= new Date()) {
        setError("Scheduled time must be in the future.");
        return;
      }
    }

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

    const mediaIds: string[] = [];
    if (existingVideoId && !videoFile) {
      mediaIds.push(existingVideoId);
    } else if (videoFile) {
      setIsUploading(true);
      try {
        const uploadResult = await new Promise<{
          ok: boolean;
          data: { id?: string; error?: string };
        }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const fd = new FormData();
          fd.set("file", videoFile);

          xhr.open("POST", "/api/media/upload");
          xhr.responseType = "json";

          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadPercent(percent);
          };

          xhr.onerror = () => {
            reject(new Error("Network error during video upload."));
          };
          xhr.onabort = () => {
            reject(new Error("Video upload was aborted."));
          };

          xhr.onload = () => {
            const status = xhr.status;
            let body: { id?: string; error?: string } = {};
            try {
              body =
                (xhr.response as { id?: string; error?: string }) ??
                (xhr.responseText
                  ? (JSON.parse(xhr.responseText) as {
                      id?: string;
                      error?: string;
                    })
                  : {});
            } catch {
              body = {};
            }
            resolve({ ok: status >= 200 && status < 300, data: body });
          };

          xhr.send(fd);
        });

        if (!uploadResult.ok) {
          setError(
            uploadResult.data.error ??
              "Video upload failed. The file may be unsupported or too large.",
          );
          setLoading(false);
          setOverlayPhase("idle");
          return;
        }
        if (uploadResult.data.id) mediaIds.push(uploadResult.data.id);
        if (mediaIds.length === 0) {
          setError("Video upload did not return an ID. Please try again.");
          setLoading(false);
          setOverlayPhase("idle");
          return;
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to upload video. Please try again.",
        );
        setLoading(false);
        setOverlayPhase("idle");
        return;
      } finally {
        setIsUploading(false);
        setUploadPercent(null);
      }
    }
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
      const succeededCount =
        publishResult?.results?.filter((r) => r.status === "published")
          .length ?? 0;
      if (succeededCount === 0) {
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
      setOverlayPhase("done");
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
          uploadProgress={videoFile ? "1 of 1" : null}
          uploadPercent={uploadPercent}
          showUploadWarning={isUploading}
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
            loading={loading || isUploading}
            submitLabel={submitLabel}
            submitDisabled={submitDisabled}
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

          <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm space-y-4">
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
                className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 text-text-muted transition-colors ${
                  isUploadZoneHovered
                    ? "border-accent bg-accent/5"
                    : "border-border bg-bg-subtle"
                }`}
              >
                <Clapperboard className="mb-2 h-6 w-6" />
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
              <p className="mt-2 text-xs text-destructive">
                Caption is required
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

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
                    {tiktokMissingPrivacy ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-text-muted" />
                    )}
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
                        mediaType="video"
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
                      mediaType="video"
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
            !hasVideo ||
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
                        <div className="mt-2 relative w-full aspect-video max-h-[180px] overflow-hidden rounded-lg bg-bg-muted">
                          <video
                            key={videoPreview}
                            src={videoPreview}
                            poster={customThumbnailPreview ?? undefined}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="auto"
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
                        isVertical
                          ? "w-[260px] max-h-[420px]"
                          : "w-[308px] max-h-[460px]"
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
                    {/* <p className="mt-2 truncate text-center text-xs text-text-muted">
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
                        <img
                          src={customThumbnailPreview}
                          alt="Cover"
                          className="h-12 w-12 rounded border border-border object-cover"
                        />
                        <span className="text-xs font-medium text-emerald-600">
                          Cover image set ✓
                        </span>
                      </div> 
                    )} */}
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
      </form>
    </>
  );
}
