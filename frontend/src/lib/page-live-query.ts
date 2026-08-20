/** TanStack Query defaults for live platform data: fetch on page mount only, never in background. */
export const PAGE_LIVE_QUERY = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchInterval: false as const,
  refetchOnMount: true as const,
  // Keep results briefly so Strict Mode remounts / filter toggles don't flash empty.
  staleTime: 30_000,
  gcTime: 5 * 60_000,
};
