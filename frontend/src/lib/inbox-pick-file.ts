import { inboxAcceptsFile } from "@/lib/inbox-media";

export function pickInboxFileFromList(
  platform: string,
  mode: "dm" | "comment",
  files: FileList | File[] | null | undefined,
): File | null {
  if (!files?.length) return null;
  for (const file of Array.from(files)) {
    if (inboxAcceptsFile(platform, mode, file)) return file;
  }
  return null;
}

export function pickInboxFileFromClipboard(
  platform: string,
  mode: "dm" | "comment",
  data: DataTransfer | null | undefined,
): File | null {
  if (!data) return null;
  const items = data.items;
  if (items?.length) {
    for (const item of Array.from(items)) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file && inboxAcceptsFile(platform, mode, file)) return file;
    }
  }
  return pickInboxFileFromList(platform, mode, data.files);
}
