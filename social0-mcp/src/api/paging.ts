/**
 * Live inbox lists page by *publication*, not by comment. A page can be
 * legitimately empty while `has_more` is true (the newest N posts simply had
 * no comments in the window), and a model that stops at "0 results" or loops
 * on the same cursor gets the wrong answer. Follow the cursor once
 * automatically; past that, the tool result says so and hands over the cursor.
 */

export type PagedList = {
  has_more: boolean;
  next_before: string | null;
};

export function isEmptyPageWithMore(
  page: PagedList,
  items: readonly unknown[],
): boolean {
  return items.length === 0 && page.has_more && Boolean(page.next_before);
}

export async function fetchWithOneAutoPage<T extends PagedList>(
  fetchPage: (before: string | undefined) => Promise<T>,
  itemsOf: (page: T) => readonly unknown[],
  initialBefore: string | undefined,
): Promise<{ page: T; autoPaged: boolean }> {
  const first = await fetchPage(initialBefore);
  if (!isEmptyPageWithMore(first, itemsOf(first))) {
    return { page: first, autoPaged: false };
  }
  const second = await fetchPage(first.next_before ?? undefined);
  return { page: second, autoPaged: true };
}

/** Explicit instruction for an empty page that still has older pages. */
export function emptyPageWithMoreNote(
  kind: "comment threads" | "conversations",
  nextBefore: string,
): string {
  return `0 ${kind} on this page, but has_more is true: older ${
    kind === "comment threads" ? "publications" : "conversations"
  } remain. Call again with before="${nextBefore}" to keep scanning, or widen the range.`;
}
