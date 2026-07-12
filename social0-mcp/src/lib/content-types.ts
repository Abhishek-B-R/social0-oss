import type { Platform } from "../types/index.js";

/** Mirrors dashboard create flows — same platform rules as social0.app. */
export const CONTENT_TYPES = [
  {
    slug: "text" as const,
    name: "Text post",
    platforms: [
      "facebook",
      "bluesky",
      "twitter_x",
      "linkedin",
      "threads",
    ] as Platform[],
  },
  {
    slug: "image" as const,
    name: "Image post",
    platforms: [
      "facebook",
      "bluesky",
      "twitter_x",
      "linkedin",
      "threads",
      "pinterest",
      "tiktok",
      "instagram",
    ] as Platform[],
  },
  {
    slug: "video" as const,
    name: "Video post",
    platforms: [
      "facebook",
      "bluesky",
      "twitter_x",
      "linkedin",
      "threads",
      "youtube",
      "pinterest",
      "tiktok",
      "instagram",
    ] as Platform[],
  },
  {
    slug: "collection" as const,
    name: "Collection post",
    platforms: [
      "twitter_x",
      "threads",
      "instagram",
    ] as Platform[],
  },
] as const;

export type PostForm = (typeof CONTENT_TYPES)[number]["slug"];

export function platformsForForm(form: PostForm): readonly Platform[] {
  return CONTENT_TYPES.find((c) => c.slug === form)?.platforms ?? [];
}

export function formLabel(form: PostForm): string {
  return CONTENT_TYPES.find((c) => c.slug === form)?.name ?? form;
}
