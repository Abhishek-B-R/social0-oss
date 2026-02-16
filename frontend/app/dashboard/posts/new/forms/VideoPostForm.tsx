"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { PostFormOptions } from "../PostFormOptions";
import { MdOutlineVideoLibrary, MdClose } from "react-icons/md";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

export function VideoPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file (MP4, WebM, etc.).");
      return;
    }
    setError(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null);
    setVideoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const mediaIds: string[] = [];
    if (videoFile) {
      try {
        const fd = new FormData();
        fd.set("file", videoFile);
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
      content.trim() || (videoFile ? `[Video: ${videoFile.name}]` : "");
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
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 py-10 text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/30 hover:text-emerald-700 transition-colors"
          >
            <MdOutlineVideoLibrary className="mb-2 h-10 w-10" />
            <span className="text-sm font-medium">Click to add video</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex h-12 w-16 shrink-0 overflow-hidden rounded border border-gray-200">
              <video
                src={videoPreview}
                muted
                playsInline
                className="h-full w-full object-cover"
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
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
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
          (!content.trim() && !videoFile)
        }
      />
    </form>
  );
}
