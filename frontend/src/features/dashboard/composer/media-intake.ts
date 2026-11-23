import { validateMediaFile } from "@/lib/media-limits";
import {
  captureVideoPoster,
  measureVideoAspectRatio,
} from "@/lib/video-aspect-ratio";
import {
  getVideoDuration,
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_DURATION_MESSAGE,
} from "@/lib/video-duration";
import type { PostMediaRow } from "@/features/dashboard/posts/post-types";
import type { ComposerMedia } from "./types";

let seq = 0;
export function localId(prefix = "m"): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

export type IntakeResult = {
  items: ComposerMedia[];
  /** One line per rejected file (toast these). */
  errors: string[];
};

/**
 * Turn picked/dropped/pasted files into tray items. Same checks the old
 * forms ran: images or videos only, videos ≤ 500 MB upload cap and under
 * 5 minutes. Platform limits are checked later per account (validation).
 */
export async function intakeFiles(files: readonly File[]): Promise<IntakeResult> {
  const errors: string[] = [];
  const accepted: File[] = [];
  let unsupported = 0;
  for (const file of files) {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      unsupported += 1;
      continue;
    }
    const v = validateMediaFile(file);
    if (!v.allowed) {
      errors.push(v.error);
      continue;
    }
    accepted.push(file);
  }
  if (unsupported > 0) {
    errors.push(
      unsupported === 1
        ? "That file isn't an image or video, so it was skipped."
        : `${unsupported} files weren't images or videos, so they were skipped.`,
    );
  }

  let overDuration = false;
  const items = await Promise.all(
    accepted.map(async (file): Promise<ComposerMedia | null> => {
      const previewUrl = URL.createObjectURL(file);
      if (file.type.startsWith("image/")) {
        const dims = await measureImage(previewUrl);
        return {
          id: localId(),
          kind: "image",
          file,
          previewUrl,
          width: dims.width || undefined,
          height: dims.height || undefined,
          mimeType: file.type,
          sizeBytes: file.size,
        };
      }
      const [dims, duration] = await Promise.all([
        measureVideoAspectRatio(file),
        getVideoDuration(file),
      ]);
      if (duration > MAX_VIDEO_DURATION_SECONDS) {
        overDuration = true;
        URL.revokeObjectURL(previewUrl);
        return null;
      }
      return {
        id: localId(),
        kind: "video",
        file,
        previewUrl,
        width: dims.width || undefined,
        height: dims.height || undefined,
        durationSec: duration,
        mimeType: file.type,
        sizeBytes: file.size,
      };
    }),
  );
  if (overDuration) errors.push(VIDEO_DURATION_MESSAGE);
  return { items: items.filter((m): m is ComposerMedia => m != null), errors };
}

/** Poster frames for local videos, filled in after the tray renders. */
export async function posterFor(item: ComposerMedia): Promise<string | null> {
  if (item.kind !== "video" || !item.file || item.posterUrl) return null;
  const poster = await captureVideoPoster(item.file);
  return poster || null;
}

/** Existing media rows (draft / scheduled / edit) as tray items. */
export function mediaFromRows(
  rows: readonly PostMediaRow[],
  meta?: { durationSeconds?: number; isVertical?: boolean } | null,
): ComposerMedia[] {
  return rows
    .filter((r) => r.mimeType.startsWith("image/") || r.mimeType.startsWith("video/"))
    .map((r) => {
      const isVideo = r.mimeType.startsWith("video/");
      return {
        id: localId(),
        kind: isVideo ? "video" : "image",
        existingId: r.id,
        previewUrl: isVideo
          ? (r.url ?? r.thumbnailUrl ?? "")
          : (r.thumbnailUrl ?? r.url ?? ""),
        posterUrl: isVideo ? (r.thumbnailUrl ?? undefined) : undefined,
        mimeType: r.mimeType,
        durationSec:
          isVideo && typeof meta?.durationSeconds === "number"
            ? meta.durationSeconds
            : undefined,
        isVertical:
          isVideo && typeof meta?.isVertical === "boolean" ? meta.isVertical : undefined,
      } satisfies ComposerMedia;
    });
}

/** Release blob: URLs for media leaving the composer. */
export function revokeMedia(items: readonly ComposerMedia[]): void {
  for (const m of items) {
    if (m.previewUrl.startsWith("blob:")) URL.revokeObjectURL(m.previewUrl);
  }
}

/**
 * Center-crop an image to `ratio` (width / height) and return a new tray
 * item (JPEG for photos, PNG kept as PNG). Used by "Crop 4:5 for Instagram".
 */
export async function cropImage(
  item: ComposerMedia,
  ratio: number,
): Promise<ComposerMedia | null> {
  if (item.kind !== "image") return null;
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = item.previewUrl;
  });
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  let cw = w;
  let ch = Math.round(w / ratio);
  if (ch > h) {
    ch = h;
    cw = Math.round(h * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, Math.round((w - cw) / 2), Math.round((h - ch) / 2), cw, ch, 0, 0, cw, ch);
  const type = item.mimeType === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, 0.92);
    } catch {
      // Tainted canvas (remote image without CORS).
      resolve(null);
    }
  });
  if (!blob) return null;
  const baseName = item.file?.name?.replace(/\.[a-z0-9]+$/i, "") ?? "image";
  const file = new File([blob], `${baseName}-cropped.${type === "image/png" ? "png" : "jpg"}`, {
    type,
  });
  return {
    id: localId(),
    kind: "image",
    file,
    previewUrl: URL.createObjectURL(file),
    width: cw,
    height: ch,
    mimeType: type,
    sizeBytes: file.size,
  };
}

/** "16:9", "4:5", "1:1"… or "1.91:1" style for odd ratios. */
export function ratioLabel(width?: number, height?: number): string | null {
  if (!width || !height) return null;
  const r = width / height;
  const known: Array<[number, string]> = [
    [1, "1:1"],
    [4 / 5, "4:5"],
    [5 / 4, "5:4"],
    [9 / 16, "9:16"],
    [16 / 9, "16:9"],
    [2 / 3, "2:3"],
    [3 / 2, "3:2"],
    [3 / 4, "3:4"],
    [4 / 3, "4:3"],
    [1.91, "1.91:1"],
  ];
  for (const [v, label] of known) {
    if (Math.abs(r - v) / v <= 0.03) return label;
  }
  return r >= 1 ? `${r.toFixed(2)}:1` : `1:${(1 / r).toFixed(2)}`;
}

/** The ratio an Instagram crop should use for an image, or null if it fits. */
export function instagramCropRatio(m: ComposerMedia): number | null {
  if (m.kind !== "image" || !m.width || !m.height) return null;
  const r = m.width / m.height;
  if (r < 0.8 - 0.01) return 4 / 5;
  if (r > 1.91 + 0.01) return 1.91;
  return null;
}
