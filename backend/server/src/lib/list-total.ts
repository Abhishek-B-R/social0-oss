/**
 * The total row count of a paginated list, without `count(*)` when the page
 * already tells us. A page that came back partly full is the last one, so the
 * total is everything before it plus what it holds. Only a full page, or an
 * empty page past the start (the caller paged beyond the end), needs the
 * count. Exact either way, unlike a cached count.
 */
export async function listTotal(
  offset: number,
  limit: number,
  rowsOnPage: number,
  count: () => Promise<number>,
): Promise<number> {
  const knownFromPage = rowsOnPage < limit && (rowsOnPage > 0 || offset === 0);
  return knownFromPage ? offset + rowsOnPage : count();
}
