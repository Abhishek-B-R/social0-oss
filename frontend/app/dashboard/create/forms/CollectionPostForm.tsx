"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import {
  publishPost,
  getPostPublicationList,
} from "@/app/actions/publish";
import {
  sortBySlowPlatformsLast,
  publishEachPublicationInParallel,
} from "@/lib/publish-order";
import {
  createResurfaceSchedule,
  createAutoPlug,
} from "@/app/actions/resurface";
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
import {
  MdOutlineAddPhotoAlternate,
  MdOutlineVideocam,
  MdClose,
} from "react-icons/md";
import {
  type TikTokPostSettings,
  TikTokSettings,
  DEFAULT_TIKTOK_POST_SETTINGS,
} from "@/components/TikTokSettings";
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
import {
  consumeComposerPayload,
  clearComposerPayload,
} from "@/lib/composer-bridge";
import { AutoResizeTextarea } from "@/components/ui/AutoResizeTextarea";
import { CaptionCounter } from "@/components/caption-counter";
import { ChevronDown, ChevronUp, Circle, Play } from "lucide-react";
import { uploadFile } from "@/lib/upload-file";
import {
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_DURATION_MESSAGE,
} from "@/lib/video-duration";
import {
  getAccountsOverVideoLimit,
  type VideoLimitWarning,
} from "@/lib/platform-limits";
import { toast } from "sonner";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  isTwitterPremium?: boolean;
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
  /** Duration in seconds; set when file is added so we can compute max for limit warnings. */
  durationSeconds?: number;
};

type TweetPreviewMediaItem = {
  preview: string;
  type: "image" | "video";
};

/** Twitter-style attachment layout: 1 = full width, 2 = half/half, 3 = half + two quarters, 4 = 2×2. */
function TweetPreviewMediaGrid({ items }: { items: TweetPreviewMediaItem[] }) {
  const slice = items.slice(0, 4);
  const n = slice.length;
  if (n === 0) return null;

  const shell =
    "mt-2 w-full gap-0.5 overflow-hidden rounded-lg bg-bg-muted min-h-0";

  const MediaCell = ({
    item,
    className = "",
  }: {
    item: TweetPreviewMediaItem;
    className?: string;
  }) => (
    <div
      className={`relative min-h-0 min-w-0 h-full w-full overflow-hidden bg-black/10 ${className}`}
    >
      {item.type === "video" ? (
        <video
          src={item.preview}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={item.preview}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {item.type === "video" && (
        <div
          className="pointer-events-none absolute bottom-0.5 left-0.5 z-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 ring-1 ring-white/15 shadow-sm"
          aria-hidden
        >
          <Play className="h-2 w-2 translate-x-[0.5px] fill-current text-white" />
        </div>
      )}
    </div>
  );

  if (n === 1) {
    return (
      <div className={`${shell} aspect-video`}>
        <MediaCell item={slice[0]} />
      </div>
    );
  }
  if (n === 2) {
    return (
      <div className={`${shell} grid aspect-video grid-cols-2 grid-rows-1`}>
        <MediaCell item={slice[0]} />
        <MediaCell item={slice[1]} />
      </div>
    );
  }
  if (n === 3) {
    return (
      <div className={`${shell} grid aspect-video grid-cols-2 grid-rows-2`}>
        <MediaCell item={slice[0]} className="row-span-2" />
        <MediaCell item={slice[1]} />
        <MediaCell item={slice[2]} />
      </div>
    );
  }
  return (
    <div className={`${shell} grid aspect-video grid-cols-2 grid-rows-2`}>
      {slice.map((item) => (
        <MediaCell key={item.preview} item={item} />
      ))}
    </div>
  );
}

export function CollectionPostForm({
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
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const unifiedInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const intendedQueueSlotIdRef = useRef<string | null>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageFile[]>([]);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [carouselPreviewIndex, setCarouselPreviewIndex] = useState(0);
  type PreviewCardMode = "carousel" | "post";
  const [previewCardMode, setPreviewCardMode] =
    useState<PreviewCardMode>("carousel");
  const validIds = useMemo(
    () => new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id)),
    [accounts],
  );
  const {
    remember,
    setRememberAndSelection,
    getInitialSelectedIds,
    persistSelection,
  } = useRememberedAccounts(REMEMBERED_ACCOUNT_KEYS.collectionPost);
  const [accountSearch, setAccountSearch] = useState("");
  const imagesRef = useRef<ImageFile[]>([]);
  const videosRef = useRef<VideoFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialDraftId || initialScheduledId || initialEditId
      ? new Set()
      : getInitialSelectedIds(validIds),
  );
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(
    !!(initialDraftId || initialScheduledId || initialEditId),
  );
  type OverlayPhase = "idle" | "uploading" | "publishing" | "saving" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const collectionUploadAbortRef = useRef<AbortController | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [tiktokSettings, setTiktokSettings] = useState<
    Record<string, TikTokPostSettings>
  >({});
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [scheduledPostId, setScheduledPostId] = useState<string | null>(null);
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
  type ConfigPanel = "tiktok" | null;
  const [activeConfigPanel, setActiveConfigPanel] = useState<ConfigPanel>(null);
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
  const [showCaptionError, setShowCaptionError] = useState(false);
  const [fileProgresses, setFileProgresses] = useState<number[]>([]);

  const defaultTiktokSettings: TikTokPostSettings =
    DEFAULT_TIKTOK_POST_SETTINGS;

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
    if (initialDraftId) return;
    if (searchParams.get("fromComposer") !== "1") return;
    const payload = consumeComposerPayload();
    if (!payload) return;
    if (payload.text) {
      setContent((prev) => (prev ? prev : payload.text));
    }
    const composerImages = payload.media.filter((m) => m.type === "image");
    const composerVideos = payload.media.filter((m) => m.type === "video");
    if (composerImages.length || composerVideos.length) {
      const mappedImages = composerImages.map((m, index) => ({
        file: m.file,
        preview: URL.createObjectURL(m.file),
        order: index + 1,
      }));
      const mappedVideos = composerVideos.map((m, index) => ({
        file: m.file,
        preview: URL.createObjectURL(m.file),
        order: index + 1,
      }));
      if (mappedImages.length) {
        setImages(mappedImages);
        imagesRef.current = mappedImages;
      }
      if (mappedVideos.length) {
        setVideos(mappedVideos);
        videosRef.current = mappedVideos;
      }
    }
    return () => {
      setTimeout(clearComposerPayload, 100);
    };
  }, [initialDraftId, searchParams]);

  useEffect(() => {
    if (!initialScheduledId || initialDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getScheduledPost } = await import("@/app/actions/posts");
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
        const orderedMedia = (scheduled.media ?? []).map((m, i) => ({
          ...m,
          order: i + 1,
        }));
        const scheduledImages = orderedMedia
          .filter((m) => m.mimeType.startsWith("image/"))
          .map((m) => ({
            preview: m.thumbnailUrl ?? m.url ?? "",
            order: m.order,
            existingId: m.id,
          }));
        const scheduledVideos = orderedMedia
          .filter((m) => m.mimeType.startsWith("video/"))
          .map((m) => ({
            preview: m.thumbnailUrl ?? m.url ?? "",
            order: m.order,
            existingId: m.id,
          }));
        if (scheduledImages.length > 0) {
          setImages(scheduledImages);
          imagesRef.current = scheduledImages;
        }
        if (scheduledVideos.length > 0) {
          setVideos(scheduledVideos);
          videosRef.current = scheduledVideos;
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
        const { getDraft } = await import("@/app/actions/posts");
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
        if (!cancelled) toast.error("Failed to load draft");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId]);

  useEffect(() => {
    if (!initialEditId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getPostToEdit } = await import("@/app/actions/posts");
        const result = await getPostToEdit(initialEditId);
        if (cancelled) return;
        if (!result.success) {
          toast.error(result.error);
          setDraftLoading(false);
          return;
        }
        const { post: toEdit } = result;
        setContent(toEdit.originalContent ?? "");
        setSelectedIds(new Set(toEdit.connectedAccountIds));
        const orderedMedia = toEdit.media.map((m, i) => ({
          ...m,
          order: i + 1,
        }));
        const editImages = orderedMedia
          .filter((m) => m.mimeType.startsWith("image/"))
          .map((m) => ({
            preview: m.thumbnailUrl ?? m.url ?? "",
            order: m.order,
            existingId: m.id,
          }));
        const editVideos = orderedMedia
          .filter((m) => m.mimeType.startsWith("video/"))
          .map((m) => ({
            preview: m.thumbnailUrl ?? m.url ?? "",
            order: m.order,
            existingId: m.id,
          }));
        if (editImages.length > 0) setImages(editImages);
        if (editVideos.length > 0) setVideos(editVideos);
      } catch {
        if (!cancelled) toast.error("Failed to load post");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEditId]);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (!e.ctrlKey && !e.metaKey)) return;
      const form = formRef.current;
      if (!form || !form.contains(e.target as Node)) return;
      e.preventDefault();
      form.requestSubmit();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleDeleteDraft = async () => {
    if (!initialDraftId) return;
    const { deleteDraft } = await import("@/app/actions/posts");
    const result = await deleteDraft(initialDraftId);
    if (result.success) {
      router.push("/dashboard/posts/drafts");
      router.refresh();
    } else {
      toast.error(result.error);
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

  const maxVideoDurationSeconds = useMemo(
    () => Math.max(0, ...videos.map((v) => v.durationSeconds ?? 0)),
    [videos],
  );

  const videoLimitState = useMemo(() => {
    if (maxVideoDurationSeconds <= 0)
      return {
        accountIds: new Set<string>(),
        warnings: [] as VideoLimitWarning[],
        softAccountIds: new Set<string>(),
        softWarnings: [] as VideoLimitWarning[],
      };
    return getAccountsOverVideoLimit(accounts, maxVideoDurationSeconds);
  }, [accounts, maxVideoDurationSeconds]);

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

  useEffect(() => {
    if (maxVideoDurationSeconds <= 0) return;
    const { accountIds } = getAccountsOverVideoLimit(
      accounts,
      maxVideoDurationSeconds,
    );
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
  }, [maxVideoDurationSeconds, accounts]);

  const attachmentFiles = useMemo(() => {
    const out: { file: File }[] = [];
    images.forEach((i) => {
      const f = i.file;
      if (f) out.push({ file: f });
    });
    videos.forEach((v) => {
      const f = v.file;
      if (f) out.push({ file: f });
    });
    return out;
  }, [images, videos]);
  const mediaSizeExceeded = useMemo(
    () => getAccountsExceededByAttachments(accounts, attachmentFiles),
    [accounts, attachmentFiles],
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

  const getMaxOrder = () => {
    const imageOrders = images.map((i) => i.order);
    const videoOrders = videos.map((v) => v.order);
    return Math.max(0, ...imageOrders, ...videoOrders);
  };

  const selectedPlatforms = useMemo(
    () => accounts.filter((a) => selectedIds.has(a.id)).map((a) => a.platform),
    [accounts, selectedIds],
  );

  const onUnifiedFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateMediaFile(file, selectedPlatforms);
      if (!validation.allowed) {
        toast.error(
          validation.error ?? "File too large for selected platforms.",
        );
        if (unifiedInputRef.current) unifiedInputRef.current.value = "";
        return;
      }
    }
    toast.dismiss();
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
    if (newVideos.length > 0) {
      const videosWithFile = newVideos.filter(
        (v): v is VideoFile & { file: File } => v.file != null,
      );
      Promise.all(videosWithFile.map((v) => getVideoDuration(v.file))).then(
        (durations) => {
          const withinDuration: VideoFile[] = [];
          const overDuration = durations.some(
            (d) => d > MAX_VIDEO_DURATION_SECONDS,
          );
          videosWithFile.forEach((v, i) => {
            if (durations[i] <= MAX_VIDEO_DURATION_SECONDS)
              withinDuration.push({ ...v, durationSeconds: durations[i] });
          });
          if (overDuration) toast.error(VIDEO_DURATION_MESSAGE);
          if (withinDuration.length > 0) {
            setVideos((prev) => [...prev, ...withinDuration]);
          }
        },
      );
    }
    if (unifiedInputRef.current) unifiedInputRef.current.value = "";
  };

  const [isUploadZoneHovered, setIsUploadZoneHovered] = useState(false);
  const [isCaptionFocused, setIsCaptionFocused] = useState(false);
  const [isDragOverZone, setIsDragOverZone] = useState(false);
  const handleDropUnified = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverZone(false);
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateMediaFile(file, selectedPlatforms);
      if (!validation.allowed) {
        toast.error(
          validation.error ?? "File too large for selected platforms.",
        );
        return;
      }
    }
    toast.dismiss();
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
    if (newVideos.length > 0) {
      const videosWithFile = newVideos.filter(
        (v): v is VideoFile & { file: File } => v.file != null,
      );
      Promise.all(videosWithFile.map((v) => getVideoDuration(v.file))).then(
        (durations) => {
          const withinDuration: VideoFile[] = [];
          const overDuration = durations.some(
            (d) => d > MAX_VIDEO_DURATION_SECONDS,
          );
          videosWithFile.forEach((v, i) => {
            if (durations[i] <= MAX_VIDEO_DURATION_SECONDS)
              withinDuration.push({ ...v, durationSeconds: durations[i] });
          });
          if (overDuration) toast.error(VIDEO_DURATION_MESSAGE);
          if (withinDuration.length > 0) {
            setVideos((prev) => [...prev, ...withinDuration]);
          }
        },
      );
    }
    if (unifiedInputRef.current) unifiedInputRef.current.value = "";
  };

  useEffect(() => {
    if (!isUploadZoneHovered && !isCaptionFocused) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (e.target === captionTextareaRef.current) {
        const files = e.clipboardData?.files;
        const hasMedia =
          files &&
          Array.from(files).some(
            (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
          );
        if (!hasMedia) return;
      }
      const file = e.clipboardData?.files?.[0];
      if (!file) return;
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
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        toast.dismiss();
        const maxOrder = getMaxOrder();
        setImages((prev) => [
          ...prev,
          { file, preview: URL.createObjectURL(file), order: maxOrder + 1 },
        ]);
      } else if (file.type.startsWith("video/")) {
        e.preventDefault();
        toast.dismiss();
        getVideoDuration(file).then((duration) => {
          if (duration > MAX_VIDEO_DURATION_SECONDS) {
            toast.error(VIDEO_DURATION_MESSAGE);
            return;
          }
          const maxOrder = getMaxOrder();
          setVideos((prev) => [
            ...prev,
            {
              file,
              preview: URL.createObjectURL(file),
              order: maxOrder + 1,
              durationSeconds: duration,
            },
          ]);
        });
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUploadZoneHovered, isCaptionFocused]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    toast.dismiss();

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
        if (!settings.video_title?.trim()) {
          toast.error(
            `TikTok: A video title is required for @${tiktokAccount.platformUsername ?? "TikTok"}.`,
          );
          return;
        }
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

        if (!settings.tiktok_post_consent) {
          toast.error(
            `TikTok: Confirm you agree to TikTok's terms (Music Usage Confirmation) before posting for @${tiktokAccount.platformUsername ?? "TikTok"}.`,
          );
          return;
        }
      }
    }

    setLoading(true);
    toast.dismiss();
    setScheduledPostId(null);
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
      const uploadAbortController = new AbortController();
      collectionUploadAbortRef.current = uploadAbortController;
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
      collectionUploadAbortRef.current = null;

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
      contentType: "collection",
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
      const { updatePost } = await import("@/app/actions/posts");
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
        router.refresh();
      } else {
        setOverlayPhase("idle");
        toast.error(result.error);
      }
      return;
    }

    if (initialDraftId) {
      const { updateDraft, updateAndPublish, updatePost } =
        await import("@/app/actions/posts");
      if (effectiveMode === "draft") {
        const result = await updateDraft(
          initialDraftId,
          text,
          accountIds,
          finalMediaIds,
          meta,
        );
        setLoading(false);
        setOverlayPhase("idle");
        if (result.success) {
          router.push("/dashboard/posts/drafts");
          router.refresh();
        } else {
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
          router.push(`/dashboard/posts/${result.postId}`);
          router.refresh();
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
        await setupAutoPlug(result.postId);
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
          router.refresh();
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // Proceed with empty list so publish still runs (e.g. after ETIMEDOUT)
      }
      if (list.length === 0) {
        const publishResult = await publishPost(result.postId);
        const succeededCount =
          publishResult?.results?.filter((r) => r.status === "published")
            .length ?? 0;
        if (succeededCount === 0) {
          router.push(`/dashboard/posts/${result.postId}`);
          router.refresh();
          return;
        }
        setOverlayPhase("done");
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
      await publishEachPublicationInParallel(
        result.postId,
        orderedList,
        undefined,
        (connectedAccountId) => {
          setPlatformStatuses((prev) =>
            prev.map((p) =>
              p.accountId === connectedAccountId
                ? { ...p, status: "processing" as PlatformStatus }
                : p,
            ),
          );
        },
        (connectedAccountId, singleResult) => {
          const res = singleResult.results[0];
          setPlatformStatuses((prev) =>
            prev.map((p) =>
              p.accountId === connectedAccountId
                ? {
                    ...p,
                    status: (res?.status === "published"
                      ? "published"
                      : "failed") as PlatformStatus,
                    error: res?.status === "failed" ? res?.error : undefined,
                    postUrl:
                      res?.status === "published"
                        ? (res?.platformPostUrl ?? null)
                        : undefined,
                  }
                : p,
            ),
          );
        },
      );
      await publishPost(result.postId);
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
    if (effectiveMode === "scheduled" && result.postId) {
      setScheduledPostId(result.postId);
      setOverlayPhase("done");
      router.refresh();
      return;
    }
    setOverlayPhase("idle");
    router.refresh();
  };

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const previewAccount =
    selectedAccounts.length > 0
      ? selectedAccounts[selectedAccounts.length - 1]
      : null;
  const selectedAccountIds = Array.from(selectedIds);
  const hasXForResurface =
    getResurfacePlatforms(selectedAccountIds, accounts).length > 0;
  const resurfaceVisible = hasXForResurface;
  const autoPlugVisible = hasXForResurface;

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
  const hasTikTok = selectedAccounts.some((a) => a.platform === "tiktok");
  const tiktokAccounts = selectedAccounts.filter(
    (a) => a.platform === "tiktok",
  );
  const setupAutoPlug = async (postId: string) => {
    if (!autoPlugConfig) return true;
    const xAccount = selectedAccounts.find((a) => a.platform === "twitter_x");
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

  const hasContent = content.trim().length > 0;
  const hasMedia = images.length > 0 || videos.length > 0;
  const tiktokPhotoOnlyOver35 =
    hasTikTok && videos.length === 0 && images.length > 35;
  const submitDisabledReason = !hasContent
    ? "Add a caption"
    : !hasMedia
      ? "Add at least one image or video"
      : tiktokPhotoOnlyOver35
        ? "TikTok allows at most 35 images per post. Remove extra images or add a video."
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
              ? () => collectionUploadAbortRef.current?.abort()
              : undefined
          }
          mediaType="mixed"
          isScheduling={mode === "scheduled"}
          showLinks={overlayPhase === "done"}
          scheduleSuccess={!!scheduledPostId}
          publishedPostId={scheduledPostId ?? publishedPostId}
          publishedToX={selectedAccounts.some(
            (a) => a.platform === "twitter_x",
          )}
          resurfacePreFill={
            overlayPhase === "done" && resurfaceConfig && !scheduledPostId
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
              router.push(`/dashboard/posts/${publishedPostId}`);
              router.refresh();
            } else {
              setScheduledPostId(null);
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
            loading={loading}
            submitLabel={submitLabel}
            submitDisabled={
              accounts.length === 0 ||
              (mode === "scheduled" && !scheduledAt) ||
              !hasContent ||
              !hasMedia ||
              tiktokPhotoOnlyOver35
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
                className="h-8 w-full text-xs rounded border border-border px-2 py-1 text-text placeholder-text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            }
            remember={remember}
            onRememberChange={handleRememberChange}
            supportedPlatforms={supportedPlatforms}
            accountsLoading={accountsLoading}
            disabledAccountIds={disabledAccountIds}
            disabledReasons={disabledReasons}
            showUpgradeCta={subscriptionTier === "free"}
            disabledAccountDefaultReason="Media exceeds this platform's limit"
            warningAccountIds={videoLimitState.softAccountIds}
            warningReasons={videoLimitWarningReasons}
            warningLabel="May limit reach"
          />

          {videos.length > 0 &&
            maxVideoDurationSeconds > 0 &&
            (videoLimitState.warnings.length > 0 ||
              videoLimitState.softWarnings.length > 0) && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/50 p-4 text-black dark:text-amber-100">
                <p className="font-semibold text-amber-900 dark:text-amber-200 mb-2">
                  Video length limits
                </p>
                <p className="text-sm mb-2">
                  Your longest video is{" "}
                  <span className="font-medium">
                    {(() => {
                      const minutes = Math.floor(maxVideoDurationSeconds / 60);
                      const seconds = maxVideoDurationSeconds - minutes * 60;
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

          {tiktokPhotoOnlyOver35 && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              TikTok allows at most 35 images per post when posting images only.
              Remove extra images or add a video to publish to TikTok.
            </div>
          )}

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
            const showPinterestWarning = totalAttachments > 1 && hasPinterest;
            if (!showMax4Warning && !showPinterestWarning) return null;
            return (
              <div className="space-y-1">
                {showMax4Warning && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    ⚠ {platformsLabel} support up to 4 media attachments per
                    post. You&apos;ve added more than 4, so only the first 4
                    will be published on those platforms; extra media will be
                    ignored there.
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

            <AutoResizeTextarea
              ref={captionTextareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your caption..."
              rows={3}
              className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              autoFocus
              onFocus={() => setIsCaptionFocused(true)}
              onBlur={() => setIsCaptionFocused(false)}
              maxHeight={280}
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
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragEnter={() => setIsDragOverZone(true)}
              onDragLeave={() => setIsDragOverZone(false)}
              onDrop={handleDropUnified}
              className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 text-text-muted transition-colors ${
                isUploadZoneHovered || isDragOverZone
                  ? "border-accent bg-accent/5"
                  : "border-border bg-bg-subtle"
              }`}
            >
              <div className="flex items-center gap-2">
                <MdOutlineAddPhotoAlternate className="mb-2 h-8 w-8 text-text-muted" />
                <MdOutlineVideocam className="mb-2 h-8 w-8 text-text-muted" />
              </div>
              <span className="text-sm font-medium">
                Click to add images or videos, or drag and drop
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
                            preload="metadata"
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
                          <div
                            className="pointer-events-none absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 ring-1 ring-white/15 shadow-sm"
                            aria-hidden
                          >
                            <Play className="h-2.5 w-2.5 translate-x-[0.5px] fill-current text-white" />
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

          {hasTikTok && (
            <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
              <p className="text-xs text-text-muted mb-3">
                Post configurations & tools
              </p>
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 min-h-[44px] sm:min-h-0 -mx-1 px-1 scrollbar-thin">
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
                  <Circle className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span>TikTok Config</span>
                  {activeConfigPanel === "tiktok" ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
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
                        mediaType={
                          videos.length > 0 ? "video" : "photo"
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
                      mediaType={videos.length > 0 ? "video" : "photo"}
                      showPreviewHint
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
            !hasContent ||
            !hasMedia ||
            tiktokPhotoOnlyOver35
          }
          hasAccountSelected={selectedIds.size > 0}
          submitDisabledReason={submitDisabledReason}
          primaryActionDisabled={subscriptionTier === "free" && mode !== "draft"}
          primaryActionDisabledReason={subscriptionTier === "free" && mode !== "draft" ? "Subscribe to a plan to post" : null}
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
          <div className="hidden lg:block max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-bg-elevated p-4 shadow-sm -mt-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex rounded-full border border-border bg-bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewCardMode("carousel")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    previewCardMode === "carousel"
                      ? "bg-accent text-white"
                      : "bg-transparent text-text-muted hover:bg-bg hover:text-text"
                  }`}
                >
                  Carousel preview
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewCardMode("post")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    previewCardMode === "post"
                      ? "bg-accent text-white"
                      : "bg-transparent text-text-muted hover:bg-bg hover:text-text"
                  }`}
                >
                  Tweet preview
                </button>
              </div>
            </div>
            {previewCardMode === "carousel" ? (
              allItemsSorted.length === 0 ? (
                <div className="flex aspect-square w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-bg-subtle text-text-subtle">
                  <MdOutlineAddPhotoAlternate className="mb-2 h-12 w-12" />
                  <span className="text-xs">Upload media to see preview</span>
                </div>
              ) : (
                <>
                  <div className="relative aspect-square w-full max-h-60 overflow-hidden rounded-lg bg-bg-muted">
                    {previewItem?.type === "video" ? (
                      <video
                        key={previewItem.preview}
                        src={previewItem.preview}
                        className="h-full w-full object-contain"
                        controls
                        muted
                        autoPlay
                        playsInline
                        preload="auto"
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
                            preload="metadata"
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
                          <div
                            className="pointer-events-none absolute bottom-0.5 left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 ring-1 ring-white/15 shadow-sm"
                            aria-hidden
                          >
                            <Play className="h-2 w-2 translate-x-[0.5px] fill-current text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )
            ) : (
              <>
                <div className="rounded-lg border border-border bg-bg p-3 shadow-sm">
                  <div className="flex gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-bg-muted flex items-center justify-center text-sm font-semibold text-text-muted">
                      {previewAccount?.profileImageUrl?.trim() ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={previewAccount.profileImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        (previewAccount?.platformUsername ?? "?")
                          .charAt(0)
                          .toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text inline-flex items-center gap-0.5 flex-wrap">
                        {previewAccount?.platformUsername
                          ? `@${previewAccount.platformUsername}`
                          : "@username"}
                        {previewAccount?.platform === "twitter_x" &&
                          previewAccount?.isTwitterPremium && (
                            // eslint-disable-next-line @next/next/no-img-element
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
                      <TweetPreviewMediaGrid items={allItemsSorted} />
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
