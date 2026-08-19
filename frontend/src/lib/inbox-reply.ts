/** Which platforms accept replying to a specific comment vs thread root only. */

const NESTED_REPLY_PLATFORMS = new Set([
  "twitter_x",
  "bluesky",
  "threads",
  "facebook",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function inboxSupportsNestedReplies(platform: string): boolean {
  return NESTED_REPLY_PLATFORMS.has(platform);
}

/** Platform API target id - Instagram/Facebook always reply to the top-level comment. */
export function inboxReplyTargetId(
  platform: string,
  rootCommentId: string,
  targetCommentId: string,
): string {
  if (platform === "instagram" || platform === "facebook") return rootCommentId;
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
  return new RegExp(`^@${escapeRegExp(h)}\\b`, "i").test(text.trim());
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
    return text
      .replace(new RegExp(`^@${escapeRegExp(handle)}\\s*`, "i"), "")
      .trim();
  }
  if (opts.isRoot) return text;
  if (opts.platform === "facebook") {
    const mention = /^\d+$/.test(handle) ? `@[${handle}]` : `@${handle}`;
    if (text.startsWith(mention) || has) return text;
    return text ? `${mention} ${text}` : mention;
  }
  if (has) return text;
  return text ? `${mention} ${text}` : mention;
}

/** Composer cap minus the @mention formatInboxReplyText will prepend. */
export function inboxReplyDraftMax(opts: {
  platform: string;
  targetHandle: string | null | undefined;
  isRoot: boolean;
  limit: number;
}): number {
  const sent = formatInboxReplyText({ ...opts, text: "x" });
  return Math.max(0, opts.limit - Math.max(0, sent.length - 1));
}

/** Compare reply bodies after platform-specific mention normalization. */
export function inboxReplyTextsMatch(
  platform: string,
  a: string,
  b: string,
  targetHandle?: string | null,
): boolean {
  if ((a || "") === (b || "")) return true;
  if (platform !== "twitter_x" || !targetHandle) return false;
  return (
    formatInboxReplyText({
      platform,
      targetHandle,
      isRoot: false,
      text: a,
    }) ===
    formatInboxReplyText({
      platform,
      targetHandle,
      isRoot: false,
      text: b,
    })
  );
}
