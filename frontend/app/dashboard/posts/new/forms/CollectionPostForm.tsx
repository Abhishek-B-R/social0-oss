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
import {
  MdOutlineAddPhotoAlternate,
  MdOutlineVideocam,
  MdClose,
} from "react-icons/md";
import { type TikTokPostSettings } from "@/components/TikTokSettings";
import { TikTokSettingsModal } from "@/components/TikTokSettingsModal";
import { UploadPublishOverlay } from "@/components/UploadPublishOverlay";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

type ImageFile = { file: File; preview: string; order: number };
type VideoFile = { file: File; preview: string; order: number };

export function CollectionPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageFile[]>([]);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const imagesRef = useRef<ImageFile[]>([]);
  const videosRef = useRef<VideoFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type OverlayPhase = "idle" | "uploading" | "publishing" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
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

  const selectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
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
    setError(null);
    setImages((prev) => [...prev, ...newImages]);
    if (imageInputRef.current) imageInputRef.current.value = "";
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
    setError(null);
    setVideos((prev) => [...prev, ...newVideos]);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

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
      if (item) URL.revokeObjectURL(item.preview);
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
      if (item) URL.revokeObjectURL(item.preview);
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

    const allMedia: Array<{ file: File; order: number }> = [
      ...images.map((img) => ({ file: img.file, order: img.order })),
      ...videos.map((vid) => ({ file: vid.file, order: vid.order })),
    ].sort((a, b) => a.order - b.order);

    const mediaIds: string[] = [];
    const total = allMedia.length;
    for (let i = 0; i < allMedia.length; i++) {
      const item = allMedia[i];
      setUploadProgress(`${i + 1} of ${total}`);
      try {
        const fd = new FormData();
        fd.set("file", item.file);
        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (data.id) mediaIds.push(data.id);
      } catch {
        setError("Failed to upload media.");
        setLoading(false);
        setOverlayPhase("idle");
        setUploadProgress(null);
        return;
      }
    }
    setUploadProgress(null);
    setOverlayPhase("publishing");

    const text =
      content.trim() ||
      (images.length || videos.length
        ? `[${images.length} image(s)${videos.length ? ` + ${videos.length} video(s)` : ""}]`
        : "");

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

    const result = await createPost(
      text,
      Array.from(selectedIds),
      mode,
      scheduledAt,
      mediaIds,
      Object.keys(metadata).length > 0 ? metadata : undefined,
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
  const hasTikTok = selectedAccounts.some((a) => a.platform === "tiktok");
  const tiktokAccounts = selectedAccounts.filter(
    (a) => a.platform === "tiktok",
  );

  const hasContent =
    content.trim().length > 0 || images.length > 0 || videos.length > 0;
  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
        : "Post now";

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
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <label className="block text-sm font-semibold text-gray-900">
            Collection of images and videos (one post)
          </label>
          <p className="text-sm text-gray-500 -mt-2">
            Add a caption plus multiple images and/or video in a single post.
            Supported on Facebook, LinkedIn, X, Threads, Bluesky, Instagram,
            Pinterest.
          </p>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your caption..."
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onImagesChange}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={onVideoChange}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="collection-images"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <MdOutlineAddPhotoAlternate className="w-5 h-5" />
              Images
              {images.length > 0 && (
                <span className="text-gray-500">({images.length})</span>
              )}
            </label>
            <input
              id="collection-images"
              type="file"
              accept="image/*"
              multiple
              onChange={onImagesChange}
              className="hidden"
            />
            <label
              htmlFor="collection-video"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <MdOutlineVideocam className="w-5 h-5" />
              Videos
              {videos.length > 0 && (
                <span className="text-gray-500">({videos.length})</span>
              )}
            </label>
            <input
              id="collection-video"
              type="file"
              accept="video/*"
              multiple
              onChange={onVideoChange}
              className="hidden"
            />
          </div>

          {(images.length > 0 || videos.length > 0) && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">
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
                      className={`relative shrink-0 cursor-move overflow-hidden rounded-lg border border-gray-200 hover:border-emerald-400 transition-colors ${
                        isVideo ? "h-12 w-16" : "h-20 w-20"
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
            !hasContent
          }
          tiktokConfiguredIds={
            hasTikTok
              ? new Set(
                  tiktokAccounts
                    .filter((a) => tiktokSettings[a.id]?.privacy_level)
                    .map((a) => a.id),
                )
              : undefined
          }
          onOpenTikTokSettings={setTiktokModalAccountId}
          betweenScheduleAndActions={
            <AutoFeaturesCard
              selectedAccountIds={Array.from(selectedIds)}
              allAccounts={accounts}
              onResurfaceChange={setResurfaceConfig}
              onAutoPlugChange={setAutoPlugConfig}
            />
          }
        />

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
            mediaType={videos.length > 0 ? "video" : "photo"}
          />
        )}
      </form>
    </>
  );
}
