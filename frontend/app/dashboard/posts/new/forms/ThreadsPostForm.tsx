"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { PostFormOptions } from "../PostFormOptions";
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

type MediaImage = { file: File; preview: string };
type MediaVideo = { file: File; preview: string };

type ThreadPost = {
  id: number;
  text: string;
  images: MediaImage[];
  video: MediaVideo | null;
};

export function ThreadsPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const nextIdRef = useRef(1);
  const nextId = () => {
    nextIdRef.current += 1;
    return nextIdRef.current;
  };
  const [posts, setPosts] = useState<ThreadPost[]>(() => [
    { id: 1, text: "", images: [], video: null },
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const postsRef = useRef<ThreadPost[]>(posts);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    return () => {
      postsRef.current.forEach((p) => {
        p.images.forEach((i) => URL.revokeObjectURL(i.preview));
        if (p.video) URL.revokeObjectURL(p.video.preview);
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
      { id: nextId(), text: "", images: [], video: null },
    ]);

  const removePost = (id: number) => {
    if (posts.length <= 1) return;
    setPosts((prev) => {
      const post = prev.find((p) => p.id === id);
      if (post) {
        post.images.forEach((i) => URL.revokeObjectURL(i.preview));
        if (post.video) URL.revokeObjectURL(post.video.preview);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const addImagesToPost = (postId: number, files: FileList | null) => {
    if (!files?.length) return;
    const newImages: MediaImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      newImages.push({ file, preview: URL.createObjectURL(file) });
    }
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const combined = [...p.images, ...newImages].slice(0, MAX_IMAGES_PER_POST);
        return { ...p, images: combined };
      }),
    );
  };

  const removeImageFromPost = (postId: number, preview: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const img = p.images.find((i) => i.preview === preview);
        if (img) URL.revokeObjectURL(img.preview);
        return {
          ...p,
          images: p.images.filter((i) => i.preview !== preview),
        };
      }),
    );
  };

  const addVideoToPost = (postId: number, files: FileList | null) => {
    const file = files?.[0];
    if (!file?.type.startsWith("video/")) return;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (p.video) URL.revokeObjectURL(p.video.preview);
        return {
          ...p,
          video: { file, preview: URL.createObjectURL(file) },
        };
      }),
    );
  };

  const removeVideoFromPost = (postId: number) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId || !p.video) return p;
        URL.revokeObjectURL(p.video.preview);
        return { ...p, video: null };
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const trimmed = posts
      .map((p) => p.text.trim())
      .filter(Boolean);
    const content = trimmed.join(THREAD_SEPARATOR);

    const mediaIds: string[] = [];
    for (const post of posts) {
      for (const img of post.images) {
        try {
          const fd = new FormData();
          fd.set("file", img.file);
          const res = await fetch("/api/media/upload", {
            method: "POST",
            body: fd,
          });
          const data = await res.json();
          if (data.id) mediaIds.push(data.id);
        } catch {
          setError("Failed to upload an image.");
          setLoading(false);
          return;
        }
      }
      if (post.video) {
        try {
          const fd = new FormData();
          fd.set("file", post.video.file);
          const res = await fetch("/api/media/upload", {
            method: "POST",
            body: fd,
          });
          const data = await res.json();
          if (data.id) mediaIds.push(data.id);
        } catch {
          setError("Failed to upload video.");
          setLoading(false);
          return;
        }
      }
    }

    const result = await createPost(
      content,
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

  const anyOverLimit = posts.some((p) => p.text.length > MAX_CHARS);
  const hasContent = posts.some(
    (p) => p.text.trim().length > 0 || p.images.length > 0 || p.video !== null,
  );

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
        : "Post";

  return (
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
          <div key={post.id} className="relative rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-3">
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

            {/* Media previews - 48px max */}
            {(post.images.length > 0 || post.video) && (
              <div className="flex flex-wrap items-center gap-2">
                {post.images.map((img) => (
                  <div
                    key={img.preview}
                    className="relative flex h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob URL preview */}
                    <img
                      src={img.preview}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImageFromPost(post.id, img.preview)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 rounded text-white transition-opacity"
                    >
                      <MdClose className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {post.video && (
                  <div className="relative flex h-12 w-16 shrink-0 overflow-hidden rounded border border-gray-200">
                    <video
                      src={post.video.preview}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                    />
                    <button
                      type="button"
                      onClick={() => removeVideoFromPost(post.id)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 rounded text-white transition-opacity"
                    >
                      <MdClose className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
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
                  addImagesToPost(post.id, e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                type="file"
                accept="video/*"
                className="hidden"
                id={`thread-video-${post.id}`}
                onChange={(e) => {
                  addVideoToPost(post.id, e.target.files);
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
                Video
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
  );
}
