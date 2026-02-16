"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { PostFormOptions } from "../PostFormOptions";
import {
  MdOutlineAddPhotoAlternate,
  MdOutlineVideocam,
  MdClose,
} from "react-icons/md";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

type ImageFile = { file: File; preview: string };
type VideoFile = { file: File; preview: string } | null;

export function CollectionPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageFile[]>([]);
  const [video, setVideo] = useState<VideoFile>(null);
  const imagesRef = useRef<ImageFile[]>([]);
  const videoRef = useRef<VideoFile>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    imagesRef.current = images;
    videoRef.current = video;
  }, [images, video]);
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((i) => URL.revokeObjectURL(i.preview));
      if (videoRef.current) URL.revokeObjectURL(videoRef.current.preview);
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

  const onImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const newImages: ImageFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) {
        setError("Please select only image files.");
        continue;
      }
      newImages.push({ file, preview: URL.createObjectURL(file) });
    }
    setError(null);
    setImages((prev) => [...prev, ...newImages]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const onVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith("video/")) {
      if (file) setError("Please select a video file.");
      return;
    }
    setError(null);
    if (video) URL.revokeObjectURL(video.preview);
    setVideo({ file, preview: URL.createObjectURL(file) });
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const removeImage = (preview: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.preview === preview);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.preview !== preview);
    });
  };

  const removeVideo = () => {
    if (video) URL.revokeObjectURL(video.preview);
    setVideo(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const mediaIds: string[] = [];
    for (const img of images) {
      try {
        const fd = new FormData();
        fd.set("file", img.file);
        const res = await fetch("/api/media/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (data.id) mediaIds.push(data.id);
      } catch {
        setError("Failed to upload an image.");
        setLoading(false);
        return;
      }
    }
    if (video) {
      try {
        const fd = new FormData();
        fd.set("file", video.file);
        const res = await fetch("/api/media/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (data.id) mediaIds.push(data.id);
      } catch {
        setError("Failed to upload video.");
        setLoading(false);
        return;
      }
    }

    const text =
      content.trim() ||
      (images.length || video
        ? `[${images.length} image(s)${video ? " + video" : ""}]`
        : "");
    const result = await createPost(
      text,
      Array.from(selectedIds),
      mode,
      scheduledAt,
      mediaIds,
    );
    setLoading(false);
    if (result.success) {
      router.push("/dashboard/posts");
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const hasContent =
    content.trim().length > 0 || images.length > 0 || video !== null;
  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
        : "Post now";

  return (
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
            Video
          </label>
          <input
            id="collection-video"
            type="file"
            accept="video/*"
            onChange={onVideoChange}
            className="hidden"
          />
        </div>

        {(images.length > 0 || video) && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {images.map((img) => (
              <div
                key={img.preview}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL preview */}
                <img
                  src={img.preview}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.preview)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                >
                  <MdClose className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {video && (
              <div className="relative flex h-12 w-16 shrink-0 overflow-hidden rounded border border-gray-200">
                <video
                  src={video.preview}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                />
                <button
                  type="button"
                  onClick={removeVideo}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 rounded text-white transition-opacity"
                >
                  <MdClose className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
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
      />
    </form>
  );
}
