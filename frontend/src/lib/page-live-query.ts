/** TanStack Query defaults for live platform data: fetch on page mount only, never in background. */
export const PAGE_LIVE_QUERY = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchInterval: false as const,
  refetchOnMount: true as const,
  // Align with server soft-fresh / Redis TTLs so remounts and chip toggles
  // reuse warm data instead of re-fanning out to platforms.
  staleTime: 120_000,
  gcTime: 10 * 60_000,
};
