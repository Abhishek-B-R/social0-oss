import { getDashboardRelativePath } from "@/lib/dashboard-base-path";

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

/** Filters that define which posts ←/→ should walk through. */
export type PostListNavContext = {
  statusFilter?: "scheduled" | "posted" | "draft" | null;
  sort?: "newest" | "oldest";
  platform?: string | null;
  time?: string | null;
  account?: string | null;
};

export type PostDetailLocationState = {
  from?: string;
  /** Explicit list filters; when missing, derived from `from`. */
  list?: PostListNavContext;
};

/**
 * Derive adjacent-nav filters from the list URL the user came from
 * (`/posts/posted?platform=…`, `/posts/scheduled`, filtered all-posts, etc.).
 */
export function parsePostListNavContextFromFrom(
  from: unknown,
): PostListNavContext {
  const defaults: PostListNavContext = { sort: "newest" };
  if (typeof from !== "string" || !from.startsWith("/dashboard")) {
    return defaults;
  }

  let url: URL;
  try {
    url = new URL(from, "https://social0.app");
  } catch {
    return defaults;
  }

  const relative = getDashboardRelativePath(url.pathname);
  // Detail → detail (stale from): no status scope.
  if (/^posts\/[0-9a-f-]{36}\b/i.test(relative)) {
    return defaults;
  }

  let statusFilter: PostListNavContext["statusFilter"] = null;
  if (relative === "posts/posted" || relative.startsWith("posts/posted/")) {
    statusFilter = "posted";
  } else if (
    relative === "posts/scheduled" ||
    relative.startsWith("posts/scheduled/")
  ) {
    statusFilter = "scheduled";
  } else if (
    relative === "posts/drafts" ||
    relative.startsWith("posts/drafts/")
  ) {
    statusFilter = "draft";
  } else if (relative === "posts") {
    statusFilter = null;
  } else if (!relative.startsWith("posts")) {
    // Calendar / other entry points: workspace-scoped, no status filter.
    return defaults;
  }

  const sort = url.searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const platform = url.searchParams.get("platform");
  const time = url.searchParams.get("time");
  const account = url.searchParams.get("account");

  return {
    statusFilter,
    sort,
    platform: platform || null,
    time: time || null,
    account: account || null,
  };
}

export function resolvePostListNavContext(
  state: PostDetailLocationState | null | undefined,
): PostListNavContext {
  if (state?.list) return state.list;
  return parsePostListNavContextFromFrom(state?.from);
}
