/**
 * Content types for "Create a new post" and their supported platforms.
 * Platform IDs must match lib/platforms.ts.
 */
export const CONTENT_TYPES = [
  {
    id: "text",
    name: "Text Post",
    description: "Plain text post",
    slug: "text",
    platforms: ["facebook", "bluesky", "twitter_x", "linkedin", "threads"],
  },
  {
    id: "image",
    name: "Image Post",
    description: "Image with optional caption",
    slug: "image",
    platforms: [
      "facebook",
      "bluesky",
      "twitter_x",
      "linkedin",
      "threads",
      "pinterest",
      "tiktok",
      "instagram",
    ],
  },
  {
    id: "video",
    name: "Video Post",
    description: "Video with optional caption",
    slug: "video",
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
    ],
  },
  {
    id: "threads",
    name: "Threads",
    description: "Multi-post thread (Twitter / Threads / Bluesky style)",
    slug: "threads",
    platforms: ["twitter_x", "threads", "bluesky"],
  },
  {
    id: "collection",
    name: "Collection (images & videos)",
    description: "Collection of images and videos with text in one single post",
    slug: "collection",
    platforms: ["twitter_x", "threads", "instagram"],
  },
] as const;


export function getContentTypeBySlug(
  slug: string,
): (typeof CONTENT_TYPES)[number] | undefined {
  return CONTENT_TYPES.find((c) => c.slug === slug);
}
