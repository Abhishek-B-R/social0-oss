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
