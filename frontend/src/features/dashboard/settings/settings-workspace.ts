import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTeamById, listWorkspaces } from "@/api/team";
import { useSession } from "@/lib/auth-client";
import { teamQueryKey, WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";

/**
 * Which workspace a settings route is about, shared by the settings page and
 * the settings sidebar (same query keys, so one fetch serves both).
 * `teamId` null = personal settings (Main).
 */
export function useSettingsWorkspace(teamId: string | null) {
  const { data: session } = useSession();
  const workspacesQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: !!session,
  });
  const teamQuery = useQuery({
    queryKey: teamQueryKey(teamId ?? "none"),
    queryFn: () => getTeamById(teamId!),
    enabled: !!session && !!teamId,
  });

  const teamListItem = useMemo(
    () => (teamId ? (workspacesQuery.data?.teams.find((t) => t.id === teamId) ?? null) : null),
    [teamId, workspacesQuery.data?.teams],
  );
  const isSolo =
    !!teamListItem && teamListItem.kind === "owned" && teamListItem.isCollaborative === false;
  const workspaceName = teamId
    ? isSolo
      ? (teamListItem?.workspaces[0]?.name ?? teamListItem?.name ?? "Workspace")
      : (teamQuery.data?.team?.name ?? teamListItem?.name ?? "Team")
    : "Main";

  return { workspacesQuery, teamQuery, teamListItem, isSolo, workspaceName };
}

// --- "Back to app" -----------------------------------------------------------

const RETURN_KEY = "social0.settings.returnTo";
let lastAppPath: string | null = null;

/** DashboardLayout calls this on every non-settings page, so Back knows where to go. */
export function rememberAppPath(path: string) {
  lastAppPath = path;
  try {
    window.sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* private mode: the in-memory copy is enough */
  }
}

/**
 * Drop the remembered page. Call it after leaving or deleting a team: the
 * remembered path may point inside that team, which no longer opens.
 */
export function forgetAppPath() {
  lastAppPath = null;
  try {
    window.sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* private mode: nothing was stored */
  }
}

/** The last dashboard page opened before settings, if any (this tab only). */
export function lastAppPathBeforeSettings(): string | null {
  if (lastAppPath) return lastAppPath;
  try {
    return window.sessionStorage.getItem(RETURN_KEY);
  } catch {
    return null;
  }
}
