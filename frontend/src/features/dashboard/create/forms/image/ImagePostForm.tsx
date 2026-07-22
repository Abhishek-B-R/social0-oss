/* eslint-disable react-hooks/set-state-in-effect */

import type { PlatformCaptionState, Account, ImageFile } from "./types";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { usePostHog } from "@posthog/react";
import { capturePostLifecycle } from "@/lib/posthog-events";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  freePublishBlockReason,
  getFreePostsRemaining,
  isFreePublishBlocked,
} from "@/lib/free-tier-publish";
import { signInUrl } from "@/lib/sign-in-url";
import { createPost, type PublishMode } from "@/api/posts";
import { SchedulePostSidebar } from "../../SchedulePostSidebar";
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
import { PostFormOptions } from "../../PostFormOptions";
import { getResurfacePlatforms } from "@/lib/resurface-utils";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type {
  AutoPlugConfig,
  ConnectedAccount,
} from "@/components/autoplug/AutoPlugPanel";
import { AutoResurfaceSettingsModal } from "@/components/repost/AutoResurfaceSettingsModal";
import { AutoPlugSettingsModal } from "@/components/autoplug/AutoPlugSettingsModal";
import { AccountAvatar } from "@/components/AccountAvatar";
import { MdClose } from "react-icons/md";
import { TikTokSettings } from "@/components/TikTokSettings";
import {
  DEFAULT_TIKTOK_POST_SETTINGS,
  type TikTokPostSettings,
} from "@/components/tiktok-post-settings";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";
import { PinterestConfigInline } from "@/components/PinterestConfigInline";
import {
  XPostSettingsInline,
  type XPostSettings,
} from "@/components/XPostSettingsInline";

const PREVIEW_MEDIA_MAX_H = 196;
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
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  Circle,
  ImagePlus,
} from "lucide-react";
import {
  consumeComposerPayload,
  clearComposerPayload,
} from "@/lib/composer-bridge";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { AutoResizeTextarea } from "@/components/ui/AutoResizeTextarea";
import { CaptionCounter } from "@/components/caption-counter";
import { getLimitForAccount } from "@/lib/platform-limits";
import { toast } from "sonner";
import {
  getPinterestBoardRequiredMessage,
  hasMissingPinterestBoard,
} from "@/lib/pinterest-board-validation";

type TikTokAccountMetadata = {
  post_as_draft?: boolean;
  mark_ai_generated?: boolean;
  tiktok_post_consent?: boolean;
};

export function ImagePostForm({
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
  const dash = useDashboardPath();
  const invalidateQueries = useInvalidateQueries();
  const posthog = usePostHog();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const intendedQueueSlotIdRef = useRef<string | null>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageFile[]>([]);
  const imagesRef = useRef<ImageFile[]>([]);
  const validIds = useMemo(
    () => new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id)),
    [accounts],
  );
  const {
    remember,
    setRememberAndSelection,
    getInitialSelectedIds,
    persistSelection,
  } = useRememberedAccounts(REMEMBERED_ACCOUNT_KEYS.imagePost);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialDraftId || initialScheduledId || initialEditId
      ? new Set()
      : getInitialSelectedIds(validIds),
  );
  const [accountSearch, setAccountSearch] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [mode, setMode] = useState<PublishMode>("now");
  const modeRef = useRef(mode);
  // eslint-disable-next-line react-hooks/refs
  modeRef.current = mode;
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(
    !!(initialDraftId || initialScheduledId || initialEditId),
  );
  type OverlayPhase = "idle" | "uploading" | "publishing" | "saving" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const imageUploadAbortRef = useRef<AbortController | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [showPngTikTokInfo, setShowPngTikTokInfo] = useState(false);
  const [tiktokSettings, setTiktokSettings] = useState<
    Record<string, TikTokPostSettings>
  >({});
  const [tiktokConfig, setTiktokConfig] = useState<{
    autoAddMusic: boolean;
  }>({ autoAddMusic: true });
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [scheduledPostId, setScheduledPostId] = useState<string | null>(null);
  const [draftSavedPostId, setDraftSavedPostId] = useState<string | null>(null);
  const [xPostSettings, setXPostSettings] = useState<XPostSettings>({
    madeWithAi: false,
    paidPartnership: false,
  });
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

  // Initialize Pinterest board from DB (platformMetadata.pinterestDefaultBoardId) so user doesn't have to re-select
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
    if (initialDraftId || initialEditId) return;
    if (searchParams.get("fromComposer") !== "1") return;
    const payload = consumeComposerPayload();
    if (!payload) return;
    if (payload.text) {
      setContent((prev) => (prev ? prev : payload.text));
    }
    const composerImages = payload.media.filter((m) => m.type === "image");
    if (composerImages.length) {
      const mapped: ImageFile[] = composerImages.map((m, index) => ({
        file: m.file,
        preview: URL.createObjectURL(m.file),
        order: index + 1,
      }));
      setImages(mapped);
      imagesRef.current = mapped;
    }
    return () => {
      setTimeout(clearComposerPayload, 100);
    };
  }, [initialDraftId, initialEditId, searchParams]);

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

  const [pinterestError, setPinterestError] = useState<string | null>(null);
  const pinterestSectionRef = useRef<HTMLDivElement>(null);
  type ConfigPanel = "platform-captions" | "pinterest" | "tiktok" | "x" | null;
  const [activeConfigPanel, setActiveConfigPanel] = useState<ConfigPanel>(null);
  const [selectedPinterestAccountIndex, setSelectedPinterestAccountIndex] =
    useState(0);
  const [selectedTiktokAccountIndex, setSelectedTiktokAccountIndex] =
    useState(0);
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
  const [fileProgresses, setFileProgresses] = useState<number[]>([]);

  const defaultTiktokSettings: TikTokPostSettings =
    DEFAULT_TIKTOK_POST_SETTINGS;

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
        const { getDraft } = await import("@/api/posts");
        const result = await getDraft(initialDraftId);
        if (cancelled) return;
        if (!result.success) {
          toast.error(result.error);
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
        if (meta?.x && typeof meta.x === "object") {
          const x = meta.x as Record<string, unknown>;
          setXPostSettings({
            madeWithAi: x.madeWithAi === true,
            paidPartnership: x.paidPartnership === true,
          });
        } else {
          setXPostSettings({ madeWithAi: false, paidPartnership: false });
        }
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
                post_as_draft: !!(t as TikTokAccountMetadata).post_as_draft,
                mark_ai_generated: !!(t as TikTokAccountMetadata).mark_ai_generated,
                tiktok_post_consent: !!(t as TikTokAccountMetadata).tiktok_post_consent,
              };
            }
          }
          if (Object.keys(next).length > 0) setTiktokSettings(next);
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
        const imageMedia = toEdit.media.filter((m) =>
          m.mimeType.startsWith("image/"),
        );
        setImages(
          imageMedia.map((m, i) => ({
            preview: m.thumbnailUrl ?? m.url ?? "",
            order: i + 1,
            existingId: m.id,
          })),
        );
        const meta = toEdit.metadata as Record<string, unknown> | null;
        if (meta?.x && typeof meta.x === "object") {
          const x = meta.x as Record<string, unknown>;
          setXPostSettings({
            madeWithAi: x.madeWithAi === true,
            paidPartnership: x.paidPartnership === true,
          });
        } else {
          setXPostSettings({ madeWithAi: false, paidPartnership: false });
        }
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
                post_as_draft: !!(t as TikTokAccountMetadata).post_as_draft,
                mark_ai_generated: !!(t as TikTokAccountMetadata).mark_ai_generated,
                tiktok_post_consent: !!(t as TikTokAccountMetadata).tiktok_post_consent,
              };
            }
          }
          if (Object.keys(next).length > 0) setTiktokSettings(next);
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
        const imageMedia = (scheduled.media ?? []).filter((m) =>
          m.mimeType.startsWith("image/"),
        );
        if (imageMedia.length > 0) {
          const mapped = imageMedia.map((m, i) => ({
            preview: m.thumbnailUrl ?? m.url ?? "",
            order: i + 1,
            existingId: m.id,
          }));
          setImages(mapped);
          imagesRef.current = mapped;
        }
        const meta = scheduled.metadata as Record<string, unknown> | null;
        if (meta?.x && typeof meta.x === "object") {
          const x = meta.x as Record<string, unknown>;
          setXPostSettings({
            madeWithAi: x.madeWithAi === true,
            paidPartnership: x.paidPartnership === true,
          });
        } else {
          setXPostSettings({ madeWithAi: false, paidPartnership: false });
        }
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
                post_as_draft: !!(t as TikTokAccountMetadata).post_as_draft,
                mark_ai_generated: !!(t as TikTokAccountMetadata).mark_ai_generated,
                tiktok_post_consent: !!(t as TikTokAccountMetadata).tiktok_post_consent,
              };
            }
          }
          if (Object.keys(next).length > 0) setTiktokSettings(next);
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

  const addImageFromClipboard = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    toast.dismiss();
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
  const [isCaptionFocused, setIsCaptionFocused] = useState(false);
  useEffect(() => {
    if (!isUploadZoneHovered && !isCaptionFocused) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      // When pasting into the caption textarea, only handle image paste; let text paste use default behavior
      if (e.target === captionTextareaRef.current) {
        const hasImage = Array.from(items).some((item) =>
          item.type.startsWith("image/"),
        );
        if (!hasImage) return;
      }
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
  }, [isUploadZoneHovered, isCaptionFocused]);

  const handleDeleteDraft = async () => {
    if (!initialDraftId) return;
    try {
      const { deleteDraft } = await import("@/api/posts");
      const result = await deleteDraft(initialDraftId);
      if (result.success) {
        navigate(dash("posts/drafts"), { replace: true });
        invalidateQueries();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to delete draft");
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

  const mediaSizeExceeded = useMemo(
    () =>
      getAccountsExceededByAttachments(
        accounts,
        images
          .filter((i): i is ImageFile & { file: File } => i.file != null)
          .map((i) => ({ file: i.file })),
      ),
    [accounts, images],
  );
  const mediaSizeExceededKey = useMemo(
    () => [...mediaSizeExceeded.accountIds].sort().join(","),
    [mediaSizeExceeded],
  );
  useEffect(() => {
    if (mediaSizeExceeded.accountIds.size === 0) return;
    setSelectedIds((prev) => {
      let next: Set<string> = prev;
      for (const id of mediaSizeExceeded.accountIds) {
        if (prev.has(id)) {
          if (next === prev) next = new Set(prev);
          next.delete(id);
        }
      }
      return next;
    });
  }, [mediaSizeExceededKey, mediaSizeExceeded]);

  const selectableAccounts = accounts.filter(
    (a) => !a.tokenExpired && !mediaSizeExceeded.accountIds.has(a.id),
  );
  const selectAll = () => {
    if (selectableAccounts.every((a) => selectedIds.has(a.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableAccounts.map((a) => a.id)));
    }
  };

  // --- SECTION: media upload handlers ---
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const hasTikTokInSelection = accounts.some(
      (a) => selectedIds.has(a.id) && a.platform === "tiktok",
    );
    const TIKTOK_MAX_IMAGES = 35;
    if (hasTikTokInSelection && images.length >= TIKTOK_MAX_IMAGES) {
      toast.error("TikTok allows at most 35 images per post.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const newImages: ImageFile[] = [];
    const maxOrder =
      images.length > 0 ? Math.max(...images.map((i) => i.order)) : 0;
    let added = 0;
    const cap = hasTikTokInSelection
      ? Math.min(files.length, TIKTOK_MAX_IMAGES - images.length)
      : files.length;
    for (let i = 0; i < files.length; i++) {
      if (added >= cap) {
        break;
      }
      const file = files[i];
      if (!file.type.startsWith("image/")) {
        toast.error("Please select only image files (JPEG, PNG, GIF, WebP).");
        continue;
      }
      const validation = validateMediaFile(file);
      if (!validation.allowed) {
        toast.error(validation.error);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (
        hasTikTokInSelection &&
        (file.type === "image/png" || file.name?.toLowerCase().endsWith(".png"))
      ) {
        setShowPngTikTokInfo(true);
      }
      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        order: maxOrder + added + 1,
      });
      added++;
    }
    if (hasTikTokInSelection && files.length > cap && added === cap) {
      toast.error(
        "TikTok allows at most 35 images per post. Only the first " +
          cap +
          " of the selected images were added.",
      );
    } else if (added > 0) {
      toast.dismiss();
    }
    setImages((prev) => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const [isDragOverZone, setIsDragOverZone] = useState(false);
  const TIKTOK_MAX_IMAGES = 35;
  const handleDropImages = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverZone(false);
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (imageFiles.length < files.length) {
      toast.error("Please use only image files (JPEG, PNG, GIF, WebP).");
    }
    if (imageFiles.length === 0) return;
    const hasTikTokDrop = accounts.some(
      (a) => selectedIds.has(a.id) && a.platform === "tiktok",
    );
    if (hasTikTokDrop && images.length >= TIKTOK_MAX_IMAGES) {
      toast.error("TikTok allows at most 35 images per post.");
      return;
    }
    for (const file of imageFiles) {
      const validation = validateMediaFile(file);
      if (!validation.allowed) {
        toast.error(
          validation.error ?? "File too large for selected platforms.",
        );
        return;
      }
    }
    const toAdd = hasTikTokDrop
      ? imageFiles.slice(0, TIKTOK_MAX_IMAGES - images.length)
      : imageFiles;
    if (hasTikTokDrop && imageFiles.length > toAdd.length) {
      toast.error(
        "TikTok allows at most 35 images per post. Only the first " +
          toAdd.length +
          " dropped images were added.",
      );
    } else {
      toast.dismiss();
    }
    const hasPng = toAdd.some(
      (f) => f.type === "image/png" || f.name?.toLowerCase().endsWith(".png"),
    );
    if (hasTikTokDrop && hasPng) setShowPngTikTokInfo(true);
    setImages((prev) => {
      const maxOrder =
        prev.length > 0 ? Math.max(...prev.map((i) => i.order)) : 0;
      const newImages: ImageFile[] = toAdd.map((file, i) => ({
        file,
        preview: URL.createObjectURL(file),
        order: maxOrder + i + 1,
      }));
      return [...prev, ...newImages];
    });
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

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const previewAccount =
    selectedAccounts.length > 0
      ? selectedAccounts[selectedAccounts.length - 1]
      : null;
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

  const hasTwitterXSelected = selectedAccounts.some(
    (a) => a.platform === "twitter_x",
  );
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

  // --- SECTION: submit orchestration ---
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

        if (settings.brand_content && settings.privacy_level === "SELF_ONLY") {
          toast.error(
            `TikTok: Branded content visibility cannot be set to private. Please select Public or Friends.`,
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

    const sortedImages = [...images].sort((a, b) => a.order - b.order);
    const mediaIds: (string | null)[] = new Array(sortedImages.length).fill(
      null,
    );

    type UploadTarget = {
      file: File;
      mediaIndex: number;
    };

    const uploadTargets: UploadTarget[] = [];

    sortedImages.forEach((img, mediaIndex) => {
      if (img.existingId) {
        mediaIds[mediaIndex] = img.existingId;
      } else if (img.file) {
        uploadTargets.push({ file: img.file, mediaIndex });
      }
    });

    if (uploadTargets.length > 0) {
      setFileProgresses(new Array(uploadTargets.length).fill(0));
      const uploadAbortController = new AbortController();
      imageUploadAbortRef.current = uploadAbortController;
      const uploadResults = await Promise.allSettled(
        uploadTargets.map((target, fileIndex) =>
          uploadFile(
            target.file,
            fileIndex,
            (idx, percent) => {
              setFileProgresses((prev) => {
                const next = [...prev];
                next[idx] = percent;
                const sum = next.reduce((a, b) => a + b, 0);
                const avg =
                  next.length > 0 ? Math.round(sum / next.length) : percent;
                setUploadProgress(
                  avg >= 95 ? "Finalizing upload..." : `${avg}%`,
                );
                return next;
              });
            },
            { signal: uploadAbortController.signal },
          ),
        ),
      );
      imageUploadAbortRef.current = null;

      const failed = uploadResults.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (failed.length > 0) {
        const reason = failed[0].reason;
        const message =
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : "Failed to upload one or more images.";
        toast.error(message);
        setLoading(false);
        setOverlayPhase("idle");
        setUploadProgress(null);
        return;
      }

      uploadTargets.forEach((target, i) => {
        const result = uploadResults[i] as PromiseFulfilledResult<{
          id: string;
          url: string;
        }>;
        mediaIds[target.mediaIndex] = result.value.id;
      });
    }

    const finalMediaIds = mediaIds.filter((id): id is string => id !== null);
    if (finalMediaIds.length !== mediaIds.length) {
      toast.error(
        "One or more media items failed to upload. Please try again.",
      );
      setLoading(false);
      setOverlayPhase("idle");
      setUploadProgress(null);
      return;
    }

    setUploadProgress(null);
    setOverlayPhase(
      (intendedModeRef.current ?? mode) === "draft" ? "saving" : "publishing",
    );

    const text = content.trim();
    const accountIds = Array.from(selectedIds);

    const metadata: Record<string, unknown> = {
      contentType: "image",
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
        finalMediaIds,
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
          "image",
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
          finalMediaIds,
          meta,
        );
        setLoading(false);
        if (result.success) {
          setDraftSavedPostId(initialDraftId);
          setOverlayPhase("done");
          capturePostLifecycle(
            posthog,
            "post_drafted",
            "image",
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
          finalMediaIds,
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
          navigate(dash(`posts/${result.postId}`), { replace: true });
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
          "image",
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
          finalMediaIds,
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
            "image",
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
      finalMediaIds,
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
      let list: Awaited<ReturnType<typeof getPostPublicationList>> = [];
      try {
        list = await getPostPublicationList(result.postId);
      } catch {
        // Proceed with empty list so publish still runs (e.g. after ETIMEDOUT)
      }
      const publishOptions = hasTikTokSelected
        ? { tiktokConfig: { autoAddMusic: tiktokConfig.autoAddMusic } }
        : undefined;
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
          navigate(dash(`posts/${result.postId}`), { replace: true });
          invalidateQueries();
          return;
        }
        setOverlayPhase("done");
        capturePostLifecycle(
          posthog,
          "post_published",
          "image",
          accountIds.length,
        );
        navigate(dash(`posts/${result.postId}`), { replace: true });
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
        "image",
        accountIds.length,
      );
      navigate(dash(`posts/${result.postId}`), { replace: true });
      invalidateQueries();
      return;
    }
    if (effectiveMode === "draft" && result.postId) {
      setDraftSavedPostId(result.postId);
      setOverlayPhase("done");
      capturePostLifecycle(posthog, "post_drafted", "image", accountIds.length);
      invalidateQueries();
      return;
    }
    if (effectiveMode === "scheduled" && result.postId) {
      setScheduledPostId(result.postId);
      setOverlayPhase("done");
      capturePostLifecycle(
        posthog,
        "post_scheduled",
        "image",
        accountIds.length,
      );
      invalidateQueries();
      return;
    }
    setOverlayPhase("idle");
    invalidateQueries();
  };

  const hasBlueskySelected = selectedAccounts.some(
    (a) => a.platform === "bluesky",
  );
  const hasThreadsSelected = selectedAccounts.some(
    (a) => a.platform === "threads",
  );
  const hasInstagramSelected = selectedAccounts.some(
    (a) => a.platform === "instagram",
  );
  const hasLinkedInSelected = selectedAccounts.some(
    (a) => a.platform === "linkedin",
  );
  const hasFacebookSelected = selectedAccounts.some(
    (a) => a.platform === "facebook",
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

  const submitDisabledReason = !content.trim()
    ? "Add a caption"
    : images.length === 0
      ? "Add at least one image"
      : hasTikTok && images.length > 35
        ? "TikTok allows at most 35 images per post. Remove extra images."
        : mode === "scheduled" && !scheduledAt
          ? "Pick a date and time to schedule"
          : null;

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? initialDraftId || initialScheduledId
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
          uploadProgress={uploadProgress}
          uploadPercent={
            fileProgresses.length > 0
              ? Math.round(
                  fileProgresses.reduce((a, b) => a + b, 0) /
                    fileProgresses.length,
                )
              : null
          }
          onCancelUpload={
            overlayPhase === "uploading"
              ? () => imageUploadAbortRef.current?.abort()
              : undefined
          }
          mediaType="image"
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
              navigate(dash(`posts/${publishedPostId}`), {
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
            loading={loading}
            submitLabel={submitLabel}
            submitDisabled={
              accounts.length === 0 ||
              !content.trim() ||
              images.length === 0 ||
              (mode === "scheduled" && !scheduledAt)
            }
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
            disabledAccountIds={mediaSizeExceeded.accountIds}
            disabledReasons={mediaSizeExceeded.reasons}
            disabledAccountDefaultReason="Image exceeds this platform's size limit"
            isGuest={isGuest}
            freePostsRemaining={
              !isGuest && subscriptionTier === "free"
                ? getFreePostsRemaining(subscriptionTier, freePostsUsed)
                : null
            }
            subscriptionTier={subscriptionTier}
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
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragEnter={() => setIsDragOverZone(true)}
                onDragLeave={() => setIsDragOverZone(false)}
                onDrop={handleDropImages}
                className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed py-4 text-text-muted transition-colors ${
                  isUploadZoneHovered || isDragOverZone
                    ? "border-accent bg-accent/5"
                    : "border-border bg-bg-subtle"
                }`}
              >
                <ImagePlus className="mb-2 h-6 w-6" />
                <span className="text-sm font-medium">
                  Click to add image(s) or drag and drop
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
                {images.length > 4 &&
                  (hasTwitterXSelected ||
                    hasBlueskySelected ||
                    hasThreadsSelected) && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-300" />
                      <p>
                        {[
                          hasTwitterXSelected ? "X (Twitter)" : null,
                          hasBlueskySelected ? "Bluesky" : null,
                          hasThreadsSelected ? "Threads" : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}{" "}
                        support up to 4 media attachments per post. You&apos;ve
                        added more than 4, so only the first 4 will be published
                        on those platforms; extra media will be ignored there.
                      </p>
                    </div>
                  )}
                {images.length > 1 && hasPinterestSelected && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-300" />
                    <p>
                      Pinterest supports only 1 media attachment per post.
                      You&apos;ve added more than 1, so only the first image
                      will be used on Pinterest; the rest will be ignored there.
                    </p>
                  </div>
                )}
                {images.length > 10 && hasInstagramSelected && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-300" />
                    <p>
                      Only the first 10 image(s) will be posted to Instagram.
                      You&apos;ve added more than 10, so only the first 10 will
                      be published on Instagram; extra images will be ignored
                      there.
                    </p>
                  </div>
                )}
                {images.length > 35 && hasTikTok && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      TikTok allows at most 35 images per post. Remove extra
                      images to publish to TikTok.
                    </p>
                  </div>
                )}
                {showPngTikTokInfo && hasTikTok && (
                  <div className="flex items-start gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
                    <p>
                      PNG images will be automatically converted to JPEG for
                      TikTok.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPngTikTokInfo(false)}
                      className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-blue-600 dark:text-blue-300 hover:bg-blue-500/20"
                      aria-label="Dismiss"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {images.length > 20 &&
                  (hasLinkedInSelected || hasFacebookSelected) && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-300" />
                      <p>
                        {hasLinkedInSelected && hasFacebookSelected
                          ? "LinkedIn and Facebook"
                          : hasLinkedInSelected
                            ? "LinkedIn"
                            : "Facebook"}{" "}
                        support up to 20 image attachments per post. You&apos;ve
                        added more than 20, so only the first 20 will be
                        published on those platforms; extra images will be
                        ignored there.
                      </p>
                    </div>
                  )}
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
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDragEnter={() => setIsDragOverZone(true)}
                    onDragLeave={() => setIsDragOverZone(false)}
                    onDrop={handleDropImages}
                    disabled={hasTikTok && images.length >= 35}
                    className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed text-text-muted transition-colors ${
                      hasTikTok && images.length >= 35
                        ? "cursor-not-allowed border-border bg-bg-subtle opacity-60"
                        : isUploadZoneHovered || isDragOverZone
                          ? "border-accent bg-accent/5"
                          : "border-border bg-bg-subtle"
                    }`}
                    title={
                      hasTikTok && images.length >= 35
                        ? "TikTok allows at most 35 images"
                        : "Add more · Drag and drop or paste (Ctrl+V)"
                    }
                  >
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-xs mt-0.5">Add more</span>
                  </button>
                </div>
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

          {pinterestError && (
            <div
              className="relative rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 pr-10 text-sm font-medium text-destructive"
              role="alert"
            >
              Pinterest: {pinterestError}
              <button
                type="button"
                onClick={() => setPinterestError(null)}
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive/70 hover:bg-destructive/20 transition-colors"
                aria-label="Dismiss error"
              >
                <MdClose className="w-4 h-4" />
              </button>
            </div>
          )}

          {(showPlatformCaptionsSection ||
            hasPinterestSelected ||
            hasTikTokSelected ||
            hasXSelected) && (
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
                      <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
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
                </div>
              )}

              {hasTikTok && (
                <div
                  className={
                    activeConfigPanel === "tiktok"
                      ? "mt-2 border-t border-border pt-4 space-y-4"
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
                        mediaType="photo"
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
                      mediaType="photo"
                      showPreviewHint
                    />
                  )}
                  {/* Auto Add Music - TikTok photos only */}
                  <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-bg p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">
                        Auto Add Music
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        TikTok will automatically add recommended music to your
                        photos.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tiktokConfig.autoAddMusic}
                      onClick={() =>
                        setTiktokConfig((prev) => ({
                          ...prev,
                          autoAddMusic: !prev.autoAddMusic,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
                        tiktokConfig.autoAddMusic
                          ? "bg-accent"
                          : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          tiktokConfig.autoAddMusic
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
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
            images.length === 0 ||
            (hasTikTok && images.length > 35) ||
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
          allowAutoRepost={allowAutoRepost}
          allowAutoPlug={allowAutoPlug}
          rememberAutoFeatures={rememberAutoFeatures}
          onRememberAutoFeaturesChange={setRememberAutoFeatures}
        >
          <div className="hidden lg:block max-h-[55vh] overflow-y-auto">
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
                        {sortedImages.length > 0 && (
                          <div
                            className="mt-2 w-full max-h-[150px] flex gap-0.5 overflow-hidden rounded-lg"
                            style={{ maxHeight: PREVIEW_MEDIA_MAX_H }}
                          >
                            {sortedImages.length === 1 && (
                              <div className="aspect-video w-full min-h-0 max-h-[150px] overflow-hidden rounded-lg bg-bg-muted">
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
                                  <img
                                    src={sortedImages[0].preview}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="flex-1 min-w-0 overflow-hidden rounded-r-lg">
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
                                  <img
                                    src={sortedImages[0].preview}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="min-h-0 overflow-hidden rounded-tr-lg">
                                  <img
                                    src={sortedImages[1].preview}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="min-h-0 overflow-hidden rounded-br-lg">
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
