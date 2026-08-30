/** Build a public platform URL for an inbox comment / reply when possible. */

export type InboxCommentUrlInput = {
  id: string;
  platform: string;
  authorHandle: string | null;
  platformPostUrl: string | null;
};

function cleanHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const h = handle.replace(/^@/, "").trim();
  return h || null;
}

/** Permalink for the comment itself (not just the parent post). */
export function inboxCommentPlatformUrl(
  comment: InboxCommentUrlInput,
): string | null {
  if (comment.id.startsWith("optimistic-")) {
    return comment.platformPostUrl;
  }

  const handle = cleanHandle(comment.authorHandle);

  if (comment.platform === "twitter_x" && /^\d+$/.test(comment.id)) {
    return handle
      ? `https://x.com/${encodeURIComponent(handle)}/status/${comment.id}`
      : `https://x.com/i/status/${comment.id}`;
  }

  if (comment.platform === "bluesky") {
    const match = comment.id.match(
      /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)$/,
    );
    if (match) {
      // Prefer DID from the AT URI (stable); handle can change.
      return `https://bsky.app/profile/${encodeURIComponent(match[1]!)}/post/${encodeURIComponent(match[2]!)}`;
    }
  }

  if (comment.platform === "threads" && handle && comment.id) {
    // Threads Graph ids are not public shortcodes; parent post URL is the best we have.
    return comment.platformPostUrl;
  }

  return comment.platformPostUrl;
}

/** Public profile URL for a comment author when the platform supports it. */
export function inboxAuthorProfileUrl(input: {
  platform: string;
  authorHandle: string | null;
}): string | null {
  const handle = cleanHandle(input.authorHandle);
  if (!handle) return null;

  switch (input.platform) {
    case "twitter_x":
      return `https://x.com/${encodeURIComponent(handle)}`;
    case "instagram":
      return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
    case "threads":
      return `https://www.threads.net/@${encodeURIComponent(handle)}`;
    case "bluesky":
      return `https://bsky.app/profile/${encodeURIComponent(handle)}`;
    case "youtube":
      return handle.startsWith("UC")
        ? `https://www.youtube.com/channel/${encodeURIComponent(handle)}`
        : `https://www.youtube.com/@${encodeURIComponent(handle)}`;
    case "linkedin":
      return `https://www.linkedin.com/in/${encodeURIComponent(handle)}`;
    case "facebook":
      return `https://www.facebook.com/${encodeURIComponent(handle)}`;
    default:
      return null;
  }
}
