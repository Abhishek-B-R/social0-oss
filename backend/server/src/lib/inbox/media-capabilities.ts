/** Which inbox surfaces accept image/video — mirrors platform APIs (no fake support). */

export type InboxMediaKind = "image" | "video";

const DM_MEDIA: Record<string, InboxMediaKind[]> = {
  instagram: ["image", "video"],
  twitter_x: ["image", "video"],
  bluesky: [],
  tiktok: ["image"],
};

const COMMENT_MEDIA: Record<string, InboxMediaKind[]> = {
  twitter_x: ["image", "video"],
  bluesky: ["image"],
  instagram: [],
  facebook: [],
  threads: [],
  youtube: [],
  linkedin: [],
  tiktok: [],
  pinterest: [],
};

export function inboxDmMediaKinds(platform: string): InboxMediaKind[] {
  return DM_MEDIA[platform] ?? [];
}

export function inboxCommentMediaKinds(platform: string): InboxMediaKind[] {
  return COMMENT_MEDIA[platform] ?? [];
}

export function inboxAllowsMedia(
  platform: string,
  mode: "dm" | "comment",
  mimeType: string,
): boolean {
  const kinds = mode === "dm" ? inboxDmMediaKinds(platform) : inboxCommentMediaKinds(platform);
  if (!kinds.length) return false;
  if (mimeType.startsWith("image/")) return kinds.includes("image");
  if (mimeType.startsWith("video/")) return kinds.includes("video");
  return false;
}
