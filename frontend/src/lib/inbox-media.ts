/** Platform inbox media rules — keep in sync with backend media-capabilities.ts */

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
};

export function inboxDmMediaKinds(
  platform: string,
  override?: InboxMediaKind[] | null,
): InboxMediaKind[] {
  if (override?.length) return override;
  return DM_MEDIA[platform] ?? [];
}

export function inboxCommentMediaKinds(platform: string): InboxMediaKind[] {
  return COMMENT_MEDIA[platform] ?? [];
}

export function inboxAcceptsFile(
  platform: string,
  mode: "dm" | "comment",
  file: File,
  mediaKinds?: InboxMediaKind[] | null,
): boolean {
  const kinds =
    mode === "dm"
      ? inboxDmMediaKinds(platform, mediaKinds)
      : inboxCommentMediaKinds(platform);
  if (!kinds.length) return false;
  if (file.type.startsWith("image/")) return kinds.includes("image");
  if (file.type.startsWith("video/")) return kinds.includes("video");
  return false;
}

export function inboxMediaAccept(
  platform: string,
  mode: "dm" | "comment",
  mediaKinds?: InboxMediaKind[] | null,
): string {
  const kinds =
    mode === "dm"
      ? inboxDmMediaKinds(platform, mediaKinds)
      : inboxCommentMediaKinds(platform);
  const parts: string[] = [];
  if (kinds.includes("image")) parts.push("image/*");
  if (kinds.includes("video")) parts.push("video/*");
  return parts.join(",") || "";
}

export function pickInboxFileFromList(
  platform: string,
  mode: "dm" | "comment",
  files: FileList | File[] | null | undefined,
  mediaKinds?: InboxMediaKind[] | null,
): File | null {
  if (!files?.length) return null;
  for (const file of Array.from(files)) {
    if (inboxAcceptsFile(platform, mode, file, mediaKinds)) return file;
  }
  return null;
}

export function pickInboxFileFromClipboard(
  platform: string,
  mode: "dm" | "comment",
  data: DataTransfer | null | undefined,
  mediaKinds?: InboxMediaKind[] | null,
): File | null {
  if (!data) return null;
  const items = data.items;
  if (items?.length) {
    for (const item of Array.from(items)) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file && inboxAcceptsFile(platform, mode, file, mediaKinds)) return file;
    }
  }
  return pickInboxFileFromList(platform, mode, data.files, mediaKinds);
}
