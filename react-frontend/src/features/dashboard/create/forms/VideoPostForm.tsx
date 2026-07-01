/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/refs */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { usePostHog } from "@posthog/react";
import { capturePostLifecycle } from "@/lib/posthog-events";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import {
  freePublishBlockReason,
  getFreePostsRemaining,
  isFreePublishBlocked,
} from "@/lib/free-tier-publish";
import { signInUrl } from "@/lib/sign-in-url";
import { createPost, type PublishMode } from "@/api/posts";
import { getPostPublicationList } from "@/api/publish";
import {
  sortBySlowPlatformsLast,
  publishPostWithParallelProgress,
} from "@/lib/publish-order";
import { createResurfaceSchedule, createAutoPlug } from "@/api/resurface";
import {
  useRememberedAccounts,
  useApplyRememberedSelectionWhenReady,
  REMEMBERED_ACCOUNT_KEYS,
} from "@/lib/remembered-accounts";
import { useRememberedAutoRepostAutoPlug } from "@/lib/remembered-autorepost-autoplug";
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
import { AccountAvatar } from "@/components/AccountAvatar";
import { MdOutlineVideoLibrary, MdClose } from "react-icons/md";
import {
  type TikTokPostSettings,
  TikTokSettings,
  DEFAULT_TIKTOK_POST_SETTINGS,
} from "@/components/TikTokSettings";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";
import { PinterestConfigInline } from "@/components/PinterestConfigInline";
import {
  XPostSettingsInline,
  type XPostSettings,
} from "@/components/XPostSettingsInline";
import {
  UploadPublishOverlay,
  type PlatformResult,
  type PlatformStatus,
} from "@/components/UploadPublishOverlay";
import { applyBulkAutoFeaturesToScheduledMetadata } from "@/lib/bulk-auto-features-metadata";
import { PLATFORMS } from "@/lib/platforms";
import {
  validateMediaFile,
  getAccountsExceededByAttachments,
} from "@/lib/media-limits";
import { uploadFile } from "@/lib/upload-file";
import {
  measureVideoAspectRatio,
  getAspectRatioGuidance,
  getTikTokVideoResolutionGuidance,
  type AspectRatioGuidance,
} from "@/lib/video-aspect-ratio";
import {
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_DURATION_MESSAGE,
} from "@/lib/video-duration";
import {
  getAccountsOverVideoLimit,
  type VideoLimitWarning,
  getLimitForAccount,
} from "@/lib/platform-limits";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  Circle,
  Clapperboard,
  ImagePlus,
  Info,
  Play,
} from "lucide-react";
import {
  consumeComposerPayload,
  clearComposerPayload,
} from "@/lib/composer-bridge";
import { AutoResizeTextarea } from "@/components/ui/AutoResizeTextarea";
import { CaptionCounter } from "@/components/caption-counter";
import { toast } from "sonner";
import {
  getPinterestBoardRequiredMessage,
  hasMissingPinterestBoard,
} from "@/lib/pinterest-board-validation";
import { AspectRatioGuidanceBanner } from "@/components/AspectRatioGuidanceBanner";

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
  isTwitterPremium?: boolean;
  tokenExpired?: boolean;
  platformMetadata?: Record<string, unknown>;
};

const defaultTiktokSettings: TikTokPostSettings = DEFAULT_TIKTOK_POST_SETTINGS;
const defaultXPostSettings: XPostSettings = {
  madeWithAi: false,
  paidPartnership: false,
};

// function formatDuration(seconds: number): string {
//   const m = Math.floor(seconds / 60);
//   const s = Math.floor(seconds % 60);
//   return `${m}:${s.toString().padStart(2, "0")}`;
// }

export function VideoPostForm({
  accounts,
  accountsLoading = false,
  use24HourTimeFormat = false,
  dateFormat = "dd/MM/yyyy",
  timezone = null,
  draftId: initialDraftId,
  scheduledId: initialScheduledId,
  editId: initialEditId,
  allowAutoRepost = true,
  allowAutoPlug = true,
  supportedPlatforms,
  subscriptionTier = "free",
  freePostsUsed = 0,
  isGuest = false,
}: {
  accounts: Account[];
  accountsLoading?: boolean;
  use24HourTimeFormat?: boolean;
  dateFormat?: string | null;
  timezone?: string | null;
  draftId?: string;
  scheduledId?: string;
  editId?: string;
  allowAutoRepost?: boolean;
  allowAutoPlug?: boolean;
  supportedPlatforms?: string[];
  subscriptionTier?: "free" | "starter" | "growth" | "pro";
  freePostsUsed?: number;
  isGuest?: boolean;
}) {
  const navigate = useNavigate();
  const invalidateQueries = useInvalidateQueries();
  const posthog = usePostHog();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const intendedQueueSlotIdRef = useRef<string | null>(null);
  const [content, setContent] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [existingVideoId, setExistingVideoId] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoAspectGuidance, setVideoAspectGuidance] =
    useState<AspectRatioGuidance | null>(null);
  const [videoPixelSize, setVideoPixelSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isVertical, setIsVertical] = useState(false);
  const [, setCustomThumbnail] = useState<File | null>(null);
  const [customThumbnailPreview, setCustomThumbnailPreview] = useState<
    string | null
  >(null);
  const validIds = useMemo(
    () => new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id)),
    [accounts],
  );
  const {
    remember,
    setRememberAndSelection,
    getInitialSelectedIds,
    persistSelection,
  } = useRememberedAccounts(REMEMBERED_ACCOUNT_KEYS.videoPost);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialDraftId || initialScheduledId || initialEditId
      ? new Set()
      : getInitialSelectedIds(validIds),
  );
  const [mode, setMode] = useState<PublishMode>("now");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(
    !!(initialDraftId || initialScheduledId || initialEditId),
  );
  type OverlayPhase = "idle" | "uploading" | "publishing" | "saving" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [tiktokSettings, setTiktokSettings] = useState<
    Record<string, TikTokPostSettings>
  >({});
  const [tiktokMaxDurationByAccount, setTiktokMaxDurationByAccount] = useState<
    Record<string, number>
  >({});
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [scheduledPostId, setScheduledPostId] = useState<string | null>(null);
  const [draftSavedPostId, setDraftSavedPostId] = useState<string | null>(null);
  const [xPostSettings, setXPostSettings] =
    useState<XPostSettings>(defaultXPostSettings);
  const [platformStatuses, setPlatformStatuses] = useState<PlatformResult[]>(
    [],
  );
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
  type ConfigPanel =
    | "platform-captions"
    | "pinterest"
    | "tiktok"
    | "x"
    | "youtube"
    | "instagram"
    | null;
  const [activeConfigPanel, setActiveConfigPanel] = useState<ConfigPanel>(null);
  const [selectedPinterestAccountIndex, setSelectedPinterestAccountIndex] =
    useState(0);
  const [selectedTiktokAccountIndex, setSelectedTiktokAccountIndex] =
    useState(0);
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [instagramConfig, setInstagramConfig] = useState<{
    coverImageUrl?: string;
    isTrialReel: boolean;
  }>({ isTrialReel: false });
  const [instagramCoverUploading, setInstagramCoverUploading] = useState(false);
  const [instagramCoverError, setInstagramCoverError] = useState<string | null>(
    null,
  );
  const [instagramCoverWarning, setInstagramCoverWarning] = useState<
    string | null
  >(null);
  const configBeforeResurfaceRef = useRef<AutoResurfaceConfig | null>(null);
  const configBeforeAutoPlugRef = useRef<AutoPlugConfig | null>(null);
  const hasRestoredAutoFeaturesRef = useRef(false);
  const {
    remember: rememberAutoFeatures,
    setRemember: setRememberAutoFeatures,
    getInitialState: getAutoFeaturesInitialState,
    persistAutoRepost,
    persistAutoPlug,
  } = useRememberedAutoRepostAutoPlug();
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
  const uploadAbortRef = useRef<AbortController | null>(null);

  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selectedIds.has(a.id)),
    [accounts, selectedIds],
  );
  const previewAccount =
    selectedAccounts.length > 0
      ? selectedAccounts[selectedAccounts.length - 1]
      : null;

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
  const getPlatformCaptionPreview = (
    platformId: string,
    rawCaption: string,
  ) => {
    const trimmed = rawCaption.trim();
    if (!trimmed) return "";
    const platformAccounts = selectedAccounts.filter(
      (account) => account.platform === platformId,
    );
    const limit =
      platformAccounts.length > 0
        ? Math.min(
            ...platformAccounts.map((account) => getLimitForAccount(account)),
          )
        : getLimitForAccount({ platform: platformId, isTwitterPremium: false });
    if (trimmed.length <= limit) return trimmed;
    if (limit <= 3) return "...";
    return `${trimmed.slice(0, limit - 3)}...`;
  };

  const hasXForResurface =
    getResurfacePlatforms(selectedAccountIds, accounts).length > 0;
  const resurfaceVisible = hasXForResurface;
  const autoPlugVisible = hasXForResurface;
  const setupAutoPlug = async (postId: string) => {
    if (!autoPlugConfig) return true;
    const xAccount = selectedAccounts.find((a) => a.platform === "twitter_x");
    // Stale config can linger (e.g. remembered settings) after X is deselected
    if (!xAccount) return true;
    const autoPlugResult = await createAutoPlug(
      postId,
      xAccount?.id ?? null,
      autoPlugConfig,
    );
    if (!autoPlugResult.success) {
      toast.error(autoPlugResult.error);
      return false;
    }
    return true;
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (!e.ctrlKey && !e.metaKey)) return;
      const form = formRef.current;
      if (!form || !form.contains(e.target as Node)) return;
      e.preventDefault();
      intendedModeRef.current = modeRef.current;
      form.requestSubmit();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Restore Auto-Repost & Auto-Plug from localStorage when Twitter is selected
  useEffect(() => {
    if (!hasXForResurface) {
      hasRestoredAutoFeaturesRef.current = false;
      return;
    }
    if (!rememberAutoFeatures) return;
    if (hasRestoredAutoFeaturesRef.current) return;
    const { autoRepostConfig, autoPlugConfig } = getAutoFeaturesInitialState();
    if (autoRepostConfig) setResurfaceConfig(autoRepostConfig);
    if (autoPlugConfig) setAutoPlugConfig(autoPlugConfig);
    hasRestoredAutoFeaturesRef.current = true;
  }, [hasXForResurface, rememberAutoFeatures, getAutoFeaturesInitialState]);

  // Persist Auto-Repost & Auto-Plug when remember is on
  useEffect(() => {
    if (!rememberAutoFeatures || !hasXForResurface) return;
    persistAutoRepost(!!resurfaceConfig, resurfaceConfig);
    persistAutoPlug(!!autoPlugConfig, autoPlugConfig);
  }, [
    rememberAutoFeatures,
    hasXForResurface,
    resurfaceConfig,
    autoPlugConfig,
    persistAutoRepost,
    persistAutoPlug,
  ]);

  const hasTikTokSelected = accounts.some(
    (a) => selectedIds.has(a.id) && a.platform === "tiktok",
  );
  const hasTikTok = selectedAccounts.some((a) => a.platform === "tiktok");
  const tiktokAccounts = selectedAccounts.filter(
    (a) => a.platform === "tiktok",
  );
  const tiktokSettingsIncomplete =
    hasTikTokSelected &&
    tiktokAccounts.some((acc) => {
      const s = tiktokSettings[acc.id] ?? defaultTiktokSettings;
      return (s.privacy_level ?? "").trim() === "";
    });
  const hasPinterestSelected = selectedAccounts.some(
    (a) => a.platform === "pinterest",
  );
  const hasXSelected = selectedAccounts.some((a) => a.platform === "twitter_x");
  const pinterestAccounts = selectedAccounts.filter(
    (a) => a.platform === "pinterest",
  );
  useEffect(() => {
    if (!hasPinterestSelected) {
      if (pinterestError) setPinterestError(null);
      return;
    }
    if (
      !hasMissingPinterestBoard(
        pinterestAccounts,
        pinterestSettingsByAccount,
      ) &&
      pinterestError
    ) {
      setPinterestError(null);
    }
  }, [
    hasPinterestSelected,
    pinterestAccounts,
    pinterestSettingsByAccount,
    pinterestError,
  ]);
  const hasYouTubeSelected = selectedAccounts.some(
    (a) => a.platform === "youtube",
  );
  const hasInstagramSelected = selectedAccounts.some(
    (a) => a.platform === "instagram",
  );

  const tiktokResolutionGuidance = useMemo(() => {
    if (!hasTikTokSelected || !videoPixelSize) return null;
    return getTikTokVideoResolutionGuidance(
      videoPixelSize.width,
      videoPixelSize.height,
    );
  }, [hasTikTokSelected, videoPixelSize]);

  useEffect(() => {
    if (!videoFile) {
      setVideoAspectGuidance(null);
      setVideoPixelSize(null);
      setIsVertical(false);
      return;
    }
    measureVideoAspectRatio(videoFile).then((m) => {
      setIsVertical(m.height > m.width);
      setVideoPixelSize(
        m.width > 0 && m.height > 0
          ? { width: m.width, height: m.height }
          : null,
      );
      setVideoAspectGuidance(getAspectRatioGuidance(m.ratio));
    });
  }, [videoFile]);

  useEffect(() => {
    if (initialDraftId || initialEditId) return;
    if (searchParams.get("fromComposer") !== "1") return;
    const payload = consumeComposerPayload();
    if (!payload) return;
    if (payload.text) {
      setContent((prev) => (prev ? prev : payload.text));
    }
    const firstVideo = payload.media.find((m) => m.type === "video");
    if (firstVideo) {
      setVideoFile(firstVideo.file);
      setVideoPreview(URL.createObjectURL(firstVideo.file));
    }
    return () => {
      setTimeout(clearComposerPayload, 100);
    };
  }, [initialDraftId, initialEditId, searchParams]);

  const { isHydrated } = useApplyRememberedSelectionWhenReady({
    skip: !!(initialDraftId || initialScheduledId || initialEditId),
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
    if (!initialScheduledId || initialDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getScheduledPost } = await import("@/api/posts");
        const result = await getScheduledPost(initialScheduledId);
        if (cancelled) return;
        if (!result.success) {
          toast.error(result.error);
          setDraftLoading(false);
          return;
        }
        const { post: scheduled } = result;
        const validAccountIds = new Set(
          accounts.filter((a) => !a.tokenExpired).map((a) => a.id),
        );
        const restoredIds = scheduled.connectedAccountIds.filter((id) =>
          validAccountIds.has(id),
        );
        setContent(scheduled.originalContent ?? "");
        setSelectedIds(new Set(restoredIds));
        setScheduledAt(
          scheduled.scheduledAt ? new Date(scheduled.scheduledAt) : null,
        );
        setMode("scheduled");
        if (scheduled.queueSlotId)
          intendedQueueSlotIdRef.current = scheduled.queueSlotId;
        const videoMedia = scheduled.media?.find((m) =>
          m.mimeType.startsWith("video/"),
        );
        if (videoMedia) {
          setExistingVideoId(videoMedia.id);
          setVideoPreview(videoMedia.url ?? videoMedia.thumbnailUrl ?? null);
        }
        const meta = scheduled.metadata as Record<string, unknown> | null;
        if (meta?.x && typeof meta.x === "object") {
          const x = meta.x as Record<string, unknown>;
          setXPostSettings({
            madeWithAi: x.madeWithAi === true,
            paidPartnership: x.paidPartnership === true,
          });
        } else {
          setXPostSettings(defaultXPostSettings);
        }
        if (meta?.tiktok && typeof meta.tiktok === "object") {
          const tiktok = meta.tiktok as Record<string, TikTokPostSettings>;
          const next: Record<string, TikTokPostSettings> = {};
          for (const id of restoredIds) {
            const acc = accounts.find((a) => a.id === id);
            if (acc?.platform !== "tiktok") continue;
            const t = tiktok[id];
            if (t && typeof t === "object") {
              next[id] = {
                privacy_level:
                  typeof t.privacy_level === "string" ? t.privacy_level : "",
                video_title:
                  typeof t.video_title === "string" ? t.video_title : "",
                disable_comment: !!t.disable_comment,
                disable_duet: !!t.disable_duet,
                disable_stitch: !!t.disable_stitch,
                brand_content_toggle: !!t.brand_content_toggle,
                brand_organic: !!t.brand_organic,
                brand_content: !!t.brand_content,
                post_as_draft: !!(t as any).post_as_draft,
                mark_ai_generated: !!(t as any).mark_ai_generated,
                tiktok_post_consent: !!(t as any).tiktok_post_consent,
              };
            }
          }
          if (Object.keys(next).length > 0) setTiktokSettings(next);
        }
        const youtube = meta?.youtube as { title?: string } | undefined;
        if (youtube && typeof youtube.title === "string") {
          setYoutubeTitle(youtube.title.slice(0, 100));
        }
        const videoMeta = meta?.video as
          | {
              durationSeconds?: number;
              isVertical?: boolean;
            }
          | undefined;
        if (
          videoMedia &&
          videoMeta &&
          typeof videoMeta.durationSeconds === "number"
        ) {
          setVideoDuration(videoMeta.durationSeconds);
          if (typeof videoMeta.isVertical === "boolean") {
            setIsVertical(videoMeta.isVertical);
          }
        }
      } catch {
        if (!cancelled) toast.error("Failed to load post");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialScheduledId, initialDraftId, accounts]);

  useEffect(() => {
    if (!initialDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getDraft } = await import("@/api/posts");
        const result = await getDraft(initialDraftId);
        if (cancelled) return;
        if (!result.success) {
          toast.error(result.error);
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
        if (meta?.x && typeof meta.x === "object") {
          const x = meta.x as Record<string, unknown>;
          setXPostSettings({
            madeWithAi: x.madeWithAi === true,
            paidPartnership: x.paidPartnership === true,
          });
        } else {
          setXPostSettings(defaultXPostSettings);
        }
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
                video_title:
                  typeof t.video_title === "string" ? t.video_title : "",
                disable_comment: !!t.disable_comment,
                disable_duet: !!t.disable_duet,
                disable_stitch: !!t.disable_stitch,
                brand_content_toggle: !!t.brand_content_toggle,
                brand_organic: !!t.brand_organic,
                brand_content: !!t.brand_content,
                post_as_draft: !!(t as any).post_as_draft,
                mark_ai_generated: !!(t as any).mark_ai_generated,
                tiktok_post_consent: !!(t as any).tiktok_post_consent,
              };
            }
          }
          if (Object.keys(next).length > 0) setTiktokSettings(next);
        }
        const youtube = meta?.youtube as { title?: string } | undefined;
        if (youtube && typeof youtube.title === "string") {
          setYoutubeTitle(youtube.title.slice(0, 100));
        }
        const videoMeta = meta?.video as
          | {
              durationSeconds?: number;
              isVertical?: boolean;
            }
          | undefined;
        if (
          videoMedia &&
          videoMeta &&
          typeof videoMeta.durationSeconds === "number"
        ) {
          setVideoDuration(videoMeta.durationSeconds);
          if (typeof videoMeta.isVertical === "boolean") {
            setIsVertical(videoMeta.isVertical);
          }
        }
      } catch {
        if (!cancelled) toast.error("Failed to load draft");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId, accounts]);

  useEffect(() => {
    if (!initialEditId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getPostToEdit } = await import("@/api/posts");
        const result = await getPostToEdit(initialEditId);
        if (cancelled) return;
        if (!result.success) {
          toast.error(result.error);
          setDraftLoading(false);
          return;
        }
        const { post: toEdit } = result;
        const validAccountIds = new Set(
          accounts.filter((a) => !a.tokenExpired).map((a) => a.id),
        );
        const restoredIds = toEdit.connectedAccountIds.filter((id) =>
          validAccountIds.has(id),
        );
        setContent(toEdit.originalContent ?? "");
        setSelectedIds(new Set(restoredIds));
        const videoMedia = toEdit.media.find((m) =>
          m.mimeType.startsWith("video/"),
        );
        if (videoMedia) {
          setExistingVideoId(videoMedia.id);
          setVideoPreview(videoMedia.url ?? videoMedia.thumbnailUrl ?? null);
        }
        const meta = toEdit.metadata as Record<string, unknown> | null;
        if (meta?.x && typeof meta.x === "object") {
          const x = meta.x as Record<string, unknown>;
          setXPostSettings({
            madeWithAi: x.madeWithAi === true,
            paidPartnership: x.paidPartnership === true,
          });
        } else {
          setXPostSettings(defaultXPostSettings);
        }
        if (meta?.tiktok && typeof meta.tiktok === "object") {
          const tiktok = meta.tiktok as Record<string, TikTokPostSettings>;
          const next: Record<string, TikTokPostSettings> = {};
          for (const id of restoredIds) {
            const acc = accounts.find((a) => a.id === id);
            if (acc?.platform !== "tiktok") continue;
            const t = tiktok[id];
            if (t && typeof t === "object") {
              next[id] = {
                privacy_level:
                  typeof t.privacy_level === "string" ? t.privacy_level : "",
                video_title:
                  typeof t.video_title === "string" ? t.video_title : "",
                disable_comment: !!t.disable_comment,
                disable_duet: !!t.disable_duet,
                disable_stitch: !!t.disable_stitch,
                brand_content_toggle: !!t.brand_content_toggle,
                brand_organic: !!t.brand_organic,
                brand_content: !!t.brand_content,
                post_as_draft: !!(t as any).post_as_draft,
                mark_ai_generated: !!(t as any).mark_ai_generated,
                tiktok_post_consent: !!(t as any).tiktok_post_consent,
              };
            }
          }
          if (Object.keys(next).length > 0) setTiktokSettings(next);
        }
        const youtube = meta?.youtube as { title?: string } | undefined;
        if (youtube && typeof youtube.title === "string") {
          setYoutubeTitle(youtube.title.slice(0, 100));
        }
        const videoMeta = meta?.video as
          | {
              durationSeconds?: number;
              isVertical?: boolean;
            }
          | undefined;
        if (
          videoMedia &&
          videoMeta &&
          typeof videoMeta.durationSeconds === "number"
        ) {
          setVideoDuration(videoMeta.durationSeconds);
          if (typeof videoMeta.isVertical === "boolean") {
            setIsVertical(videoMeta.isVertical);
          }
        }
      } catch {
        if (!cancelled) toast.error("Failed to load post");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEditId, accounts]);

  const handleDeleteDraft = async () => {
    if (!initialDraftId) return;
    const { deleteDraft } = await import("@/api/posts");
    const result = await deleteDraft(initialDraftId);
    if (result.success) {
      navigate("/dashboard/posts/drafts", { replace: true });
      invalidateQueries();
    } else {
      toast.error(result.error);
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

  const videoLimitState = useMemo(() => {
    if (videoDuration <= 0)
      return {
        accountIds: new Set<string>(),
        warnings: [] as VideoLimitWarning[],
        softAccountIds: new Set<string>(),
        softWarnings: [] as VideoLimitWarning[],
      };
    return getAccountsOverVideoLimit(accounts, videoDuration);
  }, [accounts, videoDuration]);

  const videoLimitDisabledReasons = useMemo(() => {
    const reasons: Record<string, string> = {};
    for (const acc of accounts) {
      if (videoLimitState.accountIds.has(acc.id)) {
        const w = videoLimitState.warnings.find(
          (x) => x.platform === acc.platform,
        );
        reasons[acc.id] = w?.message ?? `Video exceeds ${acc.platform} limit`;
      }
    }
    return reasons;
  }, [accounts, videoLimitState]);

  const videoLimitWarningReasons = useMemo(() => {
    const reasons: Record<string, string> = {};
    for (const acc of accounts) {
      if (videoLimitState.softAccountIds.has(acc.id)) {
        const w = videoLimitState.softWarnings.find(
          (x) => x.platform === acc.platform,
        );
        reasons[acc.id] = w?.message ?? "May limit reach to new audiences.";
      }
    }
    return reasons;
  }, [accounts, videoLimitState]);

  const mediaSizeExceeded = useMemo(
    () =>
      getAccountsExceededByAttachments(
        accounts,
        videoFile ? [{ file: videoFile }] : [],
      ),
    [accounts, videoFile],
  );
  const disabledAccountIds = useMemo(() => {
    const set = new Set(videoLimitState.accountIds);
    mediaSizeExceeded.accountIds.forEach((id) => set.add(id));
    return set;
  }, [videoLimitState.accountIds, mediaSizeExceeded.accountIds]);
  const disabledReasons = useMemo(
    () => ({
      ...videoLimitDisabledReasons,
      ...mediaSizeExceeded.reasons,
    }),
    [videoLimitDisabledReasons, mediaSizeExceeded.reasons],
  );

  const selectableAccounts = accounts.filter(
    (a) =>
      !a.tokenExpired &&
      !videoLimitState.accountIds.has(a.id) &&
      !mediaSizeExceeded.accountIds.has(a.id),
  );
  const selectAll = () => {
    if (selectableAccounts.every((a) => selectedIds.has(a.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableAccounts.map((a) => a.id)));
    }
  };

  const [isUploadZoneHovered, setIsUploadZoneHovered] = useState(false);
  const [isCaptionFocused, setIsCaptionFocused] = useState(false);
  const videoPreviewRef = useRef<string | null>(null);
  const customThumbnailPreviewRef = useRef<string | null>(null);
  videoPreviewRef.current = videoPreview;
  customThumbnailPreviewRef.current = customThumbnailPreview;
  useEffect(() => {
    if (!isUploadZoneHovered && !isCaptionFocused) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (e.target === captionTextareaRef.current) {
        const hasVideo = Array.from(e.clipboardData?.files ?? []).some((f) =>
          f.type.startsWith("video/"),
        );
        if (!hasVideo) return;
      }
      const file = e.clipboardData?.files?.[0];
      if (!file || !file.type.startsWith("video/")) return;
      e.preventDefault();
      const platforms = accounts
        .filter((a) => selectedIds.has(a.id))
        .map((a) => a.platform);
      const validation = validateMediaFile(file, platforms);
      if (!validation.allowed) {
        toast.error(
          validation.error ?? "File too large for selected platforms.",
        );
        return;
      }
      toast.dismiss();
      getVideoDuration(file).then((duration) => {
        if (duration > MAX_VIDEO_DURATION_SECONDS) {
          toast.error(VIDEO_DURATION_MESSAGE);
          return;
        }
        if (videoPreviewRef.current)
          URL.revokeObjectURL(videoPreviewRef.current);
        if (customThumbnailPreviewRef.current)
          URL.revokeObjectURL(customThumbnailPreviewRef.current);
        setVideoFile(file);
        setVideoPreview(URL.createObjectURL(file));
        setVideoDuration(duration);
        setCustomThumbnail(null);
        setCustomThumbnailPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      });
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUploadZoneHovered, isCaptionFocused]);

  useEffect(() => {
    if (!isUploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isUploading]);

  const selectedPlatforms = useMemo(
    () => accounts.filter((a) => selectedIds.has(a.id)).map((a) => a.platform),
    [accounts, selectedIds],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file (MP4, WebM, etc.).");
      return;
    }
    const validation = validateMediaFile(file, selectedPlatforms);
    if (!validation.allowed) {
      toast.error(validation.error ?? "File too large for selected platforms.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    toast.dismiss();
    if (fileInputRef.current) fileInputRef.current.value = "";
    getVideoDuration(file).then((duration) => {
      if (duration > MAX_VIDEO_DURATION_SECONDS) {
        toast.error(VIDEO_DURATION_MESSAGE);
        return;
      }
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setVideoDuration(duration);
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
    setVideoAspectGuidance(null);
    setExistingVideoId(null);
    setCustomThumbnail(null);
    setCustomThumbnailPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const [isDragOverZone, setIsDragOverZone] = useState(false);
  const handleDropVideo = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverZone(false);
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("video/"),
    );
    if (!file) {
      toast.error("Please drop a video file (MP4, WebM, etc.).");
      return;
    }
    const validation = validateMediaFile(file, selectedPlatforms);
    if (!validation.allowed) {
      toast.error(validation.error ?? "File too large for selected platforms.");
      return;
    }
    toast.dismiss();
    if (fileInputRef.current) fileInputRef.current.value = "";
    getVideoDuration(file).then((duration) => {
      if (duration > MAX_VIDEO_DURATION_SECONDS) {
        toast.error(VIDEO_DURATION_MESSAGE);
        return;
      }
      if (videoPreviewRef.current) URL.revokeObjectURL(videoPreviewRef.current);
      if (customThumbnailPreviewRef.current)
        URL.revokeObjectURL(customThumbnailPreviewRef.current);
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setVideoDuration(duration);
      setCustomThumbnail(null);
      setCustomThumbnailPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
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

  const hasVideo = !!videoFile || !!existingVideoId;
  const submitDisabled =
    accounts.length === 0 ||
    !content.trim() ||
    !hasVideo ||
    videoDuration > MAX_VIDEO_DURATION_SECONDS ||
    (mode === "scheduled" && !scheduledAt) ||
    isUploading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.dismiss();
    if (isGuest) {
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = signInUrl(
        window.location.pathname + window.location.search,
      );
      return;
    }

    if (!content.trim()) {
      setShowCaptionError(true);
      return;
    }
    setShowCaptionError(false);

    if (hasVideo && videoDuration > MAX_VIDEO_DURATION_SECONDS) {
      toast.error(VIDEO_DURATION_MESSAGE);
      return;
    }

    if ((intendedModeRef.current ?? mode) === "scheduled") {
      if (!scheduledAt) {
        toast.error("Please select a date and time.");
        return;
      }
      if (scheduledAt <= new Date()) {
        toast.error("Scheduled time must be in the future.");
        return;
      }
    }

    if (hasTikTok) {
      for (const tiktokAccount of tiktokAccounts) {
        const settings =
          tiktokSettings[tiktokAccount.id] ?? defaultTiktokSettings;
        if (!settings.privacy_level?.trim()) {
          toast.error(
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
          toast.error(
            `TikTok: If promoting a brand/product/service, you must select at least one option (Your brand or Branded content).`,
          );
          return;
        }

        // Validate branded content cannot be private (per TikTok guidelines)
        if (settings.brand_content && settings.privacy_level === "SELF_ONLY") {
          toast.error(
            `TikTok: Branded content visibility cannot be set to private. Please select Public or Friends.`,
          );
          return;
        }

        const maxDur = tiktokMaxDurationByAccount[tiktokAccount.id];
        if (
          hasVideo &&
          typeof maxDur === "number" &&
          maxDur > 0 &&
          videoDuration > maxDur
        ) {
          toast.error(
            `TikTok: Video is longer than ${maxDur}s allowed for @${tiktokAccount.platformUsername ?? "TikTok"}. Shorten the video or pick another account.`,
          );
          return;
        }
      }
    }

    if (hasPinterestSelected) {
      const boardMessage = getPinterestBoardRequiredMessage(
        pinterestAccounts,
        pinterestSettingsByAccount,
        (intendedModeRef.current ?? mode) === "scheduled" ? "schedule" : "post",
      );
      if (boardMessage) {
        setPinterestError(boardMessage);
        toast.error(boardMessage);
        setActiveConfigPanel("pinterest");
        pinterestSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        return;
      }
    }
    setPinterestError(null);
    setLoading(true);
    toast.dismiss();
    setScheduledPostId(null);
    setDraftSavedPostId(null);
    setOverlayPhase("uploading");

    const mediaIds: string[] = [];
    if (existingVideoId && !videoFile) {
      mediaIds.push(existingVideoId);
    } else if (videoFile) {
      setIsUploading(true);
      uploadAbortRef.current = new AbortController();
      try {
        const { id } = await uploadFile(
          videoFile,
          0,
          (_, percent) => setUploadPercent(percent),
          { signal: uploadAbortRef.current.signal },
        );
        mediaIds.push(id);
      } catch (err) {
        toast.error(
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
        uploadAbortRef.current = null;
      }
    }
    setOverlayPhase(
      (intendedModeRef.current ?? mode) === "draft" ? "saving" : "publishing",
    );

    const text = content.trim();
    const accountIds = Array.from(selectedIds);

    const metadata: Record<string, unknown> = {
      contentType: "video",
    };
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
    if (hasXSelected) {
      metadata.x = {
        madeWithAi: xPostSettings.madeWithAi,
        paidPartnership: xPostSettings.paidPartnership,
      };
    } else {
      delete metadata.x;
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
    if (hasYouTubeSelected && youtubeTitle.trim()) {
      metadata.youtube = {
        title: youtubeTitle.trim().slice(0, 100),
      };
    }
    if (hasVideo && videoDuration > 0) {
      metadata.video = {
        durationSeconds: videoDuration,
        isVertical,
      };
    }
    if (hasInstagramSelected) {
      metadata.__skipAutoPublish = true;
    }
    const meta = metadata;

    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;

    if (effectiveMode === "scheduled") {
      applyBulkAutoFeaturesToScheduledMetadata(meta, {
        hasTwitterXSelected: selectedAccounts.some(
          (a) => a.platform === "twitter_x",
        ),
        resurfaceConfig,
        autoPlugConfig,
      });
    } else {
      delete meta.bulkAutoFeatures;
    }

    if (initialScheduledId && effectiveMode === "scheduled") {
      const { updatePost } = await import("@/api/posts");
      const result = await updatePost(
        initialScheduledId,
        text,
        accountIds,
        scheduledAt,
        mediaIds,
        meta,
        scheduledAt ? (intendedQueueSlotIdRef.current ?? undefined) : undefined,
      );
      if (scheduledAt) intendedQueueSlotIdRef.current = null;
      setLoading(false);
      if (result.success) {
        setScheduledPostId(initialScheduledId);
        setOverlayPhase("done");
        capturePostLifecycle(
          posthog,
          "post_scheduled",
          "video",
          accountIds.length,
        );
        invalidateQueries();
      } else {
        setOverlayPhase("idle");
        toast.error(result.error);
      }
      return;
    }

    if (initialDraftId) {
      const { updateDraft, updateAndPublish, updatePost } =
        await import("@/api/posts");
      if (effectiveMode === "draft") {
        const result = await updateDraft(
          initialDraftId,
          text,
          accountIds,
          mediaIds,
          meta,
        );
        setLoading(false);
        if (result.success) {
          setDraftSavedPostId(initialDraftId);
          setOverlayPhase("done");
          capturePostLifecycle(
            posthog,
            "post_drafted",
            "video",
            accountIds.length,
          );
          invalidateQueries();
        } else {
          setOverlayPhase("idle");
          toast.error(result.error);
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
          toast.error(result.error);
          setOverlayPhase("idle");
          return;
        }
        if (result.allPlatformsFailed && result.postId) {
          setOverlayPhase("idle");
          navigate(`/dashboard/posts/${result.postId}`, { replace: true });
          invalidateQueries();
          return;
        }
        setPublishedPostId(result.postId);
        setOverlayPhase("done");
        invalidateQueries();
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
        await setupAutoPlug(result.postId);
        capturePostLifecycle(
          posthog,
          "post_published",
          "video",
          accountIds.length,
        );
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
          scheduledAt
            ? (intendedQueueSlotIdRef.current ?? undefined)
            : undefined,
        );
        if (scheduledAt) intendedQueueSlotIdRef.current = null;
        setLoading(false);
        if (result.success) {
          setScheduledPostId(initialDraftId);
          setOverlayPhase("done");
          capturePostLifecycle(
            posthog,
            "post_scheduled",
            "video",
            accountIds.length,
          );
          invalidateQueries();
        } else {
          setOverlayPhase("idle");
          toast.error(result.error);
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
      effectiveMode === "scheduled"
        ? (intendedQueueSlotIdRef.current ?? undefined)
        : undefined,
    );
    if (effectiveMode === "scheduled") intendedQueueSlotIdRef.current = null;
    setLoading(false);
    if (!result.success) {
      toast.error(result.error);
      setOverlayPhase("idle");
      return;
    }
    if (effectiveMode === "now" && result.postId) {
      setPublishedPostId(result.postId);
      console.log(
        "[cover] hasInstagramSelected:",
        hasInstagramSelected,
        "instagramConfig:",
        JSON.stringify(instagramConfig),
      );
      const publishOptions = hasInstagramSelected
        ? {
            instagramConfig: {
              coverImageUrl: instagramConfig.coverImageUrl,
              isTrialReel: instagramConfig.isTrialReel,
            },
          }
        : undefined;
      console.log(
        "[cover] publishOptions being sent:",
        JSON.stringify(publishOptions),
      );
      let list: Awaited<ReturnType<typeof getPostPublicationList>> = [];
      try {
        list = await getPostPublicationList(result.postId);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // Proceed with empty list so publish still runs (e.g. after ETIMEDOUT)
      }
      if (list.length === 0) {
        const publishResult = await publishPostWithParallelProgress(
          result.postId,
          publishOptions,
          () => {},
        );
        const succeededCount =
          publishResult?.results?.filter((r) => r.status === "published")
            .length ?? 0;
        if (succeededCount === 0) {
          setOverlayPhase("idle");
          navigate(`/dashboard/posts/${result.postId}`, { replace: true });
          invalidateQueries();
          return;
        }
        setOverlayPhase("done");
        capturePostLifecycle(
          posthog,
          "post_published",
          "video",
          accountIds.length,
        );
        navigate(`/dashboard/posts/${result.postId}`, { replace: true });
        invalidateQueries();
        return;
      }
      const orderedList = sortBySlowPlatformsLast(list);
      const initial: PlatformResult[] = orderedList.map((pub) => ({
        platform: pub.platform,
        accountId: pub.connectedAccountId,
        accountName: pub.platformUsername
          ? `@${pub.platformUsername}`
          : (PLATFORMS.find((p) => p.id === pub.platform)?.name ??
            pub.platform),
        status: "waiting" as PlatformStatus,
      }));
      setPlatformStatuses(initial);
      setOverlayPhase("publishing");
      await publishPostWithParallelProgress(
        result.postId,
        publishOptions,
        (rows) => {
          setPlatformStatuses((prev) =>
            prev.map((p) => {
              const row = rows.find(
                (r) => r.connectedAccountId === p.accountId,
              );
              if (!row) return p;
              const status: PlatformStatus =
                row.publicationStatus === "published"
                  ? "published"
                  : row.publicationStatus === "failed"
                    ? "failed"
                    : row.publicationStatus === "publishing"
                      ? "processing"
                      : p.status;
              return {
                ...p,
                status,
                error:
                  row.publicationStatus === "failed"
                    ? (row.lastError ?? undefined)
                    : undefined,
                postUrl:
                  row.publicationStatus === "published"
                    ? (row.platformPostUrl ?? undefined)
                    : undefined,
              };
            }),
          );
        },
      );
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
      await setupAutoPlug(result.postId);
      setOverlayPhase("done");
      capturePostLifecycle(
        posthog,
        "post_published",
        "video",
        accountIds.length,
      );
      navigate(`/dashboard/posts/${result.postId}`, { replace: true });
      invalidateQueries();
      return;
    }
    if (effectiveMode === "draft" && result.postId) {
      setDraftSavedPostId(result.postId);
      setOverlayPhase("done");
      capturePostLifecycle(posthog, "post_drafted", "video", accountIds.length);
      invalidateQueries();
      return;
    }
    if (effectiveMode === "scheduled" && result.postId) {
      setScheduledPostId(result.postId);
      setOverlayPhase("done");
      capturePostLifecycle(
        posthog,
        "post_scheduled",
        "video",
        accountIds.length,
      );
      invalidateQueries();
      return;
    }
    setOverlayPhase("idle");
    invalidateQueries();
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

  useEffect(() => {
    if (videoDuration <= 0) return;
    const { accountIds } = getAccountsOverVideoLimit(accounts, videoDuration);
    if (accountIds.size === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      prev.forEach((id) => {
        if (accountIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [videoDuration, accounts]);

  const submitDisabledReason = !content.trim()
    ? "Add a caption"
    : !hasVideo
      ? "Add a video"
      : videoDuration > MAX_VIDEO_DURATION_SECONDS
        ? VIDEO_DURATION_MESSAGE
        : mode === "scheduled" && !scheduledAt
          ? "Pick a date and time to schedule"
          : null;

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? initialDraftId || initialScheduledId || initialEditId
          ? "Update"
          : "Schedule post"
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
          onCancelUpload={
            overlayPhase === "uploading" && videoFile
              ? () => uploadAbortRef.current?.abort()
              : undefined
          }
          mediaType="video"
          isScheduling={mode === "scheduled"}
          showLinks={overlayPhase === "done"}
          draftSuccess={!!draftSavedPostId}
          draftPostId={draftSavedPostId}
          scheduleSuccess={!!scheduledPostId}
          publishedPostId={scheduledPostId ?? publishedPostId}
          publishedToX={selectedAccounts.some(
            (a) => a.platform === "twitter_x",
          )}
          resurfacePreFill={
            overlayPhase === "done" &&
            resurfaceConfig &&
            !scheduledPostId &&
            !draftSavedPostId
              ? {
                  intervalHours: resurfaceConfig.intervalHours,
                  maxResurfaces: resurfaceConfig.maxResurfaces,
                  plugComment: resurfaceConfig.plugComment ?? "",
                }
              : null
          }
          platformStatuses={platformStatuses}
          allDone={
            platformStatuses.length > 0 &&
            platformStatuses.every(
              (p) => p.status === "published" || p.status === "failed",
            )
          }
          onClose={() => {
            const allFailed =
              platformStatuses.length > 0 &&
              platformStatuses.every((p) => p.status === "failed");
            if (allFailed && publishedPostId) {
              navigate(`/dashboard/posts/${publishedPostId}`, {
                replace: true,
              });
              invalidateQueries();
            } else {
              setScheduledPostId(null);
              setDraftSavedPostId(null);
              setOverlayPhase("idle");
            }
          }}
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
            loading={loading || isUploading}
            submitLabel={submitLabel}
            submitDisabled={submitDisabled}
            use24HourTimeFormat={use24HourTimeFormat}
            dateFormat={dateFormat}
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
            onRememberChange={handleRememberChange}
            supportedPlatforms={supportedPlatforms}
            accountsLoading={accountsLoading}
            disabledAccountIds={disabledAccountIds}
            disabledReasons={disabledReasons}
            disabledAccountDefaultReason="Video exceeds this platform's limit"
            warningAccountIds={videoLimitState.softAccountIds}
            warningReasons={videoLimitWarningReasons}
            warningLabel="May limit reach"
            isGuest={isGuest}
            freePostsRemaining={
              !isGuest && subscriptionTier === "free"
                ? getFreePostsRemaining(subscriptionTier, freePostsUsed)
                : null
            }
          />

          {hasVideo &&
            videoDuration > 0 &&
            (videoLimitState.warnings.length > 0 ||
              videoLimitState.softWarnings.length > 0) && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/50 p-4 text-black dark:text-amber-100">
                <p className="font-semibold text-amber-900 dark:text-amber-200 mb-2">
                  Video length limits
                </p>
                <p className="text-sm mb-2">
                  Your video is{" "}
                  <span className="font-medium">
                    {(() => {
                      const minutes = Math.floor(videoDuration / 60);
                      const seconds = videoDuration - minutes * 60;
                      const secondsStr = seconds.toFixed(2).padStart(5, "0");
                      return `${minutes}:${secondsStr}`;
                    })()}
                  </span>{" "}
                  long.
                </p>
                {videoLimitState.warnings.length > 0 && (
                  <>
                    <p className="text-sm mb-1">
                      The following exceed platform limits. Affected accounts
                      are disabled for this post:
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1 mb-2">
                      {videoLimitState.warnings.map((w) => (
                        <li key={w.platform}>{w.message}</li>
                      ))}
                    </ul>
                  </>
                )}
                {videoLimitState.softWarnings.length > 0 && (
                  <>
                    <p className="text-sm mb-1">
                      The following will accept this video but may limit its
                      reach to new audiences:
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {videoLimitState.softWarnings.map((w) => (
                        <li key={w.platform}>{w.message}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

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
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragEnter={() => setIsDragOverZone(true)}
                onDragLeave={() => setIsDragOverZone(false)}
                onDrop={handleDropVideo}
                className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 text-text-muted transition-colors ${
                  isUploadZoneHovered || isDragOverZone
                    ? "border-accent bg-accent/5"
                    : "border-border bg-bg-subtle"
                }`}
              >
                <Clapperboard className="mb-2 h-6 w-6" />
                <span className="text-sm font-medium">
                  Click to add video or drag and drop
                </span>
                <span className="text-xs text-text-muted mt-1">
                  Hover & paste from clipboard (Ctrl+V)
                </span>
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-12 w-16 shrink-0 overflow-hidden rounded border border-border">
                    <video
                      src={videoPreview}
                      poster={customThumbnailPreview ?? undefined}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        setVideoDuration(v.duration);
                        try {
                          v.currentTime = 0.001;
                        } catch {
                          /* ignore */
                        }
                      }}
                    />
                    <span
                      className="pointer-events-none absolute bottom-0.5 right-0.5 z-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 ring-1 ring-white/20 shadow-sm"
                      aria-hidden
                    >
                      <Play className="h-2 w-2 translate-x-[0.5px] fill-current text-white" />
                    </span>
                    <button
                      type="button"
                      onClick={removeVideo}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 rounded text-white transition-opacity"
                    >
                      <MdClose className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <AspectRatioGuidanceBanner guidance={videoAspectGuidance} />
                <AspectRatioGuidanceBanner
                  guidance={tiktokResolutionGuidance}
                />
              </div>
            )}
            <AutoResizeTextarea
              ref={captionTextareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a caption..."
              rows={3}
              className="w-full rounded-xl border border-input bg-bg px-4 py-3 text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              autoFocus
              onFocus={() => setIsCaptionFocused(true)}
              onBlur={() => setIsCaptionFocused(false)}
              maxHeight={220}
            />
            <CaptionCounter
              caption={content}
              selectedAccounts={selectedAccounts.map((a) => ({
                platform: a.platform,
                isTwitterPremium: a.isTwitterPremium ?? false,
                platformUsername: a.platformUsername ?? null,
              }))}
            />
            {showCaptionError && !content.trim() && (
              <p className="mt-2 text-xs text-destructive">
                Caption is required
              </p>
            )}
          </div>

          {(showPlatformCaptionsSection ||
            hasPinterestSelected ||
            hasTikTokSelected ||
            hasXSelected ||
            hasYouTubeSelected ||
            hasInstagramSelected) && (
            <div
              ref={pinterestSectionRef}
              className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm"
            >
              <p className="text-xs text-text-muted mb-3">
                Post configurations & tools
              </p>
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 min-h-[44px] sm:min-h-0 -mx-1 px-1 scrollbar-thin">
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
                    className={`flex items-center gap-2 rounded-full border px-3 py-2 sm:py-1.5 text-sm font-medium transition-colors shrink-0 min-h-[44px] sm:min-h-0 touch-manipulation ${
                      activeConfigPanel === "tiktok"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
                    }`}
                  >
                    {tiktokSettingsIncomplete ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-text-muted shrink-0" />
                    )}
                    <span>TikTok Config</span>
                    {activeConfigPanel === "tiktok" ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {hasXSelected && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveConfigPanel((p) => (p === "x" ? null : "x"))
                    }
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors shrink-0 ${
                      activeConfigPanel === "x"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    <span>X Settings</span>
                    {activeConfigPanel === "x" ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {hasYouTubeSelected && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveConfigPanel((p) =>
                        p === "youtube" ? null : "youtube",
                      )
                    }
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors shrink-0 ${
                      activeConfigPanel === "youtube"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
                    }`}
                  >
                    {!youtubeTitle.trim() ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    )}
                    <span>YouTube Title</span>
                    {activeConfigPanel === "youtube" ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {hasInstagramSelected && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveConfigPanel((p) =>
                        p === "instagram" ? null : "instagram",
                      )
                    }
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors shrink-0 ${
                      activeConfigPanel === "instagram"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
                    }`}
                  >
                    {instagramConfig.coverImageUrl ||
                    instagramConfig.isTrialReel ? (
                      <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-text-muted" />
                    )}
                    <span>Instagram Config</span>
                    {activeConfigPanel === "instagram" ? (
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
                    <div
                      className="relative mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 pr-9 text-sm text-destructive font-medium"
                      role="alert"
                    >
                      {pinterestError}
                      <button
                        type="button"
                        onClick={() => setPinterestError(null)}
                        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-destructive/70 hover:bg-destructive/20 transition-colors"
                        aria-label="Dismiss error"
                      >
                        <MdClose className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {hasTikTok && (
                <div
                  className={
                    activeConfigPanel === "tiktok"
                      ? "mt-2 border-t border-border pt-4"
                      : "hidden"
                  }
                  aria-hidden={activeConfigPanel !== "tiktok"}
                >
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
                        onError={(err) => toast.error(err)}
                        onCreatorInfoLoaded={(info) => {
                          const id =
                            tiktokAccounts[selectedTiktokAccountIndex]?.id ??
                            "";
                          if (id && info.max_video_duration != null) {
                            setTiktokMaxDurationByAccount((prev) => ({
                              ...prev,
                              [id]: info.max_video_duration!,
                            }));
                          }
                        }}
                        mediaType="video"
                        videoDurationSec={
                          videoDuration > 0 ? videoDuration : null
                        }
                        showPreviewHint
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
                      onError={(err) => toast.error(err)}
                      onCreatorInfoLoaded={(info) => {
                        const id = tiktokAccounts[0]?.id ?? "";
                        if (id && info.max_video_duration != null) {
                          setTiktokMaxDurationByAccount((prev) => ({
                            ...prev,
                            [id]: info.max_video_duration!,
                          }));
                        }
                      }}
                      mediaType="video"
                      videoDurationSec={
                        videoDuration > 0 ? videoDuration : null
                      }
                      showPreviewHint
                    />
                  )}
                </div>
              )}

              {activeConfigPanel === "x" && (
                <div className="mt-2 border-t border-border pt-4">
                  <XPostSettingsInline
                    value={xPostSettings}
                    onChange={setXPostSettings}
                    isVisible={activeConfigPanel === "x"}
                  />
                </div>
              )}

              {activeConfigPanel === "youtube" && (
                <div className="mt-2 border-t border-border pt-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="youtube-title-input"
                        className="text-sm font-medium text-text"
                      >
                        YouTube Title
                      </label>
                      <Info
                        className="h-3.5 w-3.5 text-text-muted"
                        aria-hidden
                      />
                      <span className="text-xs text-text-muted">
                        Generated title
                      </span>
                    </div>
                    <input
                      id="youtube-title-input"
                      type="text"
                      value={youtubeTitle}
                      onChange={(e) =>
                        setYoutubeTitle(e.target.value.slice(0, 100))
                      }
                      placeholder="Enter your title here"
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                        activeConfigPanel === "youtube"
                          ? "border-accent bg-accent/5"
                          : "border-border bg-bg"
                      }`}
                    />
                    <p className="text-xs text-text-muted text-right">
                      {100 - youtubeTitle.length}/100 characters remaining
                    </p>
                  </div>
                </div>
              )}

              {activeConfigPanel === "instagram" && (
                <div className="mt-2 border-t border-border pt-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-text mb-1">
                      Custom Cover Image
                    </h4>
                    <p className="text-xs text-text-muted mb-2">
                      Upload an image to use as the reel cover instead of a
                      video frame. For best results use 9:16 (1080×1920), JPEG,
                      under 8MB.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-bg-muted disabled:pointer-events-none disabled:opacity-60">
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          className="sr-only"
                          disabled={instagramCoverUploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            setInstagramCoverError(null);
                            setInstagramCoverWarning(null);
                            const isJpeg =
                              file.type.includes("jpeg") ||
                              file.type.includes("jpg");
                            if (!isJpeg) {
                              setInstagramCoverWarning(
                                "Instagram recommends JPEG for reel covers.",
                              );
                            }
                            setInstagramCoverUploading(true);
                            try {
                              const { url } = await uploadFile(file, 0);
                              console.log("[cover] url:", url);
                              setInstagramConfig((prev) => ({
                                ...prev,
                                coverImageUrl: url,
                              }));
                            } catch (err) {
                              setInstagramCoverError(
                                err instanceof Error
                                  ? err.message
                                  : "Upload failed",
                              );
                              setInstagramConfig((prev) => ({
                                ...prev,
                                coverImageUrl: undefined,
                              }));
                              setInstagramCoverWarning(null);
                            } finally {
                              setInstagramCoverUploading(false);
                            }
                          }}
                        />
                        <ImagePlus className="h-4 w-4" />
                        Upload Cover
                      </label>
                      {instagramConfig.coverImageUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setInstagramConfig((prev) => ({
                              ...prev,
                              coverImageUrl: undefined,
                            }));
                            setInstagramCoverWarning(null);
                          }}
                          className="text-xs font-medium text-text-muted hover:text-text"
                        >
                          Remove cover
                        </button>
                      )}
                    </div>
                    {instagramCoverError && (
                      <p className="mt-1 text-xs text-destructive">
                        {instagramCoverError}
                      </p>
                    )}
                    {instagramCoverWarning && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        {instagramCoverWarning}
                      </p>
                    )}
                    {instagramConfig.coverImageUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <img
                          src={instagramConfig.coverImageUrl}
                          alt="Reel cover"
                          className="h-12 w-12 rounded border border-border object-cover"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            const w = img.naturalWidth;
                            const h = img.naturalHeight;
                            if (!w || !h) return;
                            const ratio = w / h;
                            const targetRatio = 9 / 16;
                            if (Math.abs(ratio - targetRatio) > 0.05) {
                              setInstagramCoverWarning((prev) =>
                                prev
                                  ? `${prev} For best results use 9:16 (1080×1920).`
                                  : "For best results use 9:16 (1080×1920).",
                              );
                            }
                          }}
                        />
                        <span className="text-xs font-medium text-accent">
                          Cover image set
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg p-3">
                    <div>
                      <h4 className="text-sm font-medium text-text">
                        Trial Reel
                      </h4>
                      <p className="text-xs text-text-muted">
                        Test your reel with non-followers first before sharing
                        with everyone.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={instagramConfig.isTrialReel}
                      onClick={() =>
                        setInstagramConfig((prev) => ({
                          ...prev,
                          isTrialReel: !prev.isTrialReel,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                        instagramConfig.isTrialReel
                          ? "border-accent bg-accent"
                          : "border-border bg-bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          instagramConfig.isTrialReel
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
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
                    const effectiveCaption = state.overridden
                      ? state.value
                      : content;
                    const previewCaption = getPlatformCaptionPreview(
                      platformId,
                      effectiveCaption,
                    );
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
                        <AutoResizeTextarea
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
                          maxHeight={160}
                        />
                        <p className="mt-2 text-xs text-text-muted">
                          Preview: {previewCaption || "No caption"}
                        </p>
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
          submitDisabledReason={submitDisabledReason}
          primaryActionDisabled={isFreePublishBlocked(
            subscriptionTier,
            freePostsUsed,
            mode,
          )}
          primaryActionDisabledReason={freePublishBlockReason(
            subscriptionTier,
            freePostsUsed,
            mode,
          )}
          isGuest={isGuest}
          freePostsRemaining={
            !isGuest && subscriptionTier === "free"
              ? getFreePostsRemaining(subscriptionTier, freePostsUsed)
              : null
          }
          use24HourTimeFormat={use24HourTimeFormat}
          dateFormat={dateFormat}
          timezone={timezone}
          intendedModeRef={intendedModeRef}
          intendedQueueSlotIdRef={intendedQueueSlotIdRef}
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
          allowAutoRepost={allowAutoRepost}
          allowAutoPlug={allowAutoPlug}
          rememberAutoFeatures={rememberAutoFeatures}
          onRememberAutoFeaturesChange={setRememberAutoFeatures}
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
                      ? "bg-accent text-accent-foreground"
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
                      ? "bg-accent text-accent-foreground"
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
                    <AccountAvatar
                      accountId={previewAccount?.id}
                      profileImageUrl={previewAccount?.profileImageUrl}
                      username={previewAccount?.platformUsername}
                      platform={previewAccount?.platform}
                      size="md"
                      className="h-10! w-10!"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text inline-flex items-center gap-0.5 flex-wrap">
                        {previewAccount?.platformUsername
                          ? `@${previewAccount.platformUsername}`
                          : "@username"}
                        {previewAccount?.platform === "twitter_x" &&
                          previewAccount?.isTwitterPremium && (
                            <img
                              src="/icons/twitter-premium.svg"
                              alt=""
                              className="h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                          )}{" "}
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
                            autoPlay
                            loop
                            playsInline
                            preload="auto"
                          />
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
                          muted
                          autoPlay
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
                        <span className="text-xs font-medium text-accent">
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
