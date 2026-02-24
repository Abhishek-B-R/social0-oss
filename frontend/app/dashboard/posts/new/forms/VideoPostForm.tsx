"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { publishPost } from "@/app/actions/publish";
import {
  createResurfaceSchedule,
  createAutoPlug,
} from "@/app/actions/resurface";
import { PostFormOptions } from "../PostFormOptions";
import { SchedulePostSidebar } from "../SchedulePostSidebar";
import { AutoFeaturesCard } from "@/components/repost/AutoFeaturesCard";
import { TikTokSettingsCard } from "@/components/TikTokSettingsCard";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import { MdOutlineVideoLibrary, MdClose, MdImage } from "react-icons/md";
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

const defaultTiktokSettings: TikTokPostSettings = {
  privacy_level: "PUBLIC_TO_EVERYONE", // Default to Public
  disable_comment: false,
  disable_duet: false,
  disable_stitch: false,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const [content, setContent] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [customThumbnail, setCustomThumbnail] = useState<File | null>(null);
  const [customThumbnailPreview, setCustomThumbnailPreview] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type OverlayPhase = "idle" | "uploading" | "publishing" | "done";
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
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

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file (MP4, WebM, etc.).");
      return;
    }
    setError(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    setVideoDuration(0);
    setCustomThumbnail(null);
    setCustomThumbnailPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
    setVideoFile(null);
    setVideoPreview(null);
    setVideoDuration(0);
    setCustomThumbnail(null);
    setCustomThumbnailPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
    setCustomThumbnail(file);
    setCustomThumbnailPreview(URL.createObjectURL(file));
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  const clearCoverImage = () => {
    if (customThumbnailPreview) URL.revokeObjectURL(customThumbnailPreview);
    setCustomThumbnail(null);
    setCustomThumbnailPreview(null);
  };

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const hasTikTok = selectedAccounts.some((a) => a.platform === "tiktok");
  const tiktokAccounts = selectedAccounts.filter(
    (a) => a.platform === "tiktok",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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

        // Validate brand content: if toggle is on, at least one option must be selected
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

        // Validate branded content cannot be private (per TikTok guidelines)
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

    const mediaIds: string[] = [];
    if (videoFile) {
      try {
        const fd = new FormData();
        fd.set("file", videoFile);
        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (data.id) mediaIds.push(data.id);
      } catch {
        setError("Failed to upload video.");
        setLoading(false);
        setOverlayPhase("idle");
        return;
      }
    }
    setOverlayPhase("publishing");

    const text =
      content.trim() || (videoFile ? `[Video: ${videoFile.name}]` : "");

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

    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;
    const result = await createPost(
      text,
      Array.from(selectedIds),
      effectiveMode,
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
    if (effectiveMode === "now" && result.postId) {
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

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const q = accountSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.platformUsername?.toLowerCase().includes(q) ||
        a.platform?.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);

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
          uploadProgress={videoFile ? "1 of 1" : null}
          mediaType="video"
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
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6 lg:flex-row lg:items-start">
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
              error={error}
              loading={loading}
              onCancel={() => router.push("/dashboard/posts")}
              submitLabel={submitLabel}
              submitDisabled={
                accounts.length === 0 ||
                (mode === "scheduled" && !scheduledAt) ||
                (!content.trim() && !videoFile)
              }
              hideScheduleAndActions
              searchSlot={
                <input
                  type="search"
                  placeholder="Search accounts..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="h-8 w-full text-xs rounded border border-gray-200 px-2 py-1 text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
              }
            />

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
                    onLoadedMetadata={(e) =>
                      setVideoDuration(e.currentTarget.duration)
                    }
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

          <AutoFeaturesCard
            selectedAccountIds={Array.from(selectedIds)}
            allAccounts={accounts}
            onResurfaceChange={setResurfaceConfig}
            onAutoPlugChange={setAutoPlugConfig}
          />

          <TikTokSettingsCard
            selectedAccountIds={Array.from(selectedIds)}
            allAccounts={accounts}
            configuredIds={
              hasTikTok
                ? new Set(
                    tiktokAccounts
                      .filter((a) => tiktokSettings[a.id]?.privacy_level)
                      .map((a) => a.id),
                  )
                : undefined
            }
            onOpenSettings={setTiktokModalAccountId}
          />
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
            (!content.trim() && !videoFile)
          }
          hasAccountSelected={selectedIds.size > 0}
          error={error}
          onCancel={() => router.push("/dashboard/posts")}
          intendedModeRef={intendedModeRef}
          formRef={formRef}
        >
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Media preview
            </h3>
            {!videoPreview ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-400">
                <MdOutlineVideoLibrary className="mb-2 h-12 w-12" />
                <span className="text-xs">Upload media to see preview</span>
              </div>
            ) : (
              <>
                <div className="w-full overflow-hidden rounded-lg bg-gray-100">
                  <video
                    src={videoPreview}
                    controls
                    playsInline
                    className="w-full max-h-[300px] object-contain"
                    style={{ maxHeight: 300 }}
                    onLoadedMetadata={(e) =>
                      setVideoDuration(e.currentTarget.duration)
                    }
                  />
                </div>
                <p className="mt-2 truncate text-center text-xs text-gray-500">
                  {videoFile?.name}
                </p>
                {videoDuration > 0 && (
                  <p className="text-center text-xs text-gray-500">
                    Duration: {formatDuration(videoDuration)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onCoverImageChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <MdImage className="h-4 w-4" />
                    Set Cover Image
                  </button>
                  {customThumbnailPreview && (
                    <button
                      type="button"
                      onClick={clearCoverImage}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                      Remove cover
                    </button>
                  )}
                </div>
                {customThumbnailPreview && (
                  <div className="mt-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customThumbnailPreview}
                      alt="Cover"
                      className="h-12 w-12 rounded border border-gray-200 object-cover"
                    />
                    <span className="text-xs font-medium text-emerald-600">
                      Cover image set ✓
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </SchedulePostSidebar>

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
            mediaType="video"
          />
        )}
      </form>
    </>
  );
}
