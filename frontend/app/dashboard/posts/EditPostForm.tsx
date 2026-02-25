"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Upload } from "lucide-react";
import { updatePost } from "@/app/actions/posts";
import { PLATFORMS } from "@/lib/platforms";
import { AccountAvatar } from "@/components/AccountAvatar";
import { ScheduleDateTimePicker } from "@/components/ui/ScheduleDateTimePicker";
import type { PostForEdit, PostMediaRow } from "./posts-list-data";

const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";
const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-msvideo";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  tokenExpired?: boolean;
};

type NewFileItem = { file: File; previewUrl: string };

export function EditPostForm({
  post,
  accounts,
  existingMedia = [],
}: {
  post: PostForEdit;
  accounts: Account[];
  existingMedia?: PostMediaRow[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState(post.originalContent ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(post.connectedAccountIds),
  );
  const [scheduledAt, setScheduledAt] = useState<Date | null>(
    post.scheduledAt ? new Date(post.scheduledAt) : null,
  );
  const [idsToRemove, setIdsToRemove] = useState<Set<string>>(new Set());
  const [newFiles, setNewFiles] = useState<NewFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(post.originalContent ?? "");
    setSelectedIds(new Set(post.connectedAccountIds));
    setScheduledAt(post.scheduledAt ? new Date(post.scheduledAt) : null);
  }, [post.id, post.originalContent, post.connectedAccountIds, post.scheduledAt]);

  const platformName = (platformId: string) =>
    PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;

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

  const removeExisting = (id: string) => {
    setIdsToRemove((prev) => new Set(prev).add(id));
  };

  const isImage = (mime: string) => mime.startsWith("image/");
  const isVideo = (mime: string) => mime.startsWith("video/");
  const validateFile = (file: File): string | null => {
    const img = file.type.startsWith("image/");
    const vid = file.type.startsWith("video/");
    if (!img && !vid) return "Unsupported file type.";
    const max = img ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
    if (file.size > max) return `File too large (max ${img ? "50MB" : "500MB"}).`;
    return null;
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.isArray(files) ? files : Array.from(files);
    const toAdd: NewFileItem[] = [];
    for (const file of list) {
      const err = validateFile(file);
      if (err) {
        setError(err);
        continue;
      }
      const previewUrl = file.type.startsWith("video/")
        ? URL.createObjectURL(file)
        : URL.createObjectURL(file);
      toAdd.push({ file, previewUrl });
    }
    if (toAdd.length) setError(null);
    setNewFiles((prev) => [...prev, ...toAdd]);
  }, []);

  const removeNewFile = (previewUrl: string) => {
    setNewFiles((prev) => {
      const item = prev.find((p) => p.previewUrl === previewUrl);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.previewUrl !== previewUrl);
    });
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) addFiles(files);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const newMediaIds: string[] = [];
      for (const { file } of newFiles) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/media/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Upload failed");
        }
        const data = (await res.json()) as { id: string };
        newMediaIds.push(data.id);
      }
      const keptExistingIds = (post.mediaIds ?? []).filter((id) => !idsToRemove.has(id));
      const finalMediaIds = [...keptExistingIds, ...newMediaIds];
      const result = await updatePost(
        post.id,
        content.trim(),
        Array.from(selectedIds),
        scheduledAt,
        finalMediaIds,
      );
      if (result.success) {
        router.push("/dashboard/posts");
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <label
          htmlFor="content"
          className="block text-sm font-semibold text-gray-900 mb-2"
        >
          Content
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your post..."
          rows={6}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          required
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-900">
            Attachments
          </label>
          <p className="text-sm text-gray-500 mt-0.5">
            Remove or add images/videos.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={`${IMAGE_ACCEPT},${VIDEO_ACCEPT}`}
          multiple
          onChange={onFileInputChange}
          className="hidden"
        />
        {existingMedia.length === 0 && newFiles.length === 0 ? (
          <p className="text-sm text-gray-500 mb-2">
            No attachments yet — add files below.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3 mb-4">
            {(post.mediaIds ?? [])
              .map((id) => existingMedia.find((m) => m.id === id))
              .filter((m): m is PostMediaRow => !!m && !idsToRemove.has(m.id))
              .map((m) => (
                <div
                  key={m.id}
                  className="relative flex flex-col rounded-lg border border-gray-200 overflow-hidden bg-gray-50 w-24 shrink-0"
                >
                  <div className="h-20 w-24 bg-gray-200 flex items-center justify-center overflow-hidden">
                    {isVideo(m.mimeType) ? (
                      m.thumbnailUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={m.thumbnailUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <video
                          src={m.url ?? undefined}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      )
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={m.url ?? ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <p className="text-xs text-gray-600 truncate px-1 py-1" title={m.originalFilename}>
                    {m.originalFilename}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeExisting(m.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-red-600 p-0.5 text-white hover:bg-red-700"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            {newFiles.map((item) => (
              <div
                key={item.previewUrl}
                className="relative flex flex-col rounded-lg border border-gray-200 overflow-hidden bg-gray-50 w-24 shrink-0"
              >
                <div className="h-20 w-24 bg-gray-200 flex items-center justify-center overflow-hidden">
                  {item.file.type.startsWith("video/") ? (
                    <video
                      src={item.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <p className="text-xs text-gray-600 truncate px-1 py-1" title={item.file.name}>
                  {item.file.name}
                </p>
                <button
                  type="button"
                  onClick={() => removeNewFile(item.previewUrl)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-red-600 p-0.5 text-white hover:bg-red-700"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 py-8 text-gray-500 hover:border-emerald-400 hover:bg-emerald-50/30 hover:text-emerald-700 transition-colors"
        >
          <Upload className="mb-2 h-8 w-8" />
          <span className="text-sm font-medium">Add more files</span>
          <span className="text-xs text-gray-400 mt-1">
            Images up to 50MB, videos up to 500MB
          </span>
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-gray-900">
            Post to
          </label>
          <button
            type="button"
            onClick={selectAll}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            {selectedIds.size === accounts.length
              ? "Deselect all"
              : "Select all"}
          </button>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-4 border border-amber-100">
            Connect at least one account from the dashboard to post.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((acc) => (
              <label
                key={acc.id}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 hover:border-gray-300 has-checked:border-emerald-500 has-checked:bg-emerald-50/50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(acc.id)}
                  onChange={() => toggleAccount(acc.id)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 size-4"
                />
                <AccountAvatar
                  profileImageUrl={acc.profileImageUrl}
                  username={acc.platformUsername}
                  platform={acc.platform}
                  size="sm"
                />
                <span className="text-sm font-medium text-gray-900">
                  {platformName(acc.platform)}
                  {acc.platformUsername && (
                    <span className="text-gray-500 font-normal">
                      {" "}
                      @{acc.platformUsername}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="block text-sm font-semibold text-gray-900 mb-4">
          When to publish
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Leave empty to keep as draft. Set a date and time to schedule.
        </p>
        {scheduledAt === null ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500">Not scheduled (draft)</span>
            <button
              type="button"
              onClick={() =>
                setScheduledAt(() => {
                  const d = new Date();
                  d.setMinutes(d.getMinutes() + 30);
                  return d;
                })
              }
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              Schedule for later
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <ScheduleDateTimePicker
              value={scheduledAt}
              onChange={setScheduledAt}
              placeholder="Pick date & time"
            />
            <button
              type="button"
              onClick={() => setScheduledAt(null)}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Clear date (save as draft)
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-100">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={
            loading || accounts.length === 0 || !content.trim() || selectedIds.size === 0
          }
          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 shadow-lg transition-colors"
        >
          {loading ? "Saving..." : "Save changes"}
        </button>
        <Link
          href="/dashboard/posts"
          className="rounded-xl border border-gray-200 bg-white px-6 py-3 font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors inline-flex items-center justify-center"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
