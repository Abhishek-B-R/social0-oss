import type { PostForm } from "../lib/content-types.js";
import { formLabel, platformsForForm } from "../lib/content-types.js";
import type { ConnectedAccount, Platform } from "../types/index.js";
import * as mediaApi from "../api/media.js";

export function inferPostForm(input: {
  hasMedia?: boolean;
  mediaIsVideo?: boolean;
  mediaType?: "none" | "image" | "video" | "collection";
  mimeTypes?: string[];
}): PostForm {
  if (input.mediaType === "collection") return "collection";
  const mimeTypes = input.mimeTypes ?? [];
  const videoCount = mimeTypes.filter((m) => m.startsWith("video/")).length;
  const imageCount = mimeTypes.filter((m) => m.startsWith("image/")).length;
  const knownMediaCount = videoCount + imageCount;

  if (knownMediaCount > 1 && videoCount > 0) return "collection";
  if (input.mediaType === "video" || input.mediaIsVideo === true) return "video";
  if (videoCount === 1) return "video";
  if (input.mediaType === "image" || input.hasMedia === true) return "image";
  if (imageCount > 0) return "image";
  if (mimeTypes.length) return "image";
  return "text";
}

export async function resolvePostFormFromMediaIds(
  mediaIds: string[] | undefined,
): Promise<{ form: PostForm; mimeTypes: string[]; mediaErrors: string[] }> {
  if (!mediaIds?.length) return { form: "text", mimeTypes: [], mediaErrors: [] };

  const normalizedIds = mediaIds.map((id) => id.toLowerCase());
  const mediaErrors: string[] = [];

  const mimeTypes = await Promise.all(
    normalizedIds.map(async (id) => {
      try {
        const media = await mediaApi.getMedia(id);
        return media.content_type ?? "";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        mediaErrors.push(`Media ID ${id} could not be verified: ${message}`);
        return "";
      }
    }),
  );

  const knownMimeTypes = mimeTypes.filter(Boolean);
  const form = knownMimeTypes.length > 0
    ? inferPostForm({ mimeTypes: knownMimeTypes })
    : inferPostForm({ hasMedia: true });
  return { form, mimeTypes: knownMimeTypes, mediaErrors };
}

export function validatePlatformsForForm(
  form: PostForm,
  accountIds: string[],
  accounts: ConnectedAccount[],
  mediaIds: string[] = [],
): string[] {
  const allowed = new Set(platformsForForm(form));
  const errors: string[] = [];
  const byId = new Map(accounts.map((a) => [a.id, a]));

  for (const id of accountIds) {
    const acc = byId.get(id);
    if (!acc) continue;
    if (!allowed.has(acc.platform as Platform)) {
      const supported = [...allowed].join(", ");
      if (form === "collection" && acc.platform === "youtube") {
        errors.push(
          `YouTube supports one video per post. You attached ${mediaIds.length} media items, so Social0 treats this as a collection. Remove extra media or publish the collection to: ${supported}.`,
        );
        continue;
      }
      errors.push(
        `${acc.platform} does not support ${formLabel(form).toLowerCase()}s in Social0 (supported for this content: ${supported}). Upload ${form === "text" ? "media or pick text-only platforms" : form === "video" ? "a video" : "an image"}.`,
      );
    }
  }

  return errors;
}
