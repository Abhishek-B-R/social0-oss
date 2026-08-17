import type { InboxAttachment } from "@/api/inbox";

const MEDIA_EXT = /\.(?:jpe?g|png|gif|webp|bmp|mp4|mov|m4v|webm)(?:\?|#|$)/i;
const VIDEO_EXT = /\.(?:mp4|mov|m4v|webm)(?:\?|#|$)/i;
const MEDIA_HOST =
  /(?:lookaside\.fbsbx\.com|scontent[^/]*\.(?:cdninstagram|fbcdn|xx\.fbcdn)\.net|cdninstagram\.com|fbcdn\.net|pbs\.twimg\.com|video\.twimg\.com|video\.xx\.fbcdn\.net|media\.tenor\.com)/i;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

function isMediaUrl(url: string): boolean {
  return MEDIA_EXT.test(url) || MEDIA_HOST.test(url);
}

function kindOf(url: string): "image" | "video" {
  return VIDEO_EXT.test(url) || /video\.twimg|video\.xx\.fbcdn/i.test(url)
    ? "video"
    : "image";
}

/** Turn a leftover CDN URL in the body into an inline image/video. */
export function resolveInboxBody(
  text: string,
  attachment?: InboxAttachment | null,
): { text: string; attachment: InboxAttachment | null } {
  if (attachment?.url) return { text, attachment };
  const matches = text.match(URL_RE);
  if (!matches) return { text, attachment: attachment ?? null };
  for (const raw of matches) {
    const url = raw.replace(/[),.;]+$/, "");
    if (!isMediaUrl(url)) continue;
    return {
      text: text.replace(raw, "").replace(/\s+/g, " ").trim(),
      attachment: { type: kindOf(url), url },
    };
  }
  return { text, attachment: attachment ?? null };
}
