/**
 * Safe in-app "back" target after opening a post detail page.
 * Prefer explicit location.state.from (set by calendar/list links).
 */
export function resolvePostDetailBack(from: unknown): {
  href: string;
  label: string;
} {
  const fallback = { href: "/dashboard/posts", label: "Back to posts" };
  if (typeof from !== "string" || !from.startsWith("/dashboard")) {
    return fallback;
  }

  // Never bounce between post detail URLs.
  if (/\/posts\/[0-9a-f-]{36}\b/i.test(from)) {
    return fallback;
  }

  if (from.includes("/calendar")) {
    return { href: from, label: "Back to calendar" };
  }
  if (from.includes("/posts")) {
    return { href: from, label: "Back to posts" };
  }
  return { href: from, label: "Back" };
}

export type PostDetailLocationState = {
  from?: string;
};
