"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { publishPost } from "@/app/actions/publish";
import {
  createResurfaceSchedule,
  createAutoPlug,
} from "@/app/actions/resurface";
import { PostFormOptions } from "../PostFormOptions";
import { AutoFeaturesCard } from "@/components/repost/AutoFeaturesCard";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import { UploadPublishOverlay } from "@/components/UploadPublishOverlay";
import { IoMdAddCircleOutline } from "react-icons/io";
import { MdClose } from "react-icons/md";
import { MdOutlinePhotoLibrary, MdOutlineVideocam } from "react-icons/md";

const MAX_CHARS = 280;
const MAX_IMAGES_PER_POST = 4;
const THREAD_SEPARATOR = "\n\n---\n\n";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

type MediaImage = { file: File; preview: string; order: number };
type MediaVideo = { file: File; preview: string; order: number };

type ThreadPost = {
  id: number;
  text: string;
  images: MediaImage[];
  videos: MediaVideo[];
};

export function ThreadsPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const nextIdRef = useRef(1);
  const nextId = () => {
    nextIdRef.current += 1;
    return nextIdRef.current;
  };
  const [posts, setPosts] = useState<ThreadPost[]>(() => [
    { id: 1, text: "", images: [], videos: [] },
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resurfaceConfig, setResurfaceConfig] =
    useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );
  const [draggedPostId, setDraggedPostId] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  type OverlayPhase = "idle" | "uploading" | "publishing" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const postsRef = useRef<ThreadPost[]>(posts);

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

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
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
    setPosts((prev) => {
      const post = prev.find((p) => p.id === postId);
      if (!post) return prev;
      const maxOrder = getMaxOrderForPost(post);
      const imagesWithOrder = newImages.map((img, idx) => ({
        ...img,
        order: maxOrder + idx + 1,
      }));
      return prev.map((p) => {
        if (p.id !== postId) return p;
        const combined = [...p.images, ...imagesWithOrder].slice(
          0,
          MAX_IMAGES_PER_POST,
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
    const newVideos: MediaVideo[] = [];
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.type.startsWith("video/")) continue;
      const preview = URL.createObjectURL(file);
      newVideos.push({
        file,
        preview,
        order: 0, // Will be set below
      });
    }
    if (newVideos.length === 0) return;
    setPosts((prev) => {
      const post = prev.find((p) => p.id === postId);
      if (!post) return prev;
      const maxOrder = getMaxOrderForPost(post);
      const videosWithOrder = newVideos.map((vid, idx) => ({
        ...vid,
        order: maxOrder + idx + 1,
      }));
      return prev.map((p) => {
        if (p.id !== postId) return p;
        return { ...p, videos: [...p.videos, ...videosWithOrder] };
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setOverlayPhase("uploading");

    const threadPosts = posts.filter(
      (p) => p.text.trim().length > 0 || p.images.length > 0 || p.videos.length > 0,
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

    const result = await createPost(
      content,
      Array.from(selectedIds),
      mode,
      scheduledAt,
      mediaIds,
      {
        twitterThread: {
          version: 1,
          separator: THREAD_SEPARATOR,
          parts: threadPosts.map((p, idx) => ({
            text: p.text.trim(),
            mediaIds: perThreadPostMediaIds[idx] ?? [],
          })),
        },
      },
    );
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      setOverlayPhase("idle");
      return;
    }
    if (mode === "now" && result.postId) {
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
      if (resurfaceConfig && selectedAccounts.some((a) => a.platform === "twitter_x")) {
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

  const anyOverLimit = posts.some((p) => p.text.length > MAX_CHARS);
  const hasContent = posts.some(
    (p) =>
      p.text.trim().length > 0 || p.images.length > 0 || p.videos.length > 0,
  );

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
      <form onSubmit={handleSubmit} className="space-y-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <p className="text-sm font-semibold text-gray-900">
          Thread posts (stacked in order when published)
        </p>
        <p className="text-sm text-gray-500 -mt-2">
          Short posts work best — e.g. {MAX_CHARS} chars per post. You can add
          images or a video to each post.
        </p>

        {posts.map((post, index) => (
          <div
            key={post.id}
            className="relative rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-3"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500">
                Post {index + 1}
              </span>
              {posts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePost(post.id)}
                  className="text-gray-400 hover:text-red-600 p-1 rounded"
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
              maxLength={MAX_CHARS}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
            />
            <div className="flex justify-end text-sm">
              <span
                className={
                  post.text.length > MAX_CHARS
                    ? "text-red-600 font-medium"
                    : "text-gray-500"
                }
              >
                {post.text.length} / {MAX_CHARS}
              </span>
            </div>

            {/* Media previews - draggable with serial numbers */}
            {(post.images.length > 0 || post.videos.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
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
                        onDragOver={(e) => handleDragOver(e, post.id, index)}
                        onDragEnd={handleDragEnd}
                        className={`relative shrink-0 cursor-move overflow-hidden rounded border border-gray-200 hover:border-emerald-400 transition-colors ${
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

            {/* Add media buttons */}
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                id={`thread-images-${post.id}`}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    addImagesToPost(post.id, files);
                  }
                  e.target.value = "";
                }}
              />
              <input
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                id={`thread-video-${post.id}`}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    addVideoToPost(post.id, files);
                  }
                  e.target.value = "";
                }}
              />
              <label
                htmlFor={`thread-images-${post.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <MdOutlinePhotoLibrary className="w-4 h-4 text-gray-500" />
                Images
                {post.images.length > 0 && (
                  <span className="text-gray-500">({post.images.length})</span>
                )}
              </label>
              <label
                htmlFor={`thread-video-${post.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <MdOutlineVideocam className="w-4 h-4 text-gray-500" />
                Videos
                {post.videos.length > 0 && (
                  <span className="text-gray-500">({post.videos.length})</span>
                )}
              </label>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addPost}
          className="flex items-center gap-2 w-full justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 py-4 text-gray-600 hover:border-emerald-400 hover:bg-emerald-50/30 hover:text-emerald-700 transition-colors font-medium text-sm"
        >
          <IoMdAddCircleOutline className="w-5 h-5" />
          Add another post
        </button>
      </div>

      <AutoFeaturesCard
        selectedAccountIds={Array.from(selectedIds)}
        allAccounts={accounts}
        onResurfaceChange={setResurfaceConfig}
        onAutoPlugChange={setAutoPlugConfig}
      />

      <PostFormOptions
        accounts={accounts}
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
          anyOverLimit ||
          !hasContent
        }
      />
    </form>
    </>
  );
}
