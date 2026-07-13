import { listPosts, getPost } from "../api/posts.js";
import type { PostDetail, PostSummary } from "../types/index.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Short prefix for display-only confirmations (never for commands). */
export function shortId(id: string, len = 8): string {
  return id.slice(0, len);
}

/**
 * Resolve a full UUID or unique ID prefix to a post ID.
 * Lists recent posts when given a short prefix so `social0 publish 76fd5d64` works.
 */
export async function resolvePostId(ref: string): Promise<string> {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error("Post ID is required.");
  }
  if (isUuid(trimmed)) {
    return trimmed;
  }

  // Prefer exact get if the API accepts short ids in the future; otherwise scan lists.
  try {
    const post = await getPost(trimmed);
    if (post?.id) return post.id;
  } catch {
    // fall through to prefix search
  }

  const matches = await findPostsByPrefix(trimmed);
  if (matches.length === 1) return matches[0].id;
  if (matches.length === 0) {
    throw new Error(
      `Post not found for "${trimmed}". Use the full UUID from \`social0 post list --json\` or \`social0 export\`.`,
    );
  }
  throw new Error(
    `Ambiguous post ID prefix "${trimmed}" matches ${matches.length} posts. Use a longer prefix or the full UUID.`,
  );
}

async function findPostsByPrefix(prefix: string): Promise<PostSummary[]> {
  const lower = prefix.toLowerCase();
  const seen = new Map<string, PostSummary>();

  // Cover common status filters; unfiltered list may omit drafts depending on API defaults
  for (const status of [undefined, "draft", "scheduled"] as const) {
    const result = await listPosts({ status, limit: 100 });
    for (const post of result.data) {
      if (post.id.toLowerCase().startsWith(lower)) {
        seen.set(post.id, post);
      }
    }
  }

  return [...seen.values()];
}

export async function resolvePost(ref: string): Promise<PostDetail> {
  const id = await resolvePostId(ref);
  return getPost(id);
}
