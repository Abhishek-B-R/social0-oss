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
 * - Team workspace (owned or joined) on a mirrored page → team app tree
 * - Personal-only account pages (billing/settings/…) with a non-Main
 *   workspace active → switch to Main so actor-scoped pages work
 */
export function PersonalWorkspaceBoot({ enabled }: { enabled: boolean }) {
  const { pathname, search } = useLocation();
  const queryClient = useQueryClient();
  const ran = useRef(false);

  const onTeamTree =
    isTeamAppPath(pathname) || isTeamSettingsPath(pathname);
  const personalOnly = isPersonalOnlyDashboardPath(pathname);
  const skipBoot = onTeamTree;

  const { data } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: enabled && !skipBoot,
  });

  useEffect(() => {
    if (!enabled || skipBoot || !data || ran.current) return;

    const active = data.workspaces.find((w) => w.isActive);

    // Personal-only account routes must run as Main (actor context).
    if (personalOnly) {
      if (!active || active.kind === "personal" || active.id == null) {
        writePersonalWorkspaceId(null);
        ran.current = true;
        return;
      }
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
    }

    // Team workspace on a mirrored personal URL → team app tree.
    // Covers owned + joined so OAuth select callbacks (always personal paths)
    // keep the team workspace instead of wiping to Main.
    if (
      active?.teamId &&
      (active.kind === "owned" || active.kind === "joined")
    ) {
      ran.current = true;
      const dest = mapPathToBase(
        pathname,
        `/dashboard/teams/${active.teamId}`,
      );
      const withSearch =
        (dest.startsWith(`/dashboard/teams/${active.teamId}`)
          ? dest
          : `/dashboard/teams/${active.teamId}/composer`) + search;
      window.location.assign(withSearch);
      return;
    }

    // Already on Main
    writePersonalWorkspaceId(null);
    ran.current = true;
  }, [enabled, skipBoot, personalOnly, pathname, search, data, queryClient]);

  return null;
}
