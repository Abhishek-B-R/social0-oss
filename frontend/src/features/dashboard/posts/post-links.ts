/** Shared link + button helpers for the Posts table and post detail. */
import type { PostListItem } from "./posts-model";

export const rowButtonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-bg-elevated px-3 text-[13px] font-medium text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 touch:h-10";

/** Row-level action in lists: ghost, no border (POLISH rule 7). */
export const rowQuietClass =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-text transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 touch:h-10";

/** Composer URL (`/new`) that edits this post in the right mode. */
export function editHref(
  dash: (s?: string) => string,
  item: Pick<PostListItem, "id" | "uiStatus">,
): string {
  const mode =
    item.uiStatus === "draft" ? "draft" : item.uiStatus === "scheduled" ? "scheduled" : "edit";
  return dash(`new?${mode}=${item.id}`);
}
