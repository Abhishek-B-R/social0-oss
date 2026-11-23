import { CONTENT_TYPES } from "@/lib/content-types";
import type { ComposerContentType, ComposerPart } from "./types";

/**
 * Post type from what is in the composer, using the same rules the old
 * Composer used to route into the five forms:
 * thread when there is more than one part; otherwise text (no media),
 * image (images only), video (exactly one video), collection (2+ videos
 * or images mixed with video).
 */
export function detectContentType(
  parts: readonly ComposerPart[],
  initialContentType?: ComposerContentType | null,
): ComposerContentType {
  if (parts.length > 1) return "threads";
  const media = parts[0]?.media ?? [];
  const videos = media.filter((m) => m.kind === "video").length;
  const images = media.length - videos;
  if (media.length === 0) return "text";
  // A saved collection that is still images-only stays a collection, so
  // editing it doesn't silently change which networks it can go to.
  if (initialContentType === "collection" && videos === 0) return "collection";
  if (videos === 0) return "image";
  if (videos === 1 && images === 0) return "video";
  return "collection";
}

const SUPPORTED: Record<ComposerContentType, ReadonlySet<string>> =
  Object.fromEntries(
    CONTENT_TYPES.map((t) => [t.id, new Set<string>(t.platforms)]),
  ) as unknown as Record<ComposerContentType, ReadonlySet<string>>;

/** Networks that can take this post type (from `lib/content-types`). */
export function supportsContentType(
  network: string,
  type: ComposerContentType,
): boolean {
  return SUPPORTED[type]?.has(network) ?? false;
}

export const CONTENT_TYPE_LABEL: Record<ComposerContentType, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  threads: "Thread",
  collection: "Collection",
};

/** Slug for old `/create/:type` routes. */
export function isContentTypeSlug(slug: string): slug is ComposerContentType {
  return (
    slug === "text" ||
    slug === "image" ||
    slug === "video" ||
    slug === "threads" ||
    slug === "collection"
  );
}

/**
 * Why a network can't take this post type, in the person's words.
 * Null when it can.
 */
export function unsupportedReason(
  network: string,
  type: ComposerContentType,
  networkName: string,
): string | null {
  if (supportsContentType(network, type)) return null;
  if (type === "text") {
    if (network === "youtube") return `${networkName} needs a video.`;
    return `${networkName} needs an image or video.`;
  }
  if (type === "image" && network === "youtube") {
    return `${networkName} needs a video, not images.`;
  }
  if (type === "threads") {
    return `${networkName} doesn't support threads. Threads go to X, Threads and Bluesky.`;
  }
  if (type === "collection") {
    return `${networkName} can't post a mix of images and videos. Collections go to X, Threads and Instagram.`;
  }
  return `${networkName} can't post this.`;
}
