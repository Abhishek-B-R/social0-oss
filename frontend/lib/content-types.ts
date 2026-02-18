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
      "twitter_x",
      "linkedin",
      "instagram",
      "youtube",
      "tiktok",
    ],
  },
  {
    id: "blog",
    name: "Blog / Article",
    description: "Long-form articles and blog posts",
    slug: "blog",
    platforms: ["hashnode", "devto", "medium"],
  },
  {
    id: "threads",
    name: "Threads",
    description: "Multi-post thread (Twitter / Threads style)",
    slug: "threads",
    platforms: ["twitter_x", "threads", "bluesky", "facebook"],
  },
  {
    id: "collection",
    name: "Collection (images & videos)",
    description: "Collection of images and videos with text in one single post",
    slug: "collection",
    platforms: [
      "facebook",
      "twitter_x",
      "threads",
      "bluesky",
      "instagram",
      "pinterest",
    ],
  },
] as const;

export type ContentTypeId = (typeof CONTENT_TYPES)[number]["id"];
export type ContentTypeSlug = (typeof CONTENT_TYPES)[number]["slug"];

export const CONTENT_TYPE_SLUGS: ContentTypeSlug[] = CONTENT_TYPES.map(
  (c) => c.slug,
);

export function getContentTypeBySlug(
  slug: string,
): (typeof CONTENT_TYPES)[number] | undefined {
  return CONTENT_TYPES.find((c) => c.slug === slug);
}
