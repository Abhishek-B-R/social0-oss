import type { QueryClient } from "@tanstack/react-query";

export const WORKSPACES_QUERY_KEY = ["workspaces"] as const;
export const WORKSPACE_BOARD_QUERY_KEY = ["workspace-board"] as const;

export function teamQueryKey(teamId: string) {
  return ["team", teamId] as const;
}

export function teamInvitationsQueryKey(teamId: string) {
  return ["team", teamId, "invitations"] as const;
}

/** Invalidate all team/workspace React Query caches after a mutation. */
export async function invalidateTeamRoomQueries(
  queryClient: QueryClient,
  teamId?: string | null,
) {
  const tasks = [
    queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: WORKSPACE_BOARD_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ["team"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
    queryClient.invalidateQueries({ queryKey: ["connections"] }),
    queryClient.invalidateQueries({ queryKey: ["analytics-overview"] }),
    queryClient.invalidateQueries({ queryKey: ["analytics-accounts"] }),
    queryClient.invalidateQueries({ queryKey: ["inbox-comments"] }),
    queryClient.invalidateQueries({ queryKey: ["inbox-dms"] }),
    queryClient.invalidateQueries({ queryKey: ["inbox-accounts"] }),
    queryClient.invalidateQueries({ queryKey: ["inbox-dm-thread"] }),
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
