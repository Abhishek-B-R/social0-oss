import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listWorkspaces, switchWorkspace } from "@/api/team";
import {
  isPersonalOnlyDashboardPath,
  isTeamAppPath,
  isTeamSettingsPath,
  mapPathToBase,
  writePersonalWorkspaceId,
} from "@/lib/dashboard-base-path";
import { useLocation } from "react-router-dom";

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

/**
 * On personal /dashboard routes (not team app / team settings):
 * - Leave account-level pages alone (settings, billing, developer, …)
 * - Owned workspace on a mirrored page → `/dashboard/teams/:teamId/*`
 * - Joined workspace on mirrored personal URLs → switch back to Main
 */
export function PersonalWorkspaceBoot({ enabled }: { enabled: boolean }) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const ran = useRef(false);

  const skipBoot =
    isTeamAppPath(pathname) ||
    isTeamSettingsPath(pathname) ||
    isPersonalOnlyDashboardPath(pathname);

  const { data } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: enabled && !skipBoot,
  });

  useEffect(() => {
    if (!enabled || skipBoot || !data || ran.current) return;

    const active = data.workspaces.find((w) => w.isActive);

    // Owned team workspace on a mirrored personal URL → team app tree
    if (active?.kind === "owned" && active.teamId) {
      ran.current = true;
      const dest = mapPathToBase(
        pathname,
        `/dashboard/teams/${active.teamId}`,
      );
      window.location.assign(
        dest.startsWith(`/dashboard/teams/${active.teamId}`)
          ? dest
          : `/dashboard/teams/${active.teamId}/composer`,
      );
      return;
    }

    // Already on Main
    if (!active || active.kind === "personal" || active.id == null) {
      writePersonalWorkspaceId(null);
      ran.current = true;
      return;
    }

    // Joined on personal URL → force Main
    ran.current = true;
    let cancelled = false;
    (async () => {
      try {
        await switchWorkspace(null);
        writePersonalWorkspaceId(null);
        if (!cancelled) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
            queryClient.invalidateQueries({ queryKey: ["team"] }),
            queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
            queryClient.invalidateQueries({ queryKey: ["connections"] }),
          ]);
          window.location.reload();
        }
      } catch {
        // leave user as-is if switch fails
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, skipBoot, pathname, data, queryClient]);

  return null;
}
