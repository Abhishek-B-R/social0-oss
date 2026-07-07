import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Invalidate all React Query caches after a mutation. */
export function useInvalidateQueries() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);
}
