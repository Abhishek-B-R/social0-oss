"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { PostFormOptions } from "../PostFormOptions";
import { MdOutlineAddPhotoAlternate, MdClose } from "react-icons/md";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

type ImageFile = { file: File; preview: string; order: number };

export function ImagePostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageFile[]>([]);
  const imagesRef = useRef<ImageFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((i) => URL.revokeObjectURL(i.preview));
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

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const newImages: ImageFile[] = [];
    const maxOrder = images.length > 0 ? Math.max(...images.map((i) => i.order)) : 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) {
        setError("Please select only image files (JPEG, PNG, GIF, WebP).");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const sortedImages = [...images].sort((a, b) => a.order - b.order);
    const mediaIds: string[] = [];
    for (const img of sortedImages) {
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

    const text =
      content.trim() ||
      (images.length ? `[${images.length} image(s)]` : "");
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
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 py-10 text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/30 hover:text-emerald-700 transition-colors"
          >
            <MdOutlineAddPhotoAlternate className="mb-2 h-10 w-10" />
            <span className="text-sm font-medium">Click to add image(s)</span>
            <span className="text-xs text-gray-400 mt-1">
              Select multiple to add all at once
            </span>
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Carousel post: Drag to reorder (mainly for Instagram)
            </p>
            <div className="flex flex-wrap gap-2">
              {[...images].sort((a, b) => a.order - b.order).map((img, index) => (
                <div
                  key={img.preview}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className="relative h-20 w-20 shrink-0 cursor-move overflow-hidden rounded-lg border border-gray-200 hover:border-emerald-400 transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob URL preview */}
                  <img
                    src={img.preview}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  <div className="absolute left-0 right-0 top-0 bg-black/60 px-1.5 py-0.5 text-center">
                    <span className="text-xs font-bold text-white">{img.order}</span>
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
                className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/50 text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/30 hover:text-emerald-600"
              >
                <MdOutlineAddPhotoAlternate className="h-6 w-6" />
                <span className="text-xs mt-0.5">Add more</span>
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
          (!content.trim() && images.length === 0)
        }
      />
    </form>
  );
}
