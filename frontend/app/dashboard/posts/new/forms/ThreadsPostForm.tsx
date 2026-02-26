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
import { UploadPublishOverlay } from "@/components/UploadPublishOverlay";
import { IoMdAddCircleOutline } from "react-icons/io";
import { MdClose } from "react-icons/md";
import { MdOutlinePhotoLibrary, MdOutlineVideocam } from "react-icons/md";

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
        {item.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={item.thumbnailUrl} alt="" className={imgClass} />
        ) : (
          <div className="absolute inset-0 bg-bg-muted" />
        )}
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
  tokenExpired?: boolean;
};

type MediaImage = { file: File; preview: string; order: number };
type MediaVideo = {
  file: File;
  preview: string;
  order: number;
  thumbnailUrl?: string;
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
  draftId: initialDraftId,
}: {
  accounts: Account[];
  use24HourTimeFormat?: boolean;
  draftId?: string;
}) {
  const router = useRouter();
  const nextIdRef = useRef(1);
  const nextId = () => {
    nextIdRef.current += 1;
    return nextIdRef.current;
  };
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const validIds = useMemo(
    () => new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id)),
    [accounts],
  );
  const { remember, setRemember, getInitialSelectedIds, persistSelection } =
    useRememberedAccounts("post-form");
  const [accountSearch, setAccountSearch] = useState("");
  const [posts, setPosts] = useState<ThreadPost[]>(() => [
    { id: 1, text: "", images: [], videos: [] },
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialDraftId ? new Set() : getInitialSelectedIds(validIds),
  );
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(!!initialDraftId);
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
  const [draggedPostId, setDraggedPostId] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  type OverlayPhase = "idle" | "uploading" | "publishing" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const postsRef = useRef<ThreadPost[]>(posts);
  const [showFirstTextError, setShowFirstTextError] = useState(false);
  const [addMediaZoneHover, setAddMediaZoneHover] = useState<number | null>(
    null,
  );

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
        post.images.forEach((i) => URL.revokeObjectURL(i.preview));
        post.videos.forEach((v) => URL.revokeObjectURL(v.preview));
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
        if (img) URL.revokeObjectURL(img.preview);
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
    const toAdd = newVideos.slice(
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
  };

  const removeVideoFromPost = (postId: number, preview: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const vid = p.videos.find((v) => v.preview === preview);
        if (vid) URL.revokeObjectURL(vid.preview);
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
    if (addMediaZoneHover === null) return;
    const handlePaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0];
      if (!file) return;
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        addImagesToPost(addMediaZoneHover, [file]);
      } else if (file.type.startsWith("video/")) {
        e.preventDefault();
        addVideoToPost(addMediaZoneHover, [file]);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMediaZoneHover]);

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
        }));
      const newVideos = reordered
        .filter((i) => i.type === "video")
        .map((i) => ({
          file: i.file,
          preview: i.preview,
          order: i.order,
          thumbnailUrl: "thumbnailUrl" in i ? i.thumbnailUrl : undefined,
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

    const threadPosts = posts.filter(
      (p) =>
        p.text.trim().length > 0 || p.images.length > 0 || p.videos.length > 0,
    );
    const contentParts = threadPosts.map((p) => p.text.trim()).filter(Boolean);
    const content = contentParts.join(THREAD_SEPARATOR);
    if (!content.trim()) {
      setError("Add some text to your thread before posting.");
      setLoading(false);
      setOverlayPhase("idle");
      return;
    }

    const mediaIds: string[] = [];
    const perThreadPostMediaIds: string[][] = [];
    const totalMedia = threadPosts.reduce(
      (sum, p) => sum + getAllMediaForPost(p).length,
      0,
    );
    let uploaded = 0;
    for (const post of threadPosts) {
      const allMedia = getAllMediaForPost(post);
      const thisPostMediaIds: string[] = [];
      for (const item of allMedia) {
        setUploadProgress(`${uploaded + 1} of ${totalMedia}`);
        try {
          const fd = new FormData();
          fd.set("file", item.file);
          const res = await fetch("/api/media/upload", {
            method: "POST",
            body: fd,
          });
          if (!res.ok) {
            const errorData = await res
              .json()
              .catch(() => ({ error: "Upload failed" }));
            setError(
              errorData.error ||
                `Failed to upload ${item.type === "video" ? "video" : "image"}`,
            );
            setLoading(false);
            setOverlayPhase("idle");
            setUploadProgress(null);
            return;
          }
          const data = await res.json();
          if (data.error) {
            setError(data.error);
            setLoading(false);
            setOverlayPhase("idle");
            setUploadProgress(null);
            return;
          }
          if (data.id) {
            mediaIds.push(data.id);
            thisPostMediaIds.push(data.id);
          } else {
            setError(
              `Failed to get media ID for ${item.type === "video" ? "video" : "image"}`,
            );
            setLoading(false);
            setOverlayPhase("idle");
            setUploadProgress(null);
            return;
          }
          uploaded += 1;
        } catch (err) {
          console.error("Upload error:", err);
          setError(
            `Failed to upload ${item.type === "video" ? "video" : "image"}: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
          setLoading(false);
          setOverlayPhase("idle");
          setUploadProgress(null);
          return;
        }
      }
      perThreadPostMediaIds.push(thisPostMediaIds);
    }
    setUploadProgress(null);
    setOverlayPhase("publishing");

    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;
    const accountIds = Array.from(selectedIds);
    const metadata = {
      twitterThread: {
        version: 1,
        separator: THREAD_SEPARATOR,
        parts: threadPosts.map((p, idx) => ({
          text: p.text.trim(),
          mediaIds: perThreadPostMediaIds[idx] ?? [],
        })),
      },
    };

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
          content,
          accountIds,
          scheduledAt,
          mediaIds,
          metadata,
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
      content,
      accountIds,
      effectiveMode,
      scheduledAt,
      mediaIds,
      metadata,
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
        const msg =
          publishResult?.error && publishResult.error.trim()
            ? publishResult.error
            : "Publish failed";
        setError(msg);
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

  const firstPostText = posts[0]?.text.trim() ?? "";
  const hasContent = firstPostText.length > 0;

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
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
              : overlayPhase === "publishing"
                ? "publishing"
                : "publishing"
          }
          uploadProgress={uploadProgress}
          mediaType={overlayMediaType}
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
            onCancel={() => router.push("/dashboard/posts")}
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
                className="h-8 w-full text-xs rounded border border-border px-2 py-1 text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            }
            remember={remember}
            onRememberChange={setRemember}
          />

          <div className="rounded-2xl border border-border bg-bg p-6 shadow-sm space-y-4">
            <p className="text-sm font-semibold text-text">
              Thread posts (stacked in order when published)
            </p>
            <p className="text-sm text-text-muted -mt-2">
              You can add images or a video to each post.
            </p>

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
                  value={post.text}
                  onChange={(e) => updatePost(post.id, e.target.value)}
                  placeholder="What's happening?"
                  rows={3}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
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
                    className={`flex items-center justify-center gap-2 w-full rounded-xl border px-4 py-2 cursor-pointer transition-colors text-sm text-text-muted ${
                      addMediaZoneHover === post.id
                        ? "border-accent bg-accent/5"
                        : "border-border bg-bg-subtle hover:border-accent hover:bg-accent/5"
                    }`}
                  >
                    <MdOutlinePhotoLibrary className="h-4 w-4" />
                    <MdOutlineVideocam className="h-4 w-4" />
                    <span>
                      Add media ({post.images.length + post.videos.length}/
                      {MAX_ATTACHMENTS_PER_POST}) · Hover and paste from
                      clipboard (Ctrl+V)
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
                            <p className="mt-0.5 text-sm text-text">
                              {post.text.trim() || (
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
