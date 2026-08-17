/** Parse platform attachment payloads into a single image/video for the inbox UI. */

import type { InboxAttachment } from "./types.js";

const MEDIA_EXT = /\.(?:jpe?g|png|gif|webp|bmp|mp4|mov|m4v|webm)(?:\?|#|$)/i;
const VIDEO_EXT = /\.(?:mp4|mov|m4v|webm)(?:\?|#|$)/i;
const MEDIA_HOST =
  /(?:lookaside\.fbsbx\.com|scontent[^/]*\.(?:cdninstagram|fbcdn|xx\.fbcdn)\.net|cdninstagram\.com|fbcdn\.net|pbs\.twimg\.com|video\.twimg\.com|video\.xx\.fbcdn\.net|media\.tenor\.com)/i;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export function isInboxMediaUrl(url: string): boolean {
  return MEDIA_EXT.test(url) || MEDIA_HOST.test(url);
}

export function inboxMediaKind(url: string): "image" | "video" {
  return VIDEO_EXT.test(url) || /video\.twimg|video\.xx\.fbcdn/i.test(url)
    ? "video"
    : "image";
}

export function extractMediaFromText(text: string): InboxAttachment | null {
  const matches = text.match(URL_RE);
  if (!matches) return null;
  for (const raw of matches) {
    const url = raw.replace(/[),.;]+$/, "");
    if (!isInboxMediaUrl(url)) continue;
    return { type: inboxMediaKind(url), url };
  }
  return null;
}

export function withMediaFallback(
  text: string,
  attachment: InboxAttachment | null | undefined,
): { text: string; attachment: InboxAttachment | null } {
  if (attachment?.url) return { text, attachment };
  const found = extractMediaFromText(text);
  if (!found) return { text, attachment: attachment ?? null };
  return {
    text: text.replace(found.url, "").replace(/\s+/g, " ").trim(),
    attachment: found,
  };
}

function asUrl(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//.test(c)) return c;
  }
  return null;
}

/** Messenger / Instagram Graph `attachments` (array or `{ data: [] }`). */
export function parseGraphAttachments(raw: unknown): InboxAttachment | null {
  const rows = Array.isArray(raw)
    ? raw
    : (raw as { data?: unknown[] } | undefined)?.data;
  if (!Array.isArray(rows) || !rows.length) return null;
  const first = rows[0] as Record<string, unknown>;
  const imageData = first.image_data as
    | { url?: string; preview_url?: string }
    | undefined;
  const videoData = first.video_data as
    | { url?: string; preview_url?: string }
    | undefined;
  const payload = first.payload as { url?: string } | undefined;
  const generic = first.generic_template as
    | { element?: { image_url?: string } }
    | undefined;
  const mime = typeof first.mime_type === "string" ? first.mime_type : "";
  const typeHint = String(first.type ?? "").toLowerCase();

  const videoUrl = asUrl(videoData?.url, mime.startsWith("video/") ? payload?.url : null);
  if (videoUrl) {
    return {
      type: "video",
      url: videoUrl,
      thumbnailUrl: asUrl(videoData?.preview_url) ?? null,
    };
  }
  const imageUrl = asUrl(
    imageData?.url,
    imageData?.preview_url,
    first.file_url,
    payload?.url,
    generic?.element?.image_url,
  );
  if (imageUrl) {
    const type =
      mime.startsWith("video/") || typeHint === "video" || inboxMediaKind(imageUrl) === "video"
        ? "video"
        : "image";
    return { type, url: imageUrl };
  }
  return null;
}

export type XMediaLike = {
  media_key?: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  variants?: Array<{ content_type?: string; url?: string; bit_rate?: number }>;
};

export function xMediaToAttachment(media: XMediaLike | undefined | null): InboxAttachment | null {
  if (!media) return null;
  const mp4s = (media.variants ?? []).filter(
    (v) => v.content_type === "video/mp4" && v.url,
  );
  mp4s.sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
  const variantUrl = mp4s[0]?.url;
  if (media.type === "video" || media.type === "animated_gif") {
    const url = variantUrl ?? media.url ?? media.preview_image_url;
    if (!url) return null;
    return {
      type: "video",
      url,
      thumbnailUrl: media.preview_image_url ?? null,
    };
  }
  const url = media.url ?? media.preview_image_url ?? variantUrl;
  if (!url) return null;
  return {
    type: inboxMediaKind(url) === "video" ? "video" : "image",
    url,
    thumbnailUrl: media.preview_image_url ?? null,
  };
}

/** Facebook Graph comment `attachment` object. */
export function parseFbCommentAttachment(raw: unknown): InboxAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const media = a.media as
    | { image?: { src?: string }; source?: string }
    | undefined;
  const url = asUrl(media?.image?.src, media?.source, a.url);
  if (!url) return null;
  const type = String(a.type ?? "").toLowerCase().includes("video")
    ? "video"
    : inboxMediaKind(url);
  return { type, url };
}

/** Bluesky post view `embed` (images / video / recordWithMedia). */
export function parseBskyViewEmbed(embed: unknown): InboxAttachment | null {
  if (!embed || typeof embed !== "object") return null;
  const e = embed as Record<string, unknown>;
  const type = String(e.$type ?? "");
  if (type.includes("embed.recordWithMedia")) {
    return parseBskyViewEmbed(e.media);
  }
  if (type.includes("embed.images")) {
    const images = e.images as Array<{ fullsize?: string; thumb?: string }> | undefined;
    const url = asUrl(images?.[0]?.fullsize, images?.[0]?.thumb);
    if (url) return { type: "image", url };
  }
  if (type.includes("embed.video")) {
    const url = asUrl(e.playlist, e.thumbnail);
    if (!url) return null;
    return {
      type: String(e.playlist ?? "").startsWith("http") ? "video" : "image",
      url,
      thumbnailUrl: asUrl(e.thumbnail) ?? null,
    };
  }
  return null;
}
