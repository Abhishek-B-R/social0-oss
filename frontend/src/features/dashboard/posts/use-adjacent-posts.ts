import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { loadAdjacentPosts } from "@/api/dashboard-data";
import { useHotkeys } from "@/components/app";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { resolveListContext, type PostNavState } from "./post-nav";

/**
 * Previous / next post in the list the user came from (tab, filters, search,
 * sort). Shared by the header ‹ › buttons, the desktop edge strips and the
 * J/K + ←/→ shortcuts.
 */
export function useAdjacentPosts(postId: string) {
  const dash = useDashboardPath();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as PostNavState | null) ?? null;
  const from = navState?.from;
  const list = resolveListContext(navState);
  const listKey = JSON.stringify(list);
  const preservedState = useMemo(
    (): PostNavState => ({ from, list: JSON.parse(listKey) as PostNavState["list"] }),
    [from, listKey],
  );

  const { data } = useQuery({
    queryKey: ["adjacent-posts", postId, listKey],
    queryFn: () =>
      loadAdjacentPosts({
        postId,
        statusFilter: list.statusFilter,
        sort: list.sort,
        platform: list.platform,
        time: list.time,
        account: list.account,
        query: list.query,
        source: list.source,
      }),
    enabled: !!postId,
    staleTime: 30_000,
  });

  const prevId =
    data?.ok && data.data.prevId && data.data.prevId !== postId ? data.data.prevId : null;
  const nextId =
    data?.ok && data.data.nextId && data.data.nextId !== postId ? data.data.nextId : null;
  const prevHref = prevId ? dash(`posts/${prevId}`) : null;
  const nextHref = nextId ? dash(`posts/${nextId}`) : null;

  const go = (href: string | null) => (e: KeyboardEvent) => {
    // Leave keys another control already handled (tab lists, menus).
    if (!href || e.defaultPrevented) return;
    e.preventDefault();
    navigate(href, { state: preservedState });
  };
  useHotkeys([
    { keys: "k", enabled: !!prevHref, preventDefault: false, handler: go(prevHref) },
    { keys: "j", enabled: !!nextHref, preventDefault: false, handler: go(nextHref) },
    { keys: "arrowleft", enabled: !!prevHref, preventDefault: false, handler: go(prevHref) },
    { keys: "arrowright", enabled: !!nextHref, preventDefault: false, handler: go(nextHref) },
  ]);

  return { prevHref, nextHref, state: preservedState };
}
