import type { PostForm } from "../lib/content-types.js";
import { formLabel, platformsForForm } from "../lib/content-types.js";
import type { ConnectedAccount, Platform } from "../types/index.js";
import * as mediaApi from "../api/media.js";

export function inferPostForm(input: {
  hasMedia?: boolean;
  mediaIsVideo?: boolean;
  mediaType?: "none" | "image" | "video";
  mimeTypes?: string[];
}): PostForm {
  if (input.mediaType === "video" || input.mediaIsVideo === true) return "video";
  if (input.mimeTypes?.some((m) => m.startsWith("video/"))) return "video";
  if (input.mediaType === "image" || input.hasMedia === true) return "image";
  if (input.mimeTypes?.some((m) => m.startsWith("image/"))) return "image";
  if (input.mimeTypes?.length) return "image";
  return "text";
}

export async function resolvePostFormFromMediaIds(
  mediaIds: string[] | undefined,
): Promise<{ form: PostForm; mimeTypes: string[] }> {
  if (!mediaIds?.length) return { form: "text", mimeTypes: [] };

  const mimeTypes = await Promise.all(
    mediaIds.map(async (id) => {
      try {
        const media = await mediaApi.getMedia(id);
        return media.content_type ?? "";
      } catch {
        return "";
      }
    }),
  );

  const knownMimeTypes = mimeTypes.filter(Boolean);
  const form = knownMimeTypes.length > 0
    ? inferPostForm({ mimeTypes: knownMimeTypes })
    : inferPostForm({ hasMedia: true });
  return { form, mimeTypes: knownMimeTypes };
}

export function validatePlatformsForForm(
  form: PostForm,
  accountIds: string[],
  accounts: ConnectedAccount[],
): string[] {
  const allowed = new Set(platformsForForm(form));
  const errors: string[] = [];
  const byId = new Map(accounts.map((a) => [a.id, a]));

  for (const id of accountIds) {
    const acc = byId.get(id);
    if (!acc) continue;
    if (!allowed.has(acc.platform as Platform)) {
      const supported = [...allowed].join(", ");
      errors.push(
        `${acc.platform} does not support ${formLabel(form).toLowerCase()}s in Social0 (supported for this content: ${supported}). Upload ${form === "text" ? "media or pick text-only platforms" : form === "video" ? "a video" : "an image"}.`,
      );
    }
  }

  return errors;
}
