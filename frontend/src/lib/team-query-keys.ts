import type { QueryClient } from "@tanstack/react-query";

export const WORKSPACES_QUERY_KEY = ["workspaces"] as const;
export const WORKSPACE_BOARD_QUERY_KEY = ["workspace-board"] as const;

export function teamQueryKey(teamId: string) {
  return ["team", teamId] as const;
}

export function teamInvitationsQueryKey(teamId: string) {
  return ["team", teamId, "invitations"] as const;
}

/**
 * Caches that hold the active workspace's data. Most of these keys carry no
 * workspace id (switching between personal workspaces keeps the same URL),
 * so the same key serves whichever workspace was active when it was fetched.
 */
const WORKSPACE_DATA_QUERY_PREFIXES = [
  ["dashboard-layout"],
  ["connections"],
  ["analytics-overview"],
  ["analytics-accounts"],
  ["inbox-comments"],
  ["inbox-dms"],
  ["inbox-accounts"],
  ["inbox-dm-thread"],
  ["dashboard-home"],
  ["queue-next-slot"],
  ["queue"],
  ["queue-slots"],
  ["calendar-page"],
  ["posts-page"],
  ["adjacent-posts"],
  ["automations"],
  ["settings-page"],
  ["composer-settings"],
  ["command-palette"],
  ["analytics-overview-prev"],
  ["bulk-tools-gate"],
] as const;

/** Invalidate all team/workspace React Query caches after a mutation. */
export async function invalidateTeamRoomQueries(
  queryClient: QueryClient,
  teamId?: string | null,
) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: WORKSPACE_BOARD_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ["team"] }),
    ...WORKSPACE_DATA_QUERY_PREFIXES.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  ];
  if (teamId) {
    tasks.push(
      queryClient.invalidateQueries({ queryKey: teamQueryKey(teamId) }),
      queryClient.invalidateQueries({
        queryKey: teamInvitationsQueryKey(teamId),
      }),
    );
  }
  await Promise.all(tasks);
}

/**
 * Call after the server's active workspace changed without a full reload.
 * Invalidating alone keeps an inactive query's data, so the next page to
 * mount that key (Posts, Calendar, the composer's next slot…) would render
 * the previous workspace's rows until its refetch lands. Drop those inactive
 * entries outright so they load fresh, then refetch everything still mounted.
 */
export async function resetWorkspaceDataQueries(
  queryClient: QueryClient,
  teamId?: string | null,
) {
  for (const queryKey of WORKSPACE_DATA_QUERY_PREFIXES) {
    queryClient.removeQueries({ queryKey, type: "inactive" });
  }
  await invalidateTeamRoomQueries(queryClient, teamId);
}
