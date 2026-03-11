"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ImagePlus,
  FileText,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  setComposerPayload,
  type ComposerMediaItem,
} from "@/lib/composer-bridge";
import {
  validateVideoAspectRatio,
  formatAspectRatioLabel,
  getAspectRatioDescriptor,
  ASPECT_RATIO_MESSAGE,
  type VideoAspectResult,
} from "@/lib/video-aspect-ratio";

const THREAD_MAX_MEDIA_PER_POST = 4;

type ThreadSlot = {
  id: string;
  text: string;
  media: (ComposerMediaItem & { id: string })[];
};

export function ComposerClient() {
  const router = useRouter();
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
  const [mediaError, setMediaError] = useState<string | null>(null);
  const mediaStripRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea: min 20px, max 140px, then scroll
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "20px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

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
      setMediaError(null);

      const imageFiles: File[] = [];
      const videoFiles: File[] = [];
      Array.from(files).forEach((file) => {
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

      if (videoFiles.length === 0) return;

      Promise.all(videoFiles.map(validateVideoAspectRatio)).then(
        (results: VideoAspectResult[]) => {
          const validItems: (ComposerMediaItem & { id: string })[] = [];
          let firstInvalid: VideoAspectResult | null = null;
          videoFiles.forEach((file, i) => {
            const result = results[i];
            if (result?.valid) {
              validItems.push({
                id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
                type: "video",
                file,
                previewUrl: URL.createObjectURL(file),
              });
            } else if (!firstInvalid && result) firstInvalid = result;
          });
          if (firstInvalid) {
            const { ratio } = firstInvalid;
            setMediaError(
              `${ASPECT_RATIO_MESSAGE} Yours is ${formatAspectRatioLabel(ratio)}${getAspectRatioDescriptor(ratio)}.`,
            );
          }
          if (validItems.length > 0) {
            setMedia((prev) => {
              const maxNew = isThread
                ? THREAD_MAX_MEDIA_PER_POST - prev.length
                : validItems.length;
              if (maxNew <= 0) return prev;
              const toAdd = validItems.slice(0, maxNew);
              return [...prev, ...toAdd];
            });
          }
        },
      );
    },
    [isThread],
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
    setThreadSlots((prev) => prev.filter((s) => s.id !== slotId));
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
      setMediaError(null);

      const imageFiles: File[] = [];
      const videoFiles: File[] = [];
      Array.from(files).forEach((file) => {
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

      if (videoFiles.length === 0) return;

      Promise.all(videoFiles.map(validateVideoAspectRatio)).then(
        (results: VideoAspectResult[]) => {
          const validItems: (ComposerMediaItem & { id: string })[] = [];
          let firstInvalid: VideoAspectResult | null = null;
          videoFiles.forEach((file, i) => {
            const result = results[i];
            if (result?.valid) {
              validItems.push({
                id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
                type: "video",
                file,
                previewUrl: URL.createObjectURL(file),
              });
            } else if (!firstInvalid && result) firstInvalid = result;
          });
          if (firstInvalid) {
            const { ratio } = firstInvalid;
            setMediaError(
              `${ASPECT_RATIO_MESSAGE} Yours is ${formatAspectRatioLabel(ratio)}${getAspectRatioDescriptor(ratio)}.`,
            );
          }
          if (validItems.length > 0) {
            setThreadSlots((prev) =>
              prev.map((s) => {
                if (s.id !== slotId) return s;
                const maxNew = THREAD_MAX_MEDIA_PER_POST - s.media.length;
                if (maxNew <= 0) return s;
                const toAdd = validItems.slice(0, maxNew);
                return { ...s, media: [...s.media, ...toAdd] };
              }),
            );
          }
        },
      );
    },
    [],
  );

  const removeThreadSlotMedia = useCallback(
    (slotId: string, mediaId: string) => {
      setThreadSlots((prev) =>
        prev.map((s) =>
          s.id === slotId
            ? { ...s, media: s.media.filter((m) => m.id !== mediaId) }
            : s,
        ),
      );
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
        media: media.map(({ id, ...rest }) => rest),
        threadPosts:
          isThread && threadSlots.length > 0
            ? threadSlots.map((s) => ({
                text: s.text.trim(),
                media: s.media.map(({ id: _id, ...rest }) => rest),
              }))
            : undefined,
      });

      const search = new URLSearchParams();
      search.set("fromComposer", "1");

      router.push(`/dashboard/create/${targetSlug}?${search.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  const removeMedia = (id: string) => {
    setMedia((prev) => {
      const next = prev.filter((m) => m.id !== id);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 mt-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold text-text">Composer</h1>
        <p className="text-sm text-text-muted">
          Type anything, paste/upload media, and we&apos;ll route you to the
          right post flow. You can always adjust details on the next screen.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-bg-elevated p-4 sm:p-5 shadow-sm">
        <textarea
          ref={textareaRef}
          className="min-h-[50px] max-h-[140px] w-full resize-none overflow-y-auto border-none bg-transparent text-base text-text outline-none placeholder:text-text-muted"
          placeholder="Share what's on your mind..."
          value={text}
          onChange={(e) => setText(e.target.value)}
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
                      // eslint-disable-next-line @next/next/no-img-element
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
                          preload="auto"
                          draggable={false}
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50">
                            <svg
                              className="h-4 w-4 ml-0.5 text-white fill-current"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
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
          </div>
        )}

        {isThread && (
          <p className="text-xs text-text-muted rounded-lg border border-border/60 bg-bg-muted/50 px-3 py-2">
            Threads can contain at most 4 attachments per post.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isThread && media.length >= THREAD_MAX_MEDIA_PER_POST
                  ? "cursor-not-allowed border-border bg-bg-muted opacity-70"
                  : "border-border bg-bg-muted text-text-muted hover:bg-bg-hover hover:text-text"
              }`}
            >
              <ImagePlus className="h-4 w-4" />
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
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isThread
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-bg-muted text-text-muted hover:bg-bg-hover hover:text-text"
              }`}
            >
              <Plus className="h-3 w-3" />
              <span>Add another post as thread</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              loading ||
              (!text.trim() &&
                media.length === 0 &&
                !threadSlots.some((s) => s.text.trim() || s.media.length > 0))
            }
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            <FileText className="h-4 w-4" />
            <span>Continue</span>
          </button>
        </div>
        {mediaError && (
          <p className="text-sm text-red-600 dark:text-red-400 pt-1">
            {mediaError}
          </p>
        )}
      </div>

      {isThread && (
        <div className="space-y-4">
          {threadSlots.map((slot, index) => (
            <div
              key={slot.id}
              className="rounded-2xl border border-border bg-bg-elevated p-4 sm:p-5 shadow-sm space-y-4"
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
                className="min-h-[100px] w-full resize-none rounded-xl border border-input bg-bg px-4 py-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="What's in this post?"
                value={slot.text}
                onChange={(e) =>
                  updateThreadSlot(slot.id, { text: e.target.value })
                }
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
                          /* eslint-disable-next-line @next/next/no-img-element */
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
                              preload="auto"
                              draggable={false}
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50">
                                <svg
                                  className="h-3 w-3 ml-0.5 text-white fill-current"
                                  viewBox="0 0 24 24"
                                  aria-hidden
                                >
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
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
                </div>
              )}
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

      <p className="text-xs text-text-muted">
        Paste or drop almost anything here. We&apos;ll detect whether it&apos;s
        text, images, video, or a combination and start you in the best-fitting
        post builder.
      </p>

      <p className="flex items-center gap-2 text-sm text-text-muted">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent">
          ✓
        </span>
        You can connect your accounts from{" "}
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
