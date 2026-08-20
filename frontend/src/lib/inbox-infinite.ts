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

/** Poll refresh: replace page 0 only so older infinite pages are not re-fetched. */
export async function refreshInboxInfiniteFirstPage<TPage>(
  qc: QueryClient,
  queryKey: readonly unknown[],
  fetchFirstPage: () => Promise<TPage>,
): Promise<void> {
  try {
    const first = await fetchFirstPage();
    qc.setQueryData<InfiniteData<TPage>>(queryKey, (old) => {
      if (!old?.pages.length) {
        return { pages: [first], pageParams: [undefined] };
      }
      return {
        ...old,
        pages: [first, ...old.pages.slice(1)],
      };
    });
  } catch {
    // Background poll — ignore.
  }
}

export { nextInboxPageParam };
