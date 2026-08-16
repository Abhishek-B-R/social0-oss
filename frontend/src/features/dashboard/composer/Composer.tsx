import { useNavigate } from "react-router-dom";
import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
import { useDashboardPath } from "@/lib/dashboard-base-path";
import {
  measureVideoAspectRatio,
  getAspectRatioGuidance,
  captureVideoPoster,
  NON_STANDARD_VIDEO_ASPECT_GUIDANCE,
  type AspectRatioGuidance,
} from "@/lib/video-aspect-ratio";
import {
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_DURATION_MESSAGE,
} from "@/lib/video-duration";
import { cn } from "@/lib/utils";
import { AspectRatioGuidanceBanner } from "@/components/AspectRatioGuidanceBanner";
import { toast } from "sonner";
import {
  CLIENT_MAX_VIDEO_UPLOAD_BYTES,
  CLIENT_MAX_VIDEO_UPLOAD_LABEL,
} from "@/lib/media-limits";

const THREAD_MAX_MEDIA_PER_POST = 4;

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

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
          compact ? "h-3 w-3 translate-x-[1.5px]" : "h-4 w-4 translate-x-px"
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
  const dash = useDashboardPath();
  const reduceMotion = useReducedMotion();
  const motionDuration = reduceMotion ? 0.12 : 0.2;
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

  const MAX_TEXTAREA_HEIGHT_PX = 600;
  const MAX_THREAD_TEXTAREA_HEIGHT_PX = 200;

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
          for (const item of toAdd) {
            if (item.type !== "video") continue;
            void captureVideoPoster(item.file).then((posterUrl) => {
              if (!posterUrl) return;
              setMedia((prev) =>
                prev.map((m) => (m.id === item.id ? { ...m, posterUrl } : m)),
              );
            });
          }
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
        const slotItemsToAdd: (ComposerMediaItem & { id: string })[] = [];
        setThreadSlots((prev) =>
          prev.map((s) => {
            if (s.id !== slotId) return s;
            const maxNew = THREAD_MAX_MEDIA_PER_POST - s.media.length;
            if (maxNew <= 0) return s;
            const n = Math.min(maxNew, validItems.length);
            const toAdd = validItems.slice(0, n);
            slotItemsToAdd.push(...toAdd);
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
        for (const item of slotItemsToAdd) {
          if (item.type !== "video") continue;
          void captureVideoPoster(item.file).then((posterUrl) => {
            if (!posterUrl) return;
            setThreadSlots((prev) =>
              prev.map((s) => {
                if (s.id !== slotId) return s;
                return {
                  ...s,
                  media: s.media.map((m) =>
                    m.id === item.id ? { ...m, posterUrl } : m,
                  ),
                };
              }),
            );
          });
        }
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

      // Stay under the current dashboard base (personal or /teams/:id) so the
      // in-memory composer payload survives — a jump to /dashboard/* from a
      // team URL triggers workspace boot/reload and drops caption + media.
      navigate(`${dash(`create/${targetSlug}`)}?${search.toString()}`);
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
    <div
      className={cn(
        "mx-auto w-full max-w-200 px-1 pb-20 sm:px-0 sm:pb-24",
        "transition-[padding] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        isThread
          ? "pt-[clamp(0.35rem,1.5vh,0.75rem)] sm:pt-[clamp(0.5rem,2vh,1rem)]"
          : "pt-[clamp(0.75rem,3.5vh,1.75rem)] sm:pt-[clamp(1rem,4.5vh,2.5rem)]",
      )}
    >
      <div className="space-y-5 sm:space-y-6">
        <div className="space-y-1.5 sm:space-y-2">
          <h1 className="font-logo text-[2rem] font-normal tracking-tight text-foreground sm:mb-0.5 sm:text-[2.35rem] sm:leading-tight">
            Composer
          </h1>
          <p className="max-w-xl text-sm leading-snug text-text-muted sm:leading-normal">
            Type anything, paste, drag and drop, or upload images/videos —
            we&apos;ll route you to the right post flow.
          </p>
        </div>

        <div
          className={cn(
            "rounded-[1.35rem] border bg-composer-card sm:rounded-[1.5rem]",
            "border-composer-card-border/90",
            "shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_10px_36px_-18px_rgba(0,0,0,0.45)]",
            "p-5 sm:p-6",
            "transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
            "focus-within:border-accent/40 focus-within:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent),0_10px_36px_-18px_rgba(0,0,0,0.45)]",
            isFileDragOver &&
              "border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_24%,transparent)]",
          )}
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
            className="min-h-21 max-h-80 w-full resize-none overflow-y-auto border-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-text outline-none placeholder:text-text-muted/80 sm:min-h-23 sm:text-base"
            placeholder="Write your post, or paste content..."
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
                    className="flex h-24 w-8 shrink-0 items-center justify-center rounded-lg bg-composer-chip text-text-muted transition-[background-color,color,transform] duration-150 hover:bg-composer-chip-hover hover:text-text active:scale-[0.97]"
                    aria-label="Scroll left"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <div
                  ref={mediaStripRef}
                  className="flex min-w-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden py-1 scroll-smooth scrollbar-thin"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {media.map((item, index) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => handleMediaDragStart(index)}
                      onDragOver={(e) => handleMediaDragOver(e, index)}
                      onDragEnd={handleMediaDragEnd}
                      className="group relative flex h-24 w-24 shrink-0 cursor-move items-center justify-center overflow-hidden rounded-xl border border-composer-card-border bg-composer-chip transition-[border-color] duration-150 hover:border-accent"
                    >
                      {item.type === "image" ? (
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="pointer-events-none h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <>
                          <video
                            src={item.previewUrl}
                            poster={item.posterUrl}
                            className="pointer-events-none h-full w-full object-cover"
                            muted
                            playsInline
                            preload="auto"
                            draggable={false}
                          />
                          <VideoPlayBadge />
                        </>
                      )}
                      <div className="pointer-events-none absolute left-0 right-0 top-0 bg-black/60 px-1.5 py-0.5 text-center">
                        <span className="text-xs font-bold text-white">
                          {index + 1}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMedia(item.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-black/80 active:scale-[0.97]"
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
                    className="flex h-24 w-8 shrink-0 items-center justify-center rounded-lg bg-composer-chip text-text-muted transition-[background-color,color,transform] duration-150 hover:bg-composer-chip-hover hover:text-text active:scale-[0.97]"
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
            <p className="rounded-lg border border-composer-card-border/70 bg-composer-chip/70 px-3 py-2 text-xs text-text-muted">
              Threads can contain at most 4 attachments per post.
            </p>
          )}

          <div className="mt-3 flex flex-col gap-3 border-t border-composer-card-border/60 pt-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium touch-manipulation sm:py-1.5",
                  "bg-composer-chip text-text",
                  "transition-[background-color,color,transform] duration-150",
                  "hover:bg-composer-chip-hover active:scale-[0.97]",
                  isThread &&
                    media.length >= THREAD_MAX_MEDIA_PER_POST &&
                    "cursor-not-allowed opacity-70",
                )}
              >
                <ImagePlus className="h-4 w-4 shrink-0 text-text-muted" />
                <span>Images / Videos{isThread ? " (max 4)" : ""}</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                  disabled={
                    isThread && media.length >= THREAD_MAX_MEDIA_PER_POST
                  }
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
                        if (s.media.length <= THREAD_MAX_MEDIA_PER_POST)
                          return s;
                        s.media
                          .slice(THREAD_MAX_MEDIA_PER_POST)
                          .forEach((m) => {
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
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium touch-manipulation sm:py-1.5",
                  "transition-[background-color,color,transform] duration-150",
                  "active:scale-[0.97]",
                  isThread
                    ? "bg-accent/10 text-accent"
                    : "bg-composer-chip text-text hover:bg-composer-chip-hover",
                )}
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
              className="order-first inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-sm transition-[background-color,transform,opacity] duration-150 hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100 touch-manipulation sm:order-0 sm:w-auto sm:py-2"
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
            <AnimatePresence initial={false}>
              {threadSlots.map((slot, index) => (
                <motion.div
                  key={slot.id}
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          transform: "translateY(6px) scale(0.97)",
                        }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : {
                          opacity: 1,
                          transform: "translateY(0px) scale(1)",
                        }
                  }
                  exit={
                    reduceMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          transform: "translateY(4px) scale(0.98)",
                        }
                  }
                  transition={{ duration: motionDuration, ease: EASE_OUT }}
                  className="space-y-4 rounded-2xl border border-composer-card-border bg-composer-card p-4 shadow-sm sm:p-5"
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
                      className="rounded-full p-1.5 text-text-muted transition-[background-color,color,transform] duration-150 hover:bg-composer-chip hover:text-text active:scale-[0.97]"
                      aria-label="Remove post"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    ref={(el) => {
                      if (el) threadTextareaRefs.current[slot.id] = el;
                    }}
                    className="min-h-24 max-h-50 w-full resize-none overflow-y-auto rounded-xl border border-composer-card-border bg-bg px-4 py-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    placeholder="What's in this post?"
                    value={slot.text}
                    onChange={(e) => {
                      updateThreadSlot(slot.id, { text: e.target.value });
                      requestAnimationFrame(() =>
                        resizeThreadSlotTextarea(
                          e.target as HTMLTextAreaElement,
                        ),
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
                            className="group relative flex h-20 w-20 shrink-0 cursor-move items-center justify-center overflow-hidden rounded-xl border border-composer-card-border bg-composer-chip transition-[border-color] duration-150 hover:border-accent"
                          >
                            {item.type === "image" ? (
                              <img
                                src={item.previewUrl}
                                alt=""
                                className="pointer-events-none h-full w-full object-cover"
                                draggable={false}
                              />
                            ) : (
                              <>
                                <video
                                  src={item.previewUrl}
                                  poster={item.posterUrl}
                                  className="pointer-events-none h-full w-full object-cover"
                                  muted
                                  playsInline
                                  preload="auto"
                                  draggable={false}
                                />
                                <VideoPlayBadge compact />
                              </>
                            )}
                            <div className="pointer-events-none absolute left-0 right-0 top-0 bg-black/60 px-1 py-0.5 text-center">
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
                              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-black/80 active:scale-[0.97]"
                              aria-label="Remove"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      {slot.media.some(
                        (m) =>
                          m.type === "video" && aspectGuidanceByMediaId[m.id],
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
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                        "border-composer-card-border bg-composer-chip text-text",
                        "transition-[background-color,color,border-color,transform] duration-150",
                        "active:scale-[0.97]",
                        slot.media.length >= THREAD_MAX_MEDIA_PER_POST
                          ? "cursor-not-allowed opacity-70"
                          : "cursor-pointer hover:bg-composer-chip-hover",
                      )}
                    >
                      <ImagePlus className="h-4 w-4 text-text-muted" />
                      <span>Images / Videos (max 4)</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={(e) =>
                          handleThreadSlotFiles(slot.id, e.target.files)
                        }
                        disabled={
                          slot.media.length >= THREAD_MAX_MEDIA_PER_POST
                        }
                      />
                    </label>
                    <p
                      className="mt-1 text-right text-xs text-text-muted"
                      aria-live="polite"
                    >
                      {slot.text.length} character
                      {slot.text.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <button
              type="button"
              onClick={addThreadSlot}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-composer-card-border bg-composer-card py-4 text-sm font-medium text-text-muted transition-[border-color,background-color,color,transform] duration-150 hover:border-accent hover:bg-accent/5 hover:text-accent active:scale-[0.99]"
            >
              <Plus className="h-4 w-4" />
              <span>Add another post</span>
            </button>
          </div>
        )}

        <div className="space-y-2 pt-0.5">
          <p className="flex items-center gap-2 text-sm leading-snug text-text-muted">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
              ✓
            </span>
            You can connect your accounts from{" "}
            <Link
              href={dash("connections")}
              className="font-medium text-accent transition-colors hover:text-accent-hover hover:underline"
            >
              here
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
