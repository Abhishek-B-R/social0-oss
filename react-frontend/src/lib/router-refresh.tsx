import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

type RouterRefreshContextValue = {
  refresh: () => void;
};

const RouterRefreshContext = createContext<RouterRefreshContextValue>({
  refresh: () => {},
});

/** Mirrors Next.js router.refresh() — refetch client queries instead of reloading the page. */
export function RouterRefreshProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const value = useMemo(() => ({ refresh }), [refresh]);

  return (
    <RouterRefreshContext.Provider value={value}>
      {children}
    </RouterRefreshContext.Provider>
  );
}

export function useRouterRefresh() {
  return useContext(RouterRefreshContext);
}
