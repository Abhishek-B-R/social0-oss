import { useNavigate } from "react-router-dom";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  ImagePlus,
  FileText,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import Link from "@/components/AppLink";
import {
  setComposerPayload,
  type ComposerMediaItem,
} from "@/lib/composer-bridge";
import {
  measureVideoAspectRatio,
  getAspectRatioGuidance,
  NON_STANDARD_VIDEO_ASPECT_GUIDANCE,
  type AspectRatioGuidance,
} from "@/lib/video-aspect-ratio";
import {
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_DURATION_MESSAGE,
} from "@/lib/video-duration";
import { DOCS_COMPOSER_URL } from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";
import { AspectRatioGuidanceBanner } from "@/components/AspectRatioGuidanceBanner";
import { toast } from "sonner";
import {
  CLIENT_MAX_VIDEO_UPLOAD_BYTES,
  CLIENT_MAX_VIDEO_UPLOAD_LABEL,
} from "@/lib/media-limits";

const THREAD_MAX_MEDIA_PER_POST = 4;

/** Play icon: dark circle + white triangle, bottom-right (matches typical video thumb UI). */
function VideoPlayBadge({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute flex items-center justify-center rounded-full bg-black/60 text-white shadow-sm ${
        compact ? "bottom-0.5 right-0.5 h-6 w-6" : "bottom-1 right-1 h-7 w-7"
      }`}
      role="img"
      aria-label="Video"
    >
      <svg
        viewBox="0 0 24 24"
        className={`fill-current ${
          compact ? "h-3 w-3 translate-x-[1.5px]" : "h-4 w-4 translate-x-[1px]"
        }`}
        aria-hidden
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}

function hasFileDrag(e: React.DragEvent): boolean {
  return [...e.dataTransfer.types].includes("Files");
}

type ThreadSlot = {
  id: string;
  text: string;
  media: (ComposerMediaItem & { id: string })[];
};

/**
 * Quick composer / bridge into create flows. No account picker here yet.
 * If Remember is added, use `REMEMBERED_ACCOUNT_KEYS.composer` → `remembered-accounts-composer`.
 * @see REMEMBERED_ACCOUNT_KEYS in `@/lib/remembered-accounts`
 */
export function Composer() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [media, setMedia] = useState<(ComposerMediaItem & { id: string })[]>(
    [],
  );
  const [isThread, setIsThread] = useState(false);
  const [threadSlots, setThreadSlots] = useState<ThreadSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [threadDragged, setThreadDragged] = useState<{
    slotId: string;
    index: number;
  } | null>(null);
  const [scrollArrows, setScrollArrows] = useState({
    left: false,
    right: false,
  });
  const [aspectGuidanceByMediaId, setAspectGuidanceByMediaId] = useState<
    Record<string, AspectRatioGuidance>
  >({});
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const mediaStripRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadTextareaRefs = useRef<Record<string, HTMLTextAreaElement>>({});

  const MAX_TEXTAREA_HEIGHT_PX = 750;
  const MAX_THREAD_TEXTAREA_HEIGHT_PX = 250;

  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX) + "px";
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    autoResizeTextarea();
  }, [text, autoResizeTextarea]);

  const resizeThreadSlotTextarea = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height =
        Math.min(el.scrollHeight, MAX_THREAD_TEXTAREA_HEIGHT_PX) + "px";
    },
    [],
  );

  useEffect(() => {
    threadSlots.forEach((slot) => {
      const el = threadTextareaRefs.current[slot.id];
      if (el) resizeThreadSlotTextarea(el);
    });
  }, [threadSlots, resizeThreadSlotTextarea]);

  const updateScrollArrows = useCallback(() => {
    const el = mediaStripRef.current;
    if (!el) {
      setScrollArrows({ left: false, right: false });
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setScrollArrows({
      left: scrollLeft > 2,
      right: scrollLeft < scrollWidth - clientWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = mediaStripRef.current;
    if (!el) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateScrollArrows();
    const ro = new ResizeObserver(updateScrollArrows);
    ro.observe(el);
    el.addEventListener("scroll", updateScrollArrows);
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateScrollArrows);
    };
  }, [media.length, updateScrollArrows]);

  const scrollMediaStrip = (dir: "left" | "right") => {
    const el = mediaStripRef.current;
    if (!el) return;
    const step = 100;
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
  };

  const handleMediaDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleMediaDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setMedia((prev) => {
      const next = [...prev];
      const [item] = next.splice(draggedIndex, 1);
      next.splice(index, 0, item);
      return next;
    });
    setDraggedIndex(index);
  };

  const handleMediaDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleThreadSlotMediaDragStart = (slotId: string, index: number) => {
    setThreadDragged({ slotId, index });
  };

  const handleThreadSlotMediaDragOver = (
    slotId: string,
    index: number,
    e: React.DragEvent,
  ) => {
    e.preventDefault();
    if (
      !threadDragged ||
      threadDragged.slotId !== slotId ||
      threadDragged.index === index
    )
      return;
    setThreadSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const next = [...s.media];
        const [item] = next.splice(threadDragged.index, 1);
        next.splice(index, 0, item);
        return { ...s, media: next };
      }),
    );
    setThreadDragged((p) => (p ? { ...p, index } : null));
  };

  const handleThreadSlotMediaDragEnd = () => {
    setThreadDragged(null);
  };

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const fileList = Array.from(files);

      const imageFiles: File[] = [];
      const videoFiles: File[] = [];
      fileList.forEach((file) => {
        const mime = file.type;
        if (mime.startsWith("image/")) imageFiles.push(file);
        else if (mime.startsWith("video/")) videoFiles.push(file);
      });

      const imageItems: (ComposerMediaItem & { id: string })[] = imageFiles.map(
        (file) => ({
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
          type: "image" as const,
          file,
          previewUrl: URL.createObjectURL(file),
        }),
      );

      if (imageItems.length > 0) {
        setMedia((prev) => {
          const maxNew = isThread
            ? THREAD_MAX_MEDIA_PER_POST - prev.length
            : imageItems.length;
          if (maxNew <= 0) return prev;
          const toAdd = imageItems.slice(0, maxNew);
          return [...prev, ...toAdd];
        });
      }

      const overSizeVideos = videoFiles.filter(
        (f) => f.size > CLIENT_MAX_VIDEO_UPLOAD_BYTES,
      );
      if (overSizeVideos.length > 0) {
        toast.error(
          `Video too large. Max upload size is ${CLIENT_MAX_VIDEO_UPLOAD_LABEL}. ${overSizeVideos.length} file(s) skipped.`,
        );
      }
      const allowedVideos = videoFiles.filter(
        (f) => f.size <= CLIENT_MAX_VIDEO_UPLOAD_BYTES,
      );
      if (allowedVideos.length === 0) return;

      Promise.all(
        allowedVideos.map(async (file) => {
          const [m, duration] = await Promise.all([
            measureVideoAspectRatio(file),
            getVideoDuration(file),
          ]);
          return { file, m, duration };
        }),
      ).then((rows) => {
        const validItems: (ComposerMediaItem & { id: string })[] = [];
        const videoGuidanceById: Record<string, AspectRatioGuidance> = {};
        let anyOverDuration = false;
        for (const row of rows) {
          if (row.duration > MAX_VIDEO_DURATION_SECONDS) {
            anyOverDuration = true;
            continue;
          }
          const id = `${Date.now()}-${row.file.name}-${Math.random().toString(36).slice(2)}`;
          const g = getAspectRatioGuidance(row.m.ratio);
          if (g) videoGuidanceById[id] = g;
          validItems.push({
            id,
            type: "video",
            file: row.file,
            previewUrl: URL.createObjectURL(row.file),
          });
        }
        if (anyOverDuration) toast.error(VIDEO_DURATION_MESSAGE);
        if (validItems.length === 0) return;
        setMedia((prev) => {
          const maxNew = isThread
            ? THREAD_MAX_MEDIA_PER_POST - prev.length
            : validItems.length;
          if (maxNew <= 0) return prev;
          const n = Math.min(maxNew, validItems.length);
          const toAdd = validItems.slice(0, n);
          setAspectGuidanceByMediaId((gprev) => {
            const next = { ...gprev };
            for (const item of toAdd) {
              const g = videoGuidanceById[item.id];
              if (g) next[item.id] = g;
            }
            return next;
          });
          return [...prev, ...toAdd];
        });
      });
    },
    [isThread],
  );

  const handleComposerDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsFileDragOver(true);
  }, []);

  const handleComposerDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      setIsFileDragOver(false);
    },
    [],
  );

  const handleComposerDrop = useCallback(
    (e: React.DragEvent) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const onPaste: React.ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
    const clipboardItems = event.clipboardData?.items;
    if (!clipboardItems) return;

    const files: File[] = [];
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length) {
      const fileList = {
        ...files,
        length: files.length,
        item: (index: number) => files[index] ?? null,
      } as unknown as FileList;
      handleFiles(fileList);
    }
  };

  const addThreadSlot = useCallback(() => {
    setThreadSlots((prev) => [
      ...prev,
      {
        id: `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: "",
        media: [],
      },
    ]);
  }, []);

  const removeThreadSlot = useCallback((slotId: string) => {
    setThreadSlots((prev) => {
      const slot = prev.find((s) => s.id === slotId);
      if (slot) {
        slot.media.forEach((m) => {
          if (m.previewUrl.startsWith("blob:"))
            URL.revokeObjectURL(m.previewUrl);
        });
        const mediaIds = slot.media.map((m) => m.id);
        if (mediaIds.length > 0) {
          setAspectGuidanceByMediaId((gprev) => {
            const next = { ...gprev };
            mediaIds.forEach((id) => {
              delete next[id];
            });
            return next;
          });
        }
      }
      return prev.filter((s) => s.id !== slotId);
    });
  }, []);

  const updateThreadSlot = useCallback(
    (slotId: string, update: Partial<Pick<ThreadSlot, "text" | "media">>) => {
      setThreadSlots((prev) =>
        prev.map((s) => (s.id === slotId ? { ...s, ...update } : s)),
      );
    },
    [],
  );

  const handleThreadSlotFiles = useCallback(
    (slotId: string, files: FileList | null) => {
      if (!files || files.length === 0) return;
      const fileList = Array.from(files);

      const imageFiles: File[] = [];
      const videoFiles: File[] = [];
      fileList.forEach((file) => {
        const mime = file.type;
        if (mime.startsWith("image/")) imageFiles.push(file);
        else if (mime.startsWith("video/")) videoFiles.push(file);
      });

      const imageItems: (ComposerMediaItem & { id: string })[] = imageFiles.map(
        (file) => ({
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
          type: "image" as const,
          file,
          previewUrl: URL.createObjectURL(file),
        }),
      );

      if (imageItems.length > 0) {
        setThreadSlots((prev) =>
          prev.map((s) => {
            if (s.id !== slotId) return s;
            const maxNew = THREAD_MAX_MEDIA_PER_POST - s.media.length;
            if (maxNew <= 0) return s;
            const toAdd = imageItems.slice(
              0,
              Math.min(maxNew, imageItems.length),
            );
            return { ...s, media: [...s.media, ...toAdd] };
          }),
        );
      }

      const overSizeVideos = videoFiles.filter(
        (f) => f.size > CLIENT_MAX_VIDEO_UPLOAD_BYTES,
      );
      if (overSizeVideos.length > 0) {
        toast.error(
          `Video too large. Max upload size is ${CLIENT_MAX_VIDEO_UPLOAD_LABEL}. ${overSizeVideos.length} file(s) skipped.`,
        );
      }
      const allowedVideos = videoFiles.filter(
        (f) => f.size <= CLIENT_MAX_VIDEO_UPLOAD_BYTES,
      );
      if (allowedVideos.length === 0) return;

      Promise.all(
        allowedVideos.map(async (file) => {
          const [m, duration] = await Promise.all([
            measureVideoAspectRatio(file),
            getVideoDuration(file),
          ]);
          return { file, m, duration };
        }),
      ).then((rows) => {
        const validItems: (ComposerMediaItem & { id: string })[] = [];
        const videoGuidanceById: Record<string, AspectRatioGuidance> = {};
        let anyOverDuration = false;
        for (const row of rows) {
          if (row.duration > MAX_VIDEO_DURATION_SECONDS) {
            anyOverDuration = true;
            continue;
          }
          const id = `${Date.now()}-${row.file.name}-${Math.random().toString(36).slice(2)}`;
          const g = getAspectRatioGuidance(row.m.ratio);
          if (g) videoGuidanceById[id] = g;
          validItems.push({
            id,
            type: "video",
            file: row.file,
            previewUrl: URL.createObjectURL(row.file),
          });
        }
        if (anyOverDuration) toast.error(VIDEO_DURATION_MESSAGE);
        if (validItems.length === 0) return;
        setThreadSlots((prev) =>
          prev.map((s) => {
            if (s.id !== slotId) return s;
            const maxNew = THREAD_MAX_MEDIA_PER_POST - s.media.length;
            if (maxNew <= 0) return s;
            const n = Math.min(maxNew, validItems.length);
            const toAdd = validItems.slice(0, n);
            setAspectGuidanceByMediaId((gprev) => {
              const next = { ...gprev };
              for (const item of toAdd) {
                const g = videoGuidanceById[item.id];
                if (g) next[item.id] = g;
              }
              return next;
            });
            return { ...s, media: [...s.media, ...toAdd] };
          }),
        );
      });
    },
    [],
  );

  const handleThreadSlotFileDrop = useCallback(
    (slotId: string, e: React.DragEvent) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      handleThreadSlotFiles(slotId, e.dataTransfer.files);
    },
    [handleThreadSlotFiles],
  );

  const removeThreadSlotMedia = useCallback(
    (slotId: string, mediaId: string) => {
      setThreadSlots((prev) =>
        prev.map((s) => {
          if (s.id !== slotId) return s;
          const removed = s.media.find((m) => m.id === mediaId);
          if (removed?.previewUrl.startsWith("blob:"))
            URL.revokeObjectURL(removed.previewUrl);
          return {
            ...s,
            media: s.media.filter((m) => m.id !== mediaId),
          };
        }),
      );
      setAspectGuidanceByMediaId((prev) => {
        const next = { ...prev };
        delete next[mediaId];
        return next;
      });
    },
    [],
  );

  const handleSubmit = async () => {
    const hasMain = text.trim() || media.length > 0;
    const hasThreadContent =
      threadSlots.length > 0 &&
      threadSlots.some((s) => s.text.trim() || s.media.length > 0);
    if (!hasMain && !hasThreadContent) {
      return;
    }

    setLoading(true);
    try {
      const imageCount = media.filter((m) => m.type === "image").length;
      const videoCount = media.filter((m) => m.type === "video").length;

      let targetSlug: "text" | "image" | "video" | "collection" | "threads" =
        "text";

      if (isThread) {
        targetSlug = "threads";
      } else if (videoCount === 0 && imageCount > 0) {
        targetSlug = "image";
      } else if (videoCount === 1 && imageCount === 0) {
        targetSlug = "video";
      } else if (videoCount > 1 || (videoCount >= 1 && imageCount >= 1)) {
        targetSlug = "collection";
      } else {
        targetSlug = "text";
      }

      setComposerPayload({
        text: text.trim(),
        isThread,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        media: media.map(({ id, ...rest }) => rest),
        threadPosts:
          isThread && threadSlots.length > 0
            ? threadSlots.map((s) => ({
                text: s.text.trim(),
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                media: s.media.map(({ id: _id, ...rest }) => rest),
              }))
            : undefined,
      });

      const search = new URLSearchParams();
      search.set("fromComposer", "1");

      navigate(`/dashboard/create/${targetSlug}?${search.toString()}`);
      // Leave loading true so spinner stays until navigation completes
    } catch {
      setLoading(false);
    }
  };

  const removeMedia = (id: string) => {
    setMedia((prev) => {
      const removed = prev.find((m) => m.id === id);
      if (removed?.previewUrl.startsWith("blob:"))
        URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((m) => m.id !== id);
    });
    setAspectGuidanceByMediaId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-1 py-6 sm:mt-10 sm:space-y-6 sm:px-0 sm:py-0">
      <div className="space-y-1.5 sm:space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold font-serif tracking-tight text-foreground sm:text-3xl sm:mb-2 landing">
            Composer
          </h1>
          <DocsInfoIcon url={DOCS_COMPOSER_URL} />
        </div>
        <p className="text-sm leading-snug text-text-muted sm:leading-normal">
          Type anything, paste, drag and drop, or upload images/videos -
          we&apos;ll route you to the right post flow. You can always adjust
          details on the next screen.
        </p>
      </div>

      <div
        className={`rounded-2xl border-2 bg-bg-elevated p-4 shadow-sm transition-all duration-200 hover:border-muted-foreground/30 focus-within:border-accent/30 dark:focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/20 sm:rounded-2xl sm:p-5 sm:focus-within:ring-1 sm:focus-within:ring-accent/30 ${
          isFileDragOver
            ? "border-accent ring-2 ring-accent/30"
            : "border-border"
        }`}
        onDragEnter={(e) => {
          if (!hasFileDrag(e)) return;
          e.preventDefault();
          setIsFileDragOver(true);
        }}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
      >
        <textarea
          ref={textareaRef}
          className="min-h-[88px] max-h-[400px] w-full resize-none overflow-y-auto border-none bg-transparent p-3 text-base text-text outline-none placeholder:text-text-muted sm:min-h-[70px]"
          placeholder="Share what's on your mind..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onDragOver={(e) => {
            if (!hasFileDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          autoFocus
        />

        {media.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-text-muted">
              Drag to reorder · Click remove on hover
            </p>
            <div className="flex items-center gap-1">
              {scrollArrows.left && (
                <button
                  type="button"
                  onClick={() => scrollMediaStrip("left")}
                  className="flex h-24 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-muted hover:bg-bg-hover hover:text-text transition-colors"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div
                ref={mediaStripRef}
                className="flex flex-1 min-w-0 gap-3 overflow-x-auto overflow-y-hidden py-1 scroll-smooth scrollbar-thin"
                style={{ scrollbarWidth: "thin" }}
              >
                {media.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleMediaDragStart(index)}
                    onDragOver={(e) => handleMediaDragOver(e, index)}
                    onDragEnd={handleMediaDragEnd}
                    className="group relative flex h-24 w-24 shrink-0 cursor-move items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-muted hover:border-accent transition-colors"
                  >
                    {item.type === "image" ? (
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="h-full w-full object-cover pointer-events-none"
                        draggable={false}
                      />
                    ) : (
                      <>
                        <video
                          src={item.previewUrl}
                          className="h-full w-full object-cover pointer-events-none"
                          muted
                          playsInline
                          preload="metadata"
                          draggable={false}
                        />
                        <VideoPlayBadge />
                      </>
                    )}
                    <div className="absolute left-0 right-0 top-0 bg-black/60 px-1.5 py-0.5 text-center pointer-events-none">
                      <span className="text-xs font-bold text-white">
                        {index + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMedia(item.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {scrollArrows.right && (
                <button
                  type="button"
                  onClick={() => scrollMediaStrip("right")}
                  className="flex h-24 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-muted hover:bg-bg-hover hover:text-text transition-colors"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
            {media.some(
              (m) => m.type === "video" && aspectGuidanceByMediaId[m.id],
            ) && (
              <div className="pt-1">
                <AspectRatioGuidanceBanner
                  guidance={NON_STANDARD_VIDEO_ASPECT_GUIDANCE}
                />
              </div>
            )}
          </div>
        )}

        {isThread && (
          <p className="text-xs text-text-muted rounded-lg border border-border/60 bg-bg-muted/50 px-3 py-2">
            Threads can contain at most 4 attachments per post.
          </p>
        )}
        <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors touch-manipulation sm:py-1.5 ${
                isThread && media.length >= THREAD_MAX_MEDIA_PER_POST
                  ? "cursor-not-allowed border-border bg-bg-muted opacity-70"
                  : "border-border bg-bg-muted text-text-muted hover:bg-bg-hover hover:text-text"
              }`}
            >
              <ImagePlus className="h-4 w-4 shrink-0" />
              <span>Images / Videos{isThread ? " (max 4)" : ""}</span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
                disabled={isThread && media.length >= THREAD_MAX_MEDIA_PER_POST}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const next = !isThread;
                setIsThread(next);
                if (next) {
                  if (threadSlots.length === 0) addThreadSlot();
                  setMedia((prev) => {
                    if (prev.length <= THREAD_MAX_MEDIA_PER_POST) return prev;
                    prev.slice(THREAD_MAX_MEDIA_PER_POST).forEach((m) => {
                      if (m.previewUrl.startsWith("blob:"))
                        URL.revokeObjectURL(m.previewUrl);
                    });
                    return prev.slice(0, THREAD_MAX_MEDIA_PER_POST);
                  });
                  setThreadSlots((prev) =>
                    prev.map((s) => {
                      if (s.media.length <= THREAD_MAX_MEDIA_PER_POST) return s;
                      s.media.slice(THREAD_MAX_MEDIA_PER_POST).forEach((m) => {
                        if (m.previewUrl.startsWith("blob:"))
                          URL.revokeObjectURL(m.previewUrl);
                      });
                      return {
                        ...s,
                        media: s.media.slice(0, THREAD_MAX_MEDIA_PER_POST),
                      };
                    }),
                  );
                } else {
                  setThreadSlots([]);
                }
              }}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors touch-manipulation sm:py-1.5 ${
                isThread
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-bg-muted text-text-muted hover:bg-bg-hover hover:text-text"
              }`}
            >
              <Plus className="h-3 w-3 shrink-0" />
              <span>Add another post as thread</span>
            </button>
          </div>

          {text.length > 0 && (
            <p
              className="text-right text-xs text-text-muted sm:order-0"
              aria-live="polite"
            >
              {text.length} character{text.length !== 1 ? "s" : ""}
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              loading ||
              (!text.trim() &&
                media.length === 0 &&
                !threadSlots.some((s) => s.text.trim() || s.media.length > 0))
            }
            className="order-first inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70 touch-manipulation sm:order-0 sm:w-auto sm:py-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            <span>{loading ? "Loading…" : "Continue"}</span>
          </button>
        </div>
      </div>

      {isThread && (
        <div className="space-y-4">
          {threadSlots.map((slot, index) => (
            <div
              key={slot.id}
              className="rounded-2xl border border-border bg-bg-elevated p-4 sm:p-5 shadow-sm space-y-4"
              onDragOver={(e) => {
                if (!hasFileDrag(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => handleThreadSlotFileDrop(slot.id, e)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-muted">
                  Post {index + 2}
                </span>
                <button
                  type="button"
                  onClick={() => removeThreadSlot(slot.id)}
                  className="rounded-full p-1.5 text-text-muted hover:bg-bg-hover hover:text-text transition-colors"
                  aria-label="Remove post"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                ref={(el) => {
                  if (el) threadTextareaRefs.current[slot.id] = el;
                }}
                className="min-h-[120px] max-h-[250px] w-full resize-none overflow-y-auto rounded-xl border border-input bg-bg px-4 py-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="What's in this post?"
                value={slot.text}
                onChange={(e) => {
                  updateThreadSlot(slot.id, { text: e.target.value });
                  requestAnimationFrame(() =>
                    resizeThreadSlotTextarea(e.target as HTMLTextAreaElement),
                  );
                }}
                onDragOver={(e) => {
                  if (!hasFileDrag(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
              />
              {slot.media.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-text-muted">
                    Drag to reorder · max 4 per post
                  </p>
                  <div className="flex gap-2 overflow-x-auto overflow-y-hidden py-1 scroll-smooth">
                    {slot.media.map((item, idx) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() =>
                          handleThreadSlotMediaDragStart(slot.id, idx)
                        }
                        onDragOver={(e) =>
                          handleThreadSlotMediaDragOver(slot.id, idx, e)
                        }
                        onDragEnd={handleThreadSlotMediaDragEnd}
                        className="group relative flex h-20 w-20 shrink-0 cursor-move items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-muted hover:border-accent transition-colors"
                      >
                        {item.type === "image" ? (
                          <img
                            src={item.previewUrl}
                            alt=""
                            className="h-full w-full object-cover pointer-events-none"
                            draggable={false}
                          />
                        ) : (
                          <>
                            <video
                              src={item.previewUrl}
                              className="h-full w-full object-cover pointer-events-none"
                              muted
                              playsInline
                              preload="metadata"
                              draggable={false}
                            />
                            <VideoPlayBadge compact />
                          </>
                        )}
                        <div className="absolute left-0 right-0 top-0 bg-black/60 px-1 py-0.5 text-center pointer-events-none">
                          <span className="text-xs font-bold text-white">
                            {idx + 1}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            removeThreadSlotMedia(slot.id, item.id)
                          }
                          onMouseDown={(e) => e.stopPropagation()}
                          className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {slot.media.some(
                    (m) => m.type === "video" && aspectGuidanceByMediaId[m.id],
                  ) && (
                    <div className="pt-1">
                      <AspectRatioGuidanceBanner
                        guidance={NON_STANDARD_VIDEO_ASPECT_GUIDANCE}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between">
                <label
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    slot.media.length >= THREAD_MAX_MEDIA_PER_POST
                      ? "cursor-not-allowed border-border bg-bg-muted text-text-muted opacity-70"
                      : "cursor-pointer border-border bg-bg-muted text-text-muted hover:bg-bg-hover hover:text-text"
                  }`}
                >
                  <ImagePlus className="h-4 w-4" />
                  <span>Images / Videos (max 4)</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) =>
                      handleThreadSlotFiles(slot.id, e.target.files)
                    }
                    disabled={slot.media.length >= THREAD_MAX_MEDIA_PER_POST}
                  />
                </label>
                <p
                  className="text-right text-xs text-text-muted mt-1"
                  aria-live="polite"
                >
                  {slot.text.length} character
                  {slot.text.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addThreadSlot}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-bg-elevated py-4 text-sm font-medium text-text-muted hover:border-accent hover:bg-accent/5 hover:text-accent transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add another post</span>
          </button>
        </div>
      )}

      <p className="text-xs leading-relaxed text-text-muted sm:text-xs">
        Paste or drop almost anything here. We&apos;ll detect whether it&apos;s
        text, images, video, or a combination and start you in the best-fitting
        post builder.
      </p>

      <p className="flex items-center gap-2 text-sm leading-snug text-text-muted">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
          ✓
        </span>
        You can connect your accounts from
        <Link
          href="/dashboard/connections"
          className="font-medium text-accent hover:text-accent-hover hover:underline"
        >
          here
        </Link>
        .
      </p>
    </div>
  );
}
