import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { DateWindow, DateWindowRange } from "@/lib/date-window";
import { windowQueryParams } from "@/lib/date-window";
import { nextInboxPageParam } from "./inbox-page-param";

export type InboxPageParam = {
  range: DateWindowRange;
  since?: string;
  until?: string;
  before?: string;
};

export function initialInboxPageParam(dateWindow: DateWindow): InboxPageParam {
  return windowQueryParams(dateWindow);
}

/** Poll/manual refresh: replace page 0; drop older infinite pages so banners stay current. */
export async function refreshInboxInfiniteFirstPage<TPage>(
  qc: QueryClient,
  queryKey: readonly unknown[],
  fetchFirstPage: () => Promise<TPage>,
): Promise<void> {
  try {
    const first = await fetchFirstPage();
    const pageParam = undefined;
    qc.setQueryData<InfiniteData<TPage>>(queryKey, (old) => {
      if (!old?.pages.length) {
        return { pages: [first], pageParams: [pageParam] };
      }
      // Keep only the refreshed first page - older pages can carry stale
      // reconnect / fetch-error banners after a reconnect.
      return {
        pages: [first],
        pageParams: [old.pageParams[0] ?? pageParam],
      };
    });
  } catch {
    // Background poll - ignore.
  }
}

export { nextInboxPageParam };
