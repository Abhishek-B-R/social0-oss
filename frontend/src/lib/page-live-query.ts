/** TanStack Query defaults for live platform data: fetch on page mount only, never in background. */
export const PAGE_LIVE_QUERY = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchInterval: false as const,
  refetchOnMount: "always" as const,
  gcTime: 0,
};
