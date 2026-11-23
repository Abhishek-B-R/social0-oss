/**
 * List context carried from the Posts table into a post detail page, so
 * prev/next (J/K, ←/→) walks the same filtered list and "Back" returns to it.
 */
import type { PostsStatusFilter } from "@/api/dashboard";
import { getDashboardRelativePath } from "@/lib/dashboard-base-path";
import {
  LEGACY_POSTS_SEGMENT_TO_TAB,
  POSTS_TAB_LABELS,
  type PostsTab,
} from "@/lib/dashboard-routes";
import { parsePostsTab, TAB_STATUS_FILTER } from "./posts-model";

export type PostsListContext = {
  tab: PostsTab;
  statusFilter: PostsStatusFilter;
  sort: "newest" | "oldest";
  platform: string | null;
  time: string | null;
  account: string | null;
  query: string | null;
  /** Source filter token (`?source=`). */
  source: string | null;
};

/** Location state set by every link into a post detail page. */
export type PostNavState = {
  /** Path + search of the page the user came from. */
  from?: string;
  list?: PostsListContext;
};

const DEFAULT_CONTEXT: PostsListContext = {
  tab: "all",
  statusFilter: null,
  sort: "newest",
  platform: null,
  time: null,
  account: null,
  query: null,
  source: null,
};

const VALID_FILTERS = new Set<string>([
  "scheduled",
  "posted",
  "published",
  "draft",
  "user_draft",
  "needs_review",
  "failed",
]);

/** Context for the Posts page's current search params. */
export function listContextFromParams(params: URLSearchParams): PostsListContext {
  const tab = parsePostsTab(params.get("tab"));
  return {
    tab,
    statusFilter: TAB_STATUS_FILTER[tab],
    sort: params.get("sort") === "oldest" ? "oldest" : "newest",
    platform: params.get("platform") || null,
    time: params.get("time") || null,
    account: params.get("account") || null,
    query: params.get("q")?.trim() || null,
    source: params.get("source") || null,
  };
}

/** Derive the context from a `from` URL (Posts page, legacy status routes). */
export function listContextFromFrom(from: unknown): PostsListContext {
  if (typeof from !== "string" || !from.startsWith("/dashboard")) return DEFAULT_CONTEXT;
  let url: URL;
  try {
    url = new URL(from, "https://social0.app");
  } catch {
    return DEFAULT_CONTEXT;
  }
  const relative = getDashboardRelativePath(url.pathname);
  if (relative === "posts") return listContextFromParams(url.searchParams);
  const legacy = /^posts\/(drafts|scheduled|posted)\b/.exec(relative)?.[1];
  if (legacy) {
    const params = new URLSearchParams(url.searchParams);
    params.set("tab", LEGACY_POSTS_SEGMENT_TO_TAB[legacy]);
    return listContextFromParams(params);
  }
  return DEFAULT_CONTEXT;
}

function isContext(v: unknown): v is Partial<PostsListContext> {
  return v != null && typeof v === "object";
}

/** Context from location state: explicit `list` first, then `from`. */
export function resolveListContext(state: unknown): PostsListContext {
  const s = isContext(state) ? (state as PostNavState) : null;
  const list = s?.list;
  if (isContext(list)) {
    const statusFilter =
      typeof list.statusFilter === "string" && VALID_FILTERS.has(list.statusFilter)
        ? (list.statusFilter as PostsStatusFilter)
        : null;
    return {
      ...DEFAULT_CONTEXT,
      ...list,
      tab: parsePostsTab(list.tab),
      statusFilter,
      sort: list.sort === "oldest" ? "oldest" : "newest",
    };
  }
  return listContextFromFrom(s?.from);
}

/**
 * Where "Back" goes from a post detail page. Prefers the page the user came
 * from (posts list with its filters, calendar, home); otherwise the Posts tab
 * the post belongs to.
 */
export function resolveBack(
  from: unknown,
  fallbackHref: string,
): { href: string; label: string; fromPosts: boolean } {
  if (typeof from !== "string" || !from.startsWith("/dashboard")) {
    return { href: fallbackHref, label: "Posts", fromPosts: true };
  }
  // Never bounce between post detail URLs.
  if (/\/posts\/[0-9a-f-]{36}\b/i.test(from)) {
    return { href: fallbackHref, label: "Posts", fromPosts: true };
  }
  const relative = (() => {
    try {
      return getDashboardRelativePath(new URL(from, "https://social0.app").pathname);
    } catch {
      return "";
    }
  })();
  if (relative.startsWith("posts")) return { href: from, label: "Posts", fromPosts: true };
  if (relative.startsWith("calendar")) return { href: from, label: "Calendar", fromPosts: false };
  if (relative === "" || relative.startsWith("home")) return { href: from, label: "Home", fromPosts: false };
  if (relative.startsWith("analytics")) return { href: from, label: "Analytics", fromPosts: false };
  if (relative.startsWith("automations")) return { href: from, label: "Automations", fromPosts: false };
  if (relative.startsWith("inbox")) return { href: from, label: "Inbox", fromPosts: false };
  return { href: from, label: "Back", fromPosts: false };
}

export function tabLabel(tab: PostsTab): string {
  return POSTS_TAB_LABELS[tab];
}
