"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import {
  publishPost,
  getPostPublicationList,
  publishSinglePublication,
} from "@/app/actions/publish";
import {
  createResurfaceSchedule,
  createAutoPlug,
} from "@/app/actions/resurface";
import { useRememberedAccounts } from "@/lib/remembered-accounts";
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
  UploadPublishOverlay,
  type PlatformResult,
  type PlatformStatus,
} from "@/components/UploadPublishOverlay";
import { PLATFORMS } from "@/lib/platforms";
import { IoMdAddCircleOutline } from "react-icons/io";
import { MdClose } from "react-icons/md";
import { MdOutlinePhotoLibrary, MdOutlineVideocam } from "react-icons/md";
import { AlertTriangle } from "lucide-react";
import { uploadFile } from "@/lib/upload-file";
import {
  consumeComposerPayload,
  clearComposerPayload,
} from "@/lib/composer-bridge";
import { CaptionCounter } from "@/components/caption-counter";
import {
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_DURATION_MESSAGE,
} from "@/lib/video-duration";
import {
  getAccountsOverVideoLimit,
  type VideoLimitWarning,
} from "@/lib/platform-limits";

const PREVIEW_MEDIA_MAX_H = 200;
const MAX_ATTACHMENTS_PER_POST = 4;

function getVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = URL.createObjectURL(file);
    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(video, 0, 0);
      resolve(canvas.toDataURL());
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      resolve("");
      if (video.src) URL.revokeObjectURL(video.src);
    };
  });
}

type PreviewMediaItem =
  | { type: "image"; file: File; preview: string; order: number }
  | {
      type: "video";
      file: File;
      preview: string;
      order: number;
      thumbnailUrl?: string;
    };

/** Twitter-style media grid for Thread Preview: 1–4 slots (images + videos), max height 200px. */
function ThreadPreviewMediaGrid({ items }: { items: PreviewMediaItem[] }) {
  const slice = items.slice(0, MAX_ATTACHMENTS_PER_POST);
  const n = slice.length;
  const containerClass =
    "w-full max-h-[200px] flex gap-1 overflow-hidden rounded-lg";
  const imgClass = "w-full h-full object-cover rounded-lg";
  const playOverlay = (
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
  );

  const renderSlot = (item: PreviewMediaItem, key: string) => {
    if (item.type === "image") {
      return (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img key={key} src={item.preview} alt="" className={imgClass} />
      );
    }
    return (
      <div
        key={key}
        className="relative w-full h-full min-h-0 bg-bg-muted rounded-lg overflow-hidden"
      >
        <video
          key={item.preview}
          src={item.preview}
          poster={item.thumbnailUrl ?? undefined}
          className={imgClass}
          muted
          playsInline
          preload="auto"
        />
        {playOverlay}
      </div>
    );
  };

  if (n === 0) return null;
  if (n === 1) {
    return (
      <div
        className={`${containerClass} aspect-video`}
        style={{ maxHeight: PREVIEW_MEDIA_MAX_H }}
      >
        <div className="relative w-full h-full min-h-0 overflow-hidden rounded-lg">
          {renderSlot(slice[0], slice[0].preview)}
        </div>
      </div>
    );
  }
  if (n === 2) {
    return (
      <div className={`${containerClass} flex h-[200px]`}>
        <div className="flex-1 min-w-0 overflow-hidden rounded-l-lg relative">
          {renderSlot(slice[0], slice[0].preview)}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden rounded-r-lg relative">
          {renderSlot(slice[1], slice[1].preview)}
        </div>
      </div>
    );
  }
  if (n === 3) {
    return (
      <div
        className={`${containerClass} grid grid-cols-2 gap-1 max-h-[200px]`}
        style={{ maxHeight: PREVIEW_MEDIA_MAX_H }}
      >
        <div className="row-span-2 min-h-0 overflow-hidden rounded-l-lg relative">
          {renderSlot(slice[0], slice[0].preview)}
        </div>
        <div className="min-h-0 overflow-hidden rounded-tr-lg relative">
          {renderSlot(slice[1], slice[1].preview)}
        </div>
        <div className="min-h-0 overflow-hidden rounded-br-lg relative">
          {renderSlot(slice[2], slice[2].preview)}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`${containerClass} grid grid-cols-2 grid-rows-2 gap-1 max-h-[200px]`}
      style={{ maxHeight: PREVIEW_MEDIA_MAX_H }}
    >
      {slice.map((item) => (
        <div
          key={item.preview}
          className="min-w-0 min-h-0 overflow-hidden rounded-lg relative"
        >
          {renderSlot(item, item.preview)}
        </div>
      ))}
    </div>
  );
}
const THREAD_SEPARATOR = "\n\n---\n\n";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  isTwitterPremium?: boolean;
  tokenExpired?: boolean;
};

type MediaImage = {
  file?: File;
  preview: string;
  order: number;
  mediaId?: string;
};
type MediaVideo = {
  file?: File;
  preview: string;
  order: number;
  thumbnailUrl?: string;
  mediaId?: string;
  /** Duration in seconds; set when file is added for limit warnings. */
  durationSeconds?: number;
};

type ThreadPost = {
  id: number;
  text: string;
  images: MediaImage[];
  videos: MediaVideo[];
};

export function ThreadsPostForm({
  accounts,
  use24HourTimeFormat = false,
  dateFormat = "dd/MM/yyyy",
  timezone = null,
  draftId: initialDraftId,
  scheduledId: initialScheduledId,
  editId: initialEditId,
  allowAutoRepost = true,
  allowAutoPlug = true,
  supportedPlatforms,
}: {
  accounts: Account[];
  use24HourTimeFormat?: boolean;
  dateFormat?: string | null;
  timezone?: string | null;
  draftId?: string;
  scheduledId?: string;
  editId?: string;
  allowAutoRepost?: boolean;
  allowAutoPlug?: boolean;
  supportedPlatforms?: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextIdRef = useRef(1);
  const nextId = () => {
    nextIdRef.current += 1;
    return nextIdRef.current;
  };
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const intendedQueueSlotIdRef = useRef<string | null>(null);
  const validIds = useMemo(
    () => new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id)),
    [accounts],
  );
  const { remember, setRemember, getInitialSelectedIds, persistSelection } =
    useRememberedAccounts("post-form-threads");
  const [accountSearch, setAccountSearch] = useState("");
  const [posts, setPosts] = useState<ThreadPost[]>(() => [
    { id: 1, text: "", images: [], videos: [] },
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialDraftId || initialScheduledId || initialEditId ? new Set() : getInitialSelectedIds(validIds),
  );
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(
    !!(initialDraftId || initialScheduledId || initialEditId),
  );
  const [error, setError] = useState<string | null>(null);
  const [resurfaceConfig, setResurfaceConfig] =
    useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );
  const [resurfaceModalOpen, setResurfaceModalOpen] = useState(false);
  const [autoplugModalOpen, setAutoplugModalOpen] = useState(false);
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
  const [draggedPostId, setDraggedPostId] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  type OverlayPhase = "idle" | "uploading" | "publishing" | "saving" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const threadUploadAbortRef = useRef<AbortController | null>(null);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [platformStatuses, setPlatformStatuses] = useState<PlatformResult[]>([]);
  const postsRef = useRef<ThreadPost[]>(posts);
  const [showFirstTextError, setShowFirstTextError] = useState(false);
  const [addMediaZoneHover, setAddMediaZoneHover] = useState<number | null>(
    null,
  );
  const [dragOverPostId, setDragOverPostId] = useState<number | null>(null);
  const [focusedPostId, setFocusedPostId] = useState<number | null>(null);
  const [fileProgresses, setFileProgresses] = useState<number[]>([]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    return () => {
      postsRef.current.forEach((p) => {
        p.images.forEach((i) => URL.revokeObjectURL(i.preview));
        p.videos.forEach((v) => URL.revokeObjectURL(v.preview));
      });
    };
  }, []);

  useEffect(() => {
    if (initialDraftId || initialEditId) return;
    if (searchParams.get("fromComposer") !== "1") return;
    const payload = consumeComposerPayload();
    if (!payload) return;

    const toMediaImage = (m: { type: string; file: File; previewUrl: string }, order: number) => ({
      file: m.file,
      preview: URL.createObjectURL(m.file),
      order,
    });
    const toMediaVideo = (m: { type: string; file: File; previewUrl: string }, order: number) => ({
      file: m.file,
      preview: URL.createObjectURL(m.file),
      order,
      thumbnailUrl: undefined,
    });

    const mainImages = payload.media
      .filter((m) => m.type === "image")
      .map((m, i) => toMediaImage(m, i + 1));
    const mainVideos = payload.media
      .filter((m) => m.type === "video")
      .map((m, i) => toMediaVideo(m, i + 1));

    const firstPost: ThreadPost = {
      id: 1,
      text: payload.text,
      images: mainImages,
      videos: mainVideos,
    };

    const threadPosts = payload.threadPosts ?? [];
    const nextId = nextIdRef.current;
    const restPosts: ThreadPost[] = threadPosts.map((p, idx) => {
      const images = p.media
        .filter((m) => m.type === "image")
        .map((m, i) => toMediaImage(m, i + 1));
      const videos = p.media
        .filter((m) => m.type === "video")
        .map((m, i) => toMediaVideo(m, i + 1));
      return {
        id: nextId + idx + 1,
        text: p.text,
        images,
        videos,
      };
    });
    nextIdRef.current = nextId + restPosts.length + 1;

    setPosts([firstPost, ...restPosts]);
    return () => {
      setTimeout(clearComposerPayload, 100);
    };
  }, [initialDraftId, initialEditId, searchParams]);

  useEffect(() => {
    if (!initialScheduledId || initialDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getScheduledPost } = await import("@/app/actions/posts");
        const result = await getScheduledPost(initialScheduledId);
        if (cancelled) return;
        if (!result.success) {
          setError(result.error);
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
        setSelectedIds(new Set(restoredIds));
        setScheduledAt(scheduled.scheduledAt ? new Date(scheduled.scheduledAt) : null);
        setMode("scheduled");
        if (scheduled.queueSlotId)
          intendedQueueSlotIdRef.current = scheduled.queueSlotId;
        const meta = scheduled.metadata as Record<string, unknown> | null;
        const twitterThread = meta?.twitterThread as
          | { parts?: Array<{ text?: string; mediaIds?: string[] }> }
          | undefined;
        const partsFromMeta = twitterThread?.parts ?? [];
        if (partsFromMeta.length > 0) {
          const mediaById = new Map(
            (scheduled.media ?? []).map((m) => [m.id, m]),
          );
          const restoredPosts: ThreadPost[] = partsFromMeta.map((part, i) => {
            const text = typeof part.text === "string" ? part.text : "";
            const partMediaIds = Array.isArray(part.mediaIds)
              ? part.mediaIds
              : [];
            const images: MediaImage[] = [];
            const videos: MediaVideo[] = [];
            partMediaIds.forEach((mid, idx) => {
              const row = mediaById.get(mid);
              const preview = row?.url ?? row?.thumbnailUrl ?? "";
              if (!preview || !row) return;
              const order = idx + 1;
              if (row.mimeType.startsWith("video/")) {
                videos.push({
                  preview: row.thumbnailUrl || preview,
                  order,
                  mediaId: row.id,
                  thumbnailUrl: row.thumbnailUrl ?? undefined,
                });
              } else {
                images.push({ preview, order, mediaId: row.id });
              }
            });
            return {
              id: i + 1,
              text,
              images,
              videos,
            };
          });
          setPosts(restoredPosts);
          nextIdRef.current = restoredPosts.length + 1;
        } else {
          setPosts([
            {
              id: 1,
              text: scheduled.originalContent ?? "",
              images: [],
              videos: [],
            },
          ]);
          nextIdRef.current = 2;
        }
      } catch {
        if (!cancelled) setError("Failed to load post");
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
          setError(result.error);
          return;
        }
        const { draft } = result;
        const metadata = draft.metadata as Record<string, unknown> | null;
        const twitterThread = metadata?.twitterThread as
          | { parts?: Array<{ text?: string; mediaIds?: string[] }> }
          | undefined;
        const partsFromMeta = twitterThread?.parts;

        if (
          partsFromMeta &&
          Array.isArray(partsFromMeta) &&
          partsFromMeta.length > 0
        ) {
          const mediaById = new Map(draft.media.map((m) => [m.id, m]));
          const restoredPosts: ThreadPost[] = partsFromMeta.map((part, i) => {
            const text = typeof part.text === "string" ? part.text : "";
            const partMediaIds = Array.isArray(part.mediaIds)
              ? part.mediaIds
              : [];
            const images: MediaImage[] = [];
            const videos: MediaVideo[] = [];
            partMediaIds.forEach((mid, idx) => {
              const row = mediaById.get(mid);
              if (!row?.url) return;
              const order = idx + 1;
              const preview = row.url;
              if (row.mimeType.startsWith("video/")) {
                videos.push({
                  preview: row.thumbnailUrl || preview,
                  order,
                  mediaId: row.id,
                  thumbnailUrl: row.thumbnailUrl ?? undefined,
                });
              } else {
                images.push({ preview, order, mediaId: row.id });
              }
            });
            return {
              id: i + 1,
              text,
              images,
              videos,
            };
          });
          setPosts(restoredPosts);
          nextIdRef.current = restoredPosts.length + 1;
        } else {
          const raw = draft.originalContent ?? "";
          const parts = raw.split(THREAD_SEPARATOR).map((s) => s.trim());
          if (parts.length > 0) {
            setPosts(
              parts.map((text, i) => ({
                id: i + 1,
                text,
                images: [],
                videos: [],
              })),
            );
            nextIdRef.current = parts.length + 1;
          }
        }
        setSelectedIds(new Set(draft.connectedAccountIds));
        setScheduledAt(draft.scheduledAt ? new Date(draft.scheduledAt) : null);
        if (draft.scheduledAt) setMode("scheduled");
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
    if (!initialEditId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getPostToEdit } = await import("@/app/actions/posts");
        const result = await getPostToEdit(initialEditId);
        if (cancelled) return;
        if (!result.success) {
          setError(result.error);
          setDraftLoading(false);
          return;
        }
        const { post: toEdit } = result;
        const metadata = toEdit.metadata as Record<string, unknown> | null;
        const twitterThread = metadata?.twitterThread as
          | { parts?: Array<{ text?: string; mediaIds?: string[] }> }
          | undefined;
        const partsFromMeta = twitterThread?.parts;
        if (
          partsFromMeta &&
          Array.isArray(partsFromMeta) &&
          partsFromMeta.length > 0
        ) {
          const mediaById = new Map(toEdit.media.map((m) => [m.id, m]));
          const restoredPosts: ThreadPost[] = partsFromMeta.map((part, i) => {
            const text = typeof part.text === "string" ? part.text : "";
            const partMediaIds = Array.isArray(part.mediaIds)
              ? part.mediaIds
              : [];
            const images: MediaImage[] = [];
            const videos: MediaVideo[] = [];
            partMediaIds.forEach((mid, idx) => {
              const row = mediaById.get(mid);
              if (!row?.url) return;
              const order = idx + 1;
              const preview = row.url;
              if (row.mimeType.startsWith("video/")) {
                videos.push({
                  preview: row.thumbnailUrl || preview,
                  order,
                  mediaId: row.id,
                  thumbnailUrl: row.thumbnailUrl ?? undefined,
                });
              } else {
                images.push({ preview, order, mediaId: row.id });
              }
            });
            return {
              id: i + 1,
              text,
              images,
              videos,
            };
          });
          setPosts(restoredPosts);
          nextIdRef.current = restoredPosts.length + 1;
        } else {
          const raw = toEdit.originalContent ?? "";
          const parts = raw.split(THREAD_SEPARATOR).map((s) => s.trim());
          if (parts.length > 0) {
            setPosts(
              parts.map((text, i) => ({
                id: i + 1,
                text,
                images: [],
                videos: [],
              })),
            );
            nextIdRef.current = parts.length + 1;
          }
        }
        setSelectedIds(new Set(toEdit.connectedAccountIds));
      } catch {
        if (!cancelled) setError("Failed to load post");
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEditId]);

  useEffect(() => {
    if (remember) persistSelection(selectedIds);
  }, [remember, selectedIds, persistSelection]);

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
      setError(result.error);
    }
  };

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maxVideoDurationSeconds = useMemo(() => {
    let max = 0;
    posts.forEach((p) =>
      p.videos.forEach((v) => {
        const d = v.durationSeconds ?? 0;
        if (d > max) max = d;
      }),
    );
    return max;
  }, [posts]);

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
        const w = videoLimitState.warnings.find((x) => x.platform === acc.platform);
        reasons[acc.id] = w?.message ?? `Video exceeds ${acc.platform} limit`;
      }
    }
    return reasons;
  }, [accounts, videoLimitState]);

  const videoLimitWarningReasons = useMemo(() => {
    const reasons: Record<string, string> = {};
    for (const acc of accounts) {
      if (videoLimitState.softAccountIds.has(acc.id)) {
        const w = videoLimitState.softWarnings.find((x) => x.platform === acc.platform);
        reasons[acc.id] = w?.message ?? "May limit reach to new audiences.";
      }
    }
    return reasons;
  }, [accounts, videoLimitState]);

  useEffect(() => {
    if (maxVideoDurationSeconds <= 0) return;
    const { accountIds } = getAccountsOverVideoLimit(accounts, maxVideoDurationSeconds);
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

  const selectableAccounts = accounts.filter(
    (a) => !a.tokenExpired && !videoLimitState.accountIds.has(a.id),
  );
  const selectAll = () => {
    if (selectableAccounts.every((a) => selectedIds.has(a.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableAccounts.map((a) => a.id)));
    }
  };

  const updatePost = (id: number, value: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, text: value } : p)),
    );
  };

  const addPost = () =>
    setPosts((prev) => [
      ...prev,
      { id: nextId(), text: "", images: [], videos: [] },
    ]);

  const removePost = (id: number) => {
    if (posts.length <= 1) return;
    setPosts((prev) => {
      const post = prev.find((p) => p.id === id);
      if (post) {
        post.images.forEach((i) => {
          if (i.preview.startsWith("blob:")) URL.revokeObjectURL(i.preview);
        });
        post.videos.forEach((v) => {
          if (v.preview.startsWith("blob:")) URL.revokeObjectURL(v.preview);
        });
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const getMaxOrderForPost = (post: ThreadPost) => {
    const imageOrders = post.images.map((i) => i.order);
    const videoOrders = post.videos.map((v) => v.order);
    return Math.max(0, ...imageOrders, ...videoOrders);
  };

  const addImagesToPost = (postId: number, files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const totalAttachments = post.images.length + post.videos.length;
    if (totalAttachments >= MAX_ATTACHMENTS_PER_POST) {
      setError("Max 4 attachments per post");
      return;
    }
    const newImages: MediaImage[] = [];
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.type.startsWith("image/")) continue;
      const preview = URL.createObjectURL(file);
      newImages.push({
        file,
        preview,
        order: 0, // Will be set below
      });
    }
    if (newImages.length === 0) return;
    const toAdd = newImages.slice(
      0,
      MAX_ATTACHMENTS_PER_POST - totalAttachments,
    );
    if (toAdd.length === 0) {
      setError("Max 4 attachments per post");
      return;
    }
    setPosts((prev) => {
      const current = prev.find((p) => p.id === postId);
      if (!current) return prev;
      const maxOrder = getMaxOrderForPost(current);
      const imagesWithOrder = toAdd.map((img, idx) => ({
        ...img,
        order: maxOrder + idx + 1,
      }));
      return prev.map((p) => {
        if (p.id !== postId) return p;
        const combined = [...p.images, ...imagesWithOrder].slice(
          0,
          MAX_ATTACHMENTS_PER_POST,
        );
        return { ...p, images: combined };
      });
    });
  };

  const removeImageFromPost = (postId: number, preview: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const img = p.images.find((i) => i.preview === preview);
        if (img?.preview.startsWith("blob:")) URL.revokeObjectURL(img.preview);
        const filtered = p.images.filter((i) => i.preview !== preview);
        const allItems = [...filtered, ...p.videos].sort(
          (a, b) => a.order - b.order,
        );
        return {
          ...p,
          images: filtered.map((img) => {
            const newOrder =
              allItems.findIndex((i) => i.preview === img.preview) + 1;
            return { ...img, order: newOrder };
          }),
          videos: p.videos.map((vid) => {
            const newOrder =
              allItems.findIndex((i) => i.preview === vid.preview) + 1;
            return { ...vid, order: newOrder };
          }),
        };
      }),
    );
    setDraggedIndex(null);
  };

  const addVideoToPost = (postId: number, files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const totalAttachments = post.images.length + post.videos.length;
    if (totalAttachments >= MAX_ATTACHMENTS_PER_POST) {
      setError("Max 4 attachments per post");
      return;
    }
    const newVideos: MediaVideo[] = [];
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.type.startsWith("video/")) continue;
      const preview = URL.createObjectURL(file);
      newVideos.push({
        file,
        preview,
        order: 0, // Will be set below
        thumbnailUrl: undefined,
      });
    }
    if (newVideos.length === 0) return;
    const videosWithFile = newVideos.filter(
      (v): v is MediaVideo & { file: File } => v.file != null,
    );
    Promise.all(videosWithFile.map((v) => getVideoDuration(v.file))).then(
      (durations) => {
        const withinDuration: MediaVideo[] = [];
        const overDuration = durations.some(
          (d) => d > MAX_VIDEO_DURATION_SECONDS,
        );
        videosWithFile.forEach((v, i) => {
          if (durations[i] <= MAX_VIDEO_DURATION_SECONDS)
            withinDuration.push({ ...v, durationSeconds: durations[i] });
        });
        if (overDuration) setError(VIDEO_DURATION_MESSAGE);
        if (withinDuration.length === 0) return;
        const toAdd = withinDuration.slice(
          0,
          MAX_ATTACHMENTS_PER_POST - totalAttachments,
        );
        if (toAdd.length === 0) {
          setError("Max 4 attachments per post");
          return;
        }
        setPosts((prev) => {
          const current = prev.find((p) => p.id === postId);
          if (!current) return prev;
          const maxOrder = getMaxOrderForPost(current);
          const videosWithOrder = toAdd.map((vid, idx) => ({
            ...vid,
            order: maxOrder + idx + 1,
          }));
          return prev.map((p) => {
            if (p.id !== postId) return p;
            const combined = [...p.videos, ...videosWithOrder].slice(
              0,
              MAX_ATTACHMENTS_PER_POST - p.images.length,
            );
            return { ...p, videos: combined };
          });
        });
        toAdd.forEach((vid) => {
          if (!vid.file) return;
          getVideoThumbnail(vid.file).then((thumbnailUrl) => {
            setPosts((prev) =>
              prev.map((p) => {
                if (p.id !== postId) return p;
                return {
                  ...p,
                  videos: p.videos.map((v) =>
                    v.preview === vid.preview ? { ...v, thumbnailUrl } : v,
                  ),
                };
              }),
            );
          });
        });
      },
    );
  };

  const removeVideoFromPost = (postId: number, preview: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const vid = p.videos.find((v) => v.preview === preview);
        if (vid?.preview.startsWith("blob:")) URL.revokeObjectURL(vid.preview);
        const filtered = p.videos.filter((v) => v.preview !== preview);
        const allItems = [...p.images, ...filtered].sort(
          (a, b) => a.order - b.order,
        );
        return {
          ...p,
          images: p.images.map((img) => {
            const newOrder =
              allItems.findIndex((i) => i.preview === img.preview) + 1;
            return { ...img, order: newOrder };
          }),
          videos: filtered.map((vid) => {
            const newOrder =
              allItems.findIndex((i) => i.preview === vid.preview) + 1;
            return { ...vid, order: newOrder };
          }),
        };
      }),
    );
    setDraggedIndex(null);
  };

  const getAllMediaForPost = (post: ThreadPost) => {
    return [
      ...post.images.map((img) => ({ ...img, type: "image" as const })),
      ...post.videos.map((vid) => ({ ...vid, type: "video" as const })),
    ].sort((a, b) => a.order - b.order);
  };

  useEffect(() => {
    const targetPostId = addMediaZoneHover ?? focusedPostId;
    if (targetPostId === null) return;
    const handlePaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.getAttribute?.("data-caption-textarea") === "true") {
        const files = e.clipboardData?.files;
        const hasMedia =
          files &&
          Array.from(files).some(
            (f) =>
              f.type.startsWith("image/") || f.type.startsWith("video/"),
          );
        if (!hasMedia) return;
      }
      const file = e.clipboardData?.files?.[0];
      if (!file) return;
      const postId = addMediaZoneHover ?? focusedPostId;
      if (postId === null) return;
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        addImagesToPost(postId, [file]);
      } else if (file.type.startsWith("video/")) {
        e.preventDefault();
        addVideoToPost(postId, [file]);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMediaZoneHover, focusedPostId]);

  const handleDragStart = (postId: number, index: number) => {
    setDraggedPostId(postId);
    setDraggedIndex(index);
  };

  const handleDragOver = (
    e: React.DragEvent,
    postId: number,
    index: number,
  ) => {
    e.preventDefault();
    if (
      draggedPostId !== postId ||
      draggedIndex === null ||
      draggedIndex === index
    )
      return;
    setPosts((prev) => {
      const currentPost = prev.find((p) => p.id === postId);
      if (!currentPost) return prev;
      const sorted = getAllMediaForPost(currentPost);
      if (draggedIndex >= sorted.length || index >= sorted.length) return prev;
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
          file: i.file,
          preview: i.preview,
          order: i.order,
          mediaId: "mediaId" in i ? i.mediaId : undefined,
        }));
      const newVideos = reordered
        .filter((i) => i.type === "video")
        .map((i) => ({
          file: i.file,
          preview: i.preview,
          order: i.order,
          thumbnailUrl: "thumbnailUrl" in i ? i.thumbnailUrl : undefined,
          mediaId: "mediaId" in i ? i.mediaId : undefined,
        }));
      return prev.map((p) => {
        if (p.id !== postId) return p;
        return { ...p, images: newImages, videos: newVideos };
      });
    });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedPostId(null);
    setDraggedIndex(null);
  };

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
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
    const { autoRepostConfig, autoPlugConfig } =
      getAutoFeaturesInitialState();
    if (autoRepostConfig) setResurfaceConfig(autoRepostConfig);
    if (autoPlugConfig) setAutoPlugConfig(autoPlugConfig);
    hasRestoredAutoFeaturesRef.current = true;
  }, [
    hasXForResurface,
    rememberAutoFeatures,
    getAutoFeaturesInitialState,
  ]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstPostText) {
      setShowFirstTextError(true);
      return;
    }
    setShowFirstTextError(false);
    setLoading(true);
    setOverlayPhase("uploading");

    // Keep strict UI order: first post = first tweet (root), second = reply to first, etc.
    const threadPosts = posts
      .map((p, index) => ({ post: p, index }))
      .filter(
        ({ post }) =>
          post.text.trim().length > 0 ||
          post.images.length > 0 ||
          post.videos.length > 0,
      )
      .sort((a, b) => a.index - b.index)
      .map(({ post }) => post);
    const contentParts = threadPosts.map((p) => p.text.trim()).filter(Boolean);
    const content = contentParts.join(THREAD_SEPARATOR);
    if (!content.trim()) {
      setError("Add some text to your thread before posting.");
      setLoading(false);
      setOverlayPhase("idle");
      return;
    }

    // Twitter/X media constraints: per tweet, either up to 4 images OR a single video, not both.
    const hasTwitterX = selectedAccounts.some(
      (a) => a.platform === "twitter_x",
    );
    if (hasTwitterX) {
      for (let i = 0; i < threadPosts.length; i++) {
        const post = threadPosts[i];
        const allMedia = getAllMediaForPost(post);
        const images = allMedia.filter((m) => m.type === "image");
        const videos = allMedia.filter((m) => m.type === "video");

        if (videos.length > 0 && images.length > 0) {
          setError(
            `Twitter X only supports either images or a single video per tweet. Remove images or video from part ${
              i + 1
            }.`,
          );
          setLoading(false);
          setOverlayPhase("idle");
          return;
        }
        if (videos.length > 1) {
          setError(
            `Twitter X only supports one video per tweet. Part ${
              i + 1
            } currently has ${videos.length} videos.`,
          );
          setLoading(false);
          setOverlayPhase("idle");
          return;
        }
        if (images.length > 4) {
          setError(
            `Twitter X supports up to 4 images per tweet. Part ${
              i + 1
            } currently has ${images.length} images.`,
          );
          setLoading(false);
          setOverlayPhase("idle");
          return;
        }
      }
    }

    const mediaIds: string[] = [];
    const perThreadPostMediaIds: string[][] = [];

    type MediaTarget = {
      file: File;
      type: "image" | "video";
      postIndex: number;
    };

    const mediaTargets: MediaTarget[] = [];

    threadPosts.forEach((post, postIdx) => {
      const allMedia = getAllMediaForPost(post);
      const thisPostMediaIds: string[] = [];
      allMedia.forEach((item) => {
        if ("mediaId" in item && item.mediaId) {
          mediaIds.push(item.mediaId);
          thisPostMediaIds.push(item.mediaId);
        } else if (item.file) {
          mediaTargets.push({
            file: item.file,
            type: item.type,
            postIndex: postIdx,
          });
        }
      });
      perThreadPostMediaIds.push(thisPostMediaIds);
    });

    if (mediaTargets.length > 0) {
      setFileProgresses(new Array(mediaTargets.length).fill(0));
      const uploadAbortController = new AbortController();
      threadUploadAbortRef.current = uploadAbortController;
      const uploadResults = await Promise.allSettled(
        mediaTargets.map((target, fileIndex) =>
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
      threadUploadAbortRef.current = null;

      const failed = uploadResults
        .map((result, i) => ({ result, target: mediaTargets[i] }))
        .filter(
          (
            entry,
          ): entry is {
            result: PromiseRejectedResult;
            target: MediaTarget;
          } => entry.result.status === "rejected",
        );

      if (failed.length > 0) {
        const first = failed[0];
        const reason = first.result.reason;
        const label = first.target.type === "video" ? "video" : "image";
        const messageBase =
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : `Failed to upload ${label}`;
        setError(messageBase);
        setLoading(false);
        setOverlayPhase("idle");
        setUploadProgress(null);
        return;
      }

      uploadResults.forEach((result, i) => {
        if (result.status === "fulfilled") {
          const target = mediaTargets[i];
          const id = result.value.id;
          mediaIds.push(id);
          perThreadPostMediaIds[target.postIndex].push(id);
        }
      });
    }

    setUploadProgress(null);
    setOverlayPhase(
      (intendedModeRef.current ?? mode) === "draft" ? "saving" : "publishing",
    );

    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;
    const accountIds = Array.from(selectedIds);
    const metadata = {
      contentType: "threads" as const,
      twitterThread: {
        version: 1,
        separator: THREAD_SEPARATOR,
        parts: threadPosts.map((p, idx) => ({
          text: p.text.trim(),
          mediaIds: perThreadPostMediaIds[idx] ?? [],
        })),
      },
    };

    if (initialScheduledId && effectiveMode === "scheduled") {
      const { updatePost } = await import("@/app/actions/posts");
      const result = await updatePost(
        initialScheduledId,
        content,
        accountIds,
        scheduledAt,
        mediaIds,
        metadata,
        scheduledAt ? intendedQueueSlotIdRef.current ?? undefined : undefined,
      );
      if (scheduledAt) intendedQueueSlotIdRef.current = null;
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

    if (initialDraftId) {
      const { updateDraft, updateAndPublish, updatePost } =
        await import("@/app/actions/posts");
      if (effectiveMode === "draft") {
        const result = await updateDraft(
          initialDraftId,
          content,
          accountIds,
          mediaIds,
          metadata,
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
          content,
          accountIds,
          mediaIds,
          metadata,
        );
        setLoading(false);
        if (!result.success) {
          setError(result.error);
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
          content,
          accountIds,
          scheduledAt,
          mediaIds,
          metadata,
          scheduledAt ? intendedQueueSlotIdRef.current ?? undefined : undefined,
        );
        if (scheduledAt) intendedQueueSlotIdRef.current = null;
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
      content,
      accountIds,
      effectiveMode,
      scheduledAt,
      mediaIds,
      metadata,
      effectiveMode === "scheduled" ? intendedQueueSlotIdRef.current ?? undefined : undefined,
    );
    if (effectiveMode === "scheduled") intendedQueueSlotIdRef.current = null;
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      setOverlayPhase("idle");
      return;
    }
    if (effectiveMode === "now" && result.postId) {
      setPublishedPostId(result.postId);
      const list = await getPostPublicationList(result.postId);
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
        router.push(`/dashboard/posts/${result.postId}`);
        router.refresh();
        return;
      }
      const initial: PlatformResult[] = list.map((pub) => ({
        platform: pub.platform,
        accountId: pub.connectedAccountId,
        accountName: pub.platformUsername
          ? `@${pub.platformUsername}`
          : PLATFORMS.find((p) => p.id === pub.platform)?.name ?? pub.platform,
        status: "waiting" as PlatformStatus,
      }));
      setPlatformStatuses(initial);
      setOverlayPhase("publishing");
      for (let i = 0; i < list.length; i++) {
        const pub = list[i];
        setPlatformStatuses((prev) =>
          prev.map((p) =>
            p.accountId === pub.connectedAccountId
              ? { ...p, status: "processing" as PlatformStatus }
              : p,
          ),
        );
        const singleResult = await publishSinglePublication(
          result.postId,
          pub.publicationId,
        );
        const res = singleResult.results[0];
        setPlatformStatuses((prev) =>
          prev.map((p) =>
            p.accountId === pub.connectedAccountId
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
      }
      await publishPost(result.postId);
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

  const firstPostText = posts[0]?.text.trim() ?? "";
  const hasContent = firstPostText.length > 0;

  const submitDisabledReason =
    !hasContent
      ? "Add text to the first post"
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
        : "Post";

  const hasImages = posts.some((p) => p.images.length > 0);
  const hasVideos = posts.some((p) => p.videos.length > 0);
  const overlayMediaType: "image" | "video" | "mixed" =
    hasImages && hasVideos ? "mixed" : hasVideos ? "video" : "image";

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const q = accountSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.platformUsername?.toLowerCase().includes(q) ||
        a.platform?.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);

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
              ? () => threadUploadAbortRef.current?.abort()
              : undefined
          }
          mediaType={overlayMediaType}
          isScheduling={mode === "scheduled"}
          showLinks={overlayPhase === "done"}
          publishedPostId={publishedPostId}
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
              setOverlayPhase("done");
            }
          }}
        />
      )}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 lg:flex-row lg:items-start"
      >
        <div className="min-w-0 flex-1 space-y-6 lg:max-w-[65%] -mt-4">
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
            dateFormat={dateFormat}
            hideScheduleAndActions
            searchSlot={
              <input
                type="search"
                placeholder="Search accounts..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="h-8 w-full text-xs rounded border border-border px-2 py-1 text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            }
            remember={remember}
            onRememberChange={setRemember}
            supportedPlatforms={supportedPlatforms}
            disabledAccountIds={videoLimitState.accountIds}
            disabledReasons={videoLimitDisabledReasons}
            disabledAccountDefaultReason="Video exceeds this platform's length limit"
            warningAccountIds={videoLimitState.softAccountIds}
            warningReasons={videoLimitWarningReasons}
            warningLabel="May limit reach"
          />

          {posts.some((p) => p.videos.length > 0) &&
            maxVideoDurationSeconds > 0 &&
            (videoLimitState.warnings.length > 0 ||
              videoLimitState.softWarnings.length > 0) && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/50 p-4 text-black dark:text-amber-100">
                <p className="font-semibold text-amber-900 dark:text-amber-200 mb-2">
                  Video length limits
                </p>
                <p className="text-sm mb-2">
                  Your longest video in this thread is{" "}
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
                      The following exceed platform limits. Affected accounts are
                      disabled for this post:
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

          {error && (
            <div className="relative rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 pr-10 text-sm font-medium text-destructive">
              {error}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text hover:bg-bg-muted transition-colors"
                >
                  Try again
                </button>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive/70 hover:bg-destructive/20 transition-colors"
                aria-label="Dismiss error"
              >
                <MdClose className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-bg p-6 shadow-sm space-y-4">
            <p className="text-sm font-semibold text-text">
              Thread posts (stacked in order when published)
            </p>
            <p className="text-sm text-text-muted -mt-2">
              You can add images or a video to each post.
            </p>

            {selectedAccounts.some((a) => a.platform === "bluesky") &&
              posts.some(
                (p) =>
                  (p.images.length > 0 && p.videos.length > 0) ||
                  p.videos.length > 1,
              ) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                <p>
                  Bluesky supports only one video per post and doesn&apos;t
                  allow mixing images and videos. For posts with multiple videos
                  or both images and videos, only the first video will be
                  published to Bluesky. Add images and videos to different
                  posts in your thread to include both.
                </p>
              </div>
            )}

            {posts.map((post, index) => (
              <div
                key={post.id}
                className="relative rounded-xl border border-border-subtle bg-bg-subtle/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-text-muted">
                    Post {index + 1}
                  </span>
                  {posts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePost(post.id)}
                      className="text-text-muted hover:text-destructive p-1 rounded"
                      title="Remove this post"
                    >
                      <MdClose className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <textarea
                  data-caption-textarea="true"
                  value={post.text}
                  onChange={(e) => updatePost(post.id, e.target.value)}
                  placeholder="What's happening?"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
                  autoFocus={index === 0}
                  onFocus={() => setFocusedPostId(post.id)}
                  onBlur={() => setFocusedPostId(null)}
                />
                <CaptionCounter
                  caption={post.text}
                  selectedAccounts={selectedAccounts.map((a) => ({
                    platform: a.platform,
                    isTwitterPremium: a.isTwitterPremium ?? false,
                    platformUsername: a.platformUsername ?? null,
                  }))}
                />
                {index === 0 && showFirstTextError && !firstPostText && (
                  <p className="mt-1 text-xs text-destructive">
                    Caption is required
                  </p>
                )}

                {/* Media previews - draggable with serial numbers */}
                {(post.images.length > 0 || post.videos.length > 0) && (
                  <div className="space-y-2">
                    <p className="text-xs text-text-muted">
                      Drag to reorder media (carousel order)
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {getAllMediaForPost(post).map((item, index) => {
                        const isVideo = item.type === "video";
                        return (
                          <div
                            key={item.preview}
                            draggable
                            onDragStart={() => handleDragStart(post.id, index)}
                            onDragOver={(e) =>
                              handleDragOver(e, post.id, index)
                            }
                            onDragEnd={handleDragEnd}
                            className={`relative shrink-0 cursor-move overflow-hidden rounded border border-border hover:border-accent transition-colors ${
                              isVideo ? "h-12 w-16" : "h-12 w-12"
                            }`}
                          >
                            {isVideo ? (
                              <video
                                key={item.preview}
                                src={item.preview}
                                className="h-full w-full object-cover"
                                muted
                                playsInline
                                preload="auto"
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
                            <div className="absolute left-0 right-0 top-0 bg-black/60 px-1.5 py-0.5 text-center">
                              <span className="text-xs font-bold text-white">
                                {item.order}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                isVideo
                                  ? removeVideoFromPost(post.id, item.preview)
                                  : removeImageFromPost(post.id, item.preview)
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

                {/* Add media */}
                <div className="pt-1 border-t border-border-subtle">
                  <label
                    onMouseEnter={() => setAddMediaZoneHover(post.id)}
                    onMouseLeave={() => setAddMediaZoneHover(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDragEnter={() => setDragOverPostId(post.id)}
                    onDragLeave={() => setDragOverPostId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverPostId(null);
                      const files = e.dataTransfer.files;
                      if (!files?.length) return;
                      const imageFiles = Array.from(files).filter((f) =>
                        f.type.startsWith("image/"),
                      );
                      const videoFiles = Array.from(files).filter((f) =>
                        f.type.startsWith("video/"),
                      );
                      if (imageFiles.length > 0)
                        addImagesToPost(post.id, imageFiles);
                      if (videoFiles.length > 0)
                        addVideoToPost(post.id, videoFiles);
                    }}
                    className={`flex items-center justify-center gap-2 w-full rounded-xl border px-4 py-2 cursor-pointer transition-colors text-sm text-text-muted ${
                      addMediaZoneHover === post.id || dragOverPostId === post.id
                        ? "border-accent bg-accent/5"
                        : "border-border bg-bg-subtle hover:border-accent hover:bg-accent/5"
                    }`}
                  >
                    <MdOutlinePhotoLibrary className="h-4 w-4" />
                    <MdOutlineVideocam className="h-4 w-4" />
                    <span>
                      Add media ({post.images.length + post.videos.length}/
                      {MAX_ATTACHMENTS_PER_POST}) · Drag and drop or paste
                      (Ctrl+V)
                    </span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (!files?.length) return;
                        const imageFiles = Array.from(files).filter((f) =>
                          f.type.startsWith("image/"),
                        );
                        const videoFiles = Array.from(files).filter((f) =>
                          f.type.startsWith("video/"),
                        );
                        if (imageFiles.length > 0)
                          addImagesToPost(post.id, imageFiles);
                        if (videoFiles.length > 0)
                          addVideoToPost(post.id, videoFiles);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addPost}
              className="flex items-center gap-2 w-full justify-center rounded-xl border-2 border-dashed border-border bg-bg-subtle/50 py-4 text-text-muted hover:border-accent hover:bg-accent/10 hover:text-accent transition-colors font-medium text-sm"
            >
              <IoMdAddCircleOutline className="w-5 h-5" />
              Add another post
            </button>
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
            (mode === "scheduled" && !scheduledAt) ||
            !hasContent
          }
          hasAccountSelected={selectedIds.size > 0}
          submitDisabledReason={submitDisabledReason}
          error={error}
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
          <div className="hidden lg:block rounded-xl border border-border bg-bg p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
              Thread Preview
            </h3>
            {posts.length === 0 ||
            !posts.some(
              (p) =>
                p.text.trim() || p.images.length > 0 || p.videos.length > 0,
            ) ? (
              <p className="text-sm italic text-text-muted">
                Add your first post to see preview
              </p>
            ) : (
              <div className="max-h-[350px] overflow-y-auto space-y-0">
                {posts.map((post, index) => {
                  const displayName =
                    selectedAccounts[0]?.platformUsername != null
                      ? `@${selectedAccounts[0].platformUsername}`
                      : "@username";
                  const initial = (selectedAccounts[0]?.platformUsername ?? "A")
                    .charAt(0)
                    .toUpperCase();
                  const hasContent =
                    post.text.trim() ||
                    post.images.length > 0 ||
                    post.videos.length > 0;
                  const isLast = index === posts.length - 1;
                  const previewItems = getAllMediaForPost(post).slice(
                    0,
                    MAX_ATTACHMENTS_PER_POST,
                  ) as PreviewMediaItem[];
                  return (
                    <div key={post.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-muted text-sm font-semibold text-text-muted">
                          {selectedAccounts[0]?.profileImageUrl?.trim() ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={selectedAccounts[0].profileImageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            initial
                          )}
                        </div>
                        {!isLast && (
                          <div className="w-0.5 flex-1 min-h-[8px] bg-bg-muted" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pb-4">
                        <p className="text-sm font-semibold text-text">
                          {displayName}
                        </p>
                        {hasContent ? (
                          <>
                            <p className="mt-0.5 text-sm text-text whitespace-pre-wrap wrap-break-word">
                              {post.text.trim() ? (
                                post.text
                              ) : (
                                <span className="italic text-text-muted">
                                  Post {index + 1}
                                </span>
                              )}
                            </p>
                            {previewItems.length > 0 && (
                              <div className="mt-2">
                                <ThreadPreviewMediaGrid items={previewItems} />
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="mt-0.5 text-sm italic text-text-muted">
                            Post {index + 1}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
