import { Play } from "lucide-react";
import AppImage from "@/components/AppImage";
import { cn } from "@/lib/utils";
import type { FirstMediaMeta } from "./posts-model";

/**
 * Square media thumbnail for list rows and cards. Images use their URL,
 * videos prefer a still and otherwise load metadata for a first frame.
 * Text and thread posts get no placeholder: an empty spacer of the same size
 * keeps titles aligned in a list that mixes media and text rows.
 */
export function PostThumb({
  media,
  extraCount = 0,
  size = 40,
  className,
}: {
  media: FirstMediaMeta | null;
  extraCount?: number;
  size?: number;
  className?: string;
}) {
  const isVideo = !!media?.mimeType.startsWith("video/");
  const still = media?.thumbnailUrl?.trim() || null;
  const url = media?.url?.trim() || null;
  const imageUrl = isVideo ? still : still || url;
  if (!media) {
    return (
      <span className={cn("inline-block shrink-0", className)} style={{ width: size, height: size }} aria-hidden />
    );
  }

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-muted ring-1 ring-border",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {imageUrl ? (
        <AppImage
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          unoptimized
        />
      ) : isVideo && url ? (
        <video
          src={url}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            try {
              v.currentTime = Math.min(0.1, (v.duration || 1) * 0.01);
            } catch {
              /* ignore seek errors */
            }
          }}
        />
      ) : null}
      {isVideo ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <Play className="size-3 fill-white text-white" />
        </span>
      ) : null}
      {extraCount > 0 ? (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold leading-3 text-white">
          +{extraCount}
        </span>
      ) : null}
    </span>
  );
}
