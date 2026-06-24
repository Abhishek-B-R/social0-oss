export const CONTENT_TYPES = [
  { id: "text", slug: "text", label: "Text post", icon: "text" },
  { id: "image", slug: "image", label: "Image post", icon: "image" },
  { id: "video", slug: "video", label: "Video post", icon: "video" },
  { id: "threads", slug: "threads", label: "Thread", icon: "threads" },
  { id: "collection", slug: "collection", label: "Collection", icon: "collection" },
] as const;

export type ContentTypeId = (typeof CONTENT_TYPES)[number]["id"];
export type ContentTypeSlug = (typeof CONTENT_TYPES)[number]["slug"];
