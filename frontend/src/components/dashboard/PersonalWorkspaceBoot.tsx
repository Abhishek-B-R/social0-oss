import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listWorkspaces } from "@/api/team";
import {
  isPersonalOnlyDashboardPath,
  isTeamAppPath,
  isTeamSettingsPath,
  mapPathToBase,
  writePersonalWorkspaceId,
} from "@/lib/dashboard-base-path";
import { useLocation } from "react-router-dom";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { clearTeamBootstrap } from "@/layouts/TeamAppLayout";

/**
 * On personal /dashboard routes (not team app / team settings):
 * - Account pages (billing, settings, api-keys, …) leave the active workspace alone
 * - Team workspace on a mirrored page (composer, posts, …) → redirect into the team URL tree
 */
export function PersonalWorkspaceBoot({ enabled }: { enabled: boolean }) {
  const { pathname, search } = useLocation();
  const ranForPath = useRef<string | null>(null);

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
    if (!enabled || skipBoot || !data) return;
    if (ranForPath.current === pathname) return;

    // Billing / settings / developer / teams list — keep whatever workspace is active.
    // Switching to Main here was wiping team context and felt like a bug.
    if (personalOnly) {
      ranForPath.current = pathname;
      return;
    }

    const active = data.workspaces.find((w) => w.isActive);

    // Team workspace on a mirrored personal URL → team app tree.
    // Covers owned + joined so OAuth select callbacks (always personal paths)
    // keep the team workspace instead of wiping to Main.
    if (
      active?.teamId &&
      (active.kind === "owned" || active.kind === "joined")
    ) {
      ranForPath.current = pathname;
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
    clearTeamBootstrap();
    ranForPath.current = pathname;
  }, [enabled, skipBoot, personalOnly, pathname, search, data]);

  return null;
}
