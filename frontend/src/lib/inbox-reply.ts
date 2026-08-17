/** Which platforms accept replying to a specific comment vs thread root only. */

const NESTED_REPLY_PLATFORMS = new Set([
  "twitter_x",
  "bluesky",
  "youtube",
  "threads",
]);

export function inboxSupportsNestedReplies(platform: string): boolean {
  return NESTED_REPLY_PLATFORMS.has(platform);
}

/** Platform API target id — IG/FB always reply to the top-level comment. */
export function inboxReplyTargetId(
  platform: string,
  rootCommentId: string,
  targetCommentId: string,
): string {
  if (inboxSupportsNestedReplies(platform)) return targetCommentId;
  return rootCommentId;
}

function handleOf(raw: string | null | undefined): string {
  return (raw ?? "").replace(/^@/, "").trim();
}

/** True if `text` already starts with @handle (any casing). */
export function inboxTextHasLeadingMention(text: string, handle: string): boolean {
  const h = handleOf(handle);
  if (!h) return false;
  return new RegExp(`^@${h}\\b`, "i").test(text.trim());
}

/**
 * Build the text we send.
 * X auto-tags the parent author — strip a leading @ so we don't double-tag.
 * Other nested-reply networks get one @handle if it's missing.
 */
export function formatInboxReplyText(opts: {
  platform: string;
  targetHandle: string | null | undefined;
  isRoot: boolean;
  text: string;
}): string {
  const text = opts.text.trim();
  const handle = handleOf(opts.targetHandle);
  if (!handle) return text;
  const mention = `@${handle}`;
  const has = inboxTextHasLeadingMention(text, handle);

  if (opts.platform === "twitter_x") {
    if (!has) return text;
    return text.replace(new RegExp(`^@${handle}\\s*`, "i"), "").trim();
  }
  if (opts.isRoot) return text;
  if (has) return text;
  return text ? `${mention} ${text}` : mention;
}
