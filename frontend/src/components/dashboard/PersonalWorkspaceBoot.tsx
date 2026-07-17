import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listWorkspaces, switchWorkspace } from "@/api/team";
import {
  isTeamAppPath,
  readPersonalWorkspaceId,
  writePersonalWorkspaceId,
} from "@/lib/dashboard-base-path";
import { useLocation } from "react-router-dom";

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

/**
 * On personal /dashboard routes, restore the last personal workspace from
 * localStorage and never leave the user on a joined-team workspace.
 */
export function PersonalWorkspaceBoot({ enabled }: { enabled: boolean }) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const ran = useRef(false);

  const { data } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: enabled && !isTeamAppPath(pathname),
  });

  useEffect(() => {
    if (!enabled || isTeamAppPath(pathname) || !data || ran.current) return;

    const active = data.workspaces.find((w) => w.isActive);
    const desired = readPersonalWorkspaceId();

    const isOwnedOrMain = (id: string | null | undefined) => {
      if (id == null) return true;
      const item = data.workspaces.find((w) => w.id === id);
      return item?.kind === "owned" || item?.kind === "personal";
    };

    // Desired from LS must be Main or an owned workspace
    const targetId = isOwnedOrMain(desired) ? desired : null;

    const activeIsJoined = active?.kind === "joined";
    const activeMismatch =
      (active?.id ?? null) !== targetId &&
      !(active?.id == null && targetId == null);

    if (!activeIsJoined && !activeMismatch) {
      // Persist current personal selection
      if (active?.kind === "personal" || active?.kind === "owned" || !active) {
        writePersonalWorkspaceId(active?.id ?? null);
      }
      ran.current = true;
      return;
    }

    ran.current = true;
    let cancelled = false;
    (async () => {
      try {
        await switchWorkspace(targetId);
        writePersonalWorkspaceId(targetId);
        if (!cancelled) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
            queryClient.invalidateQueries({ queryKey: ["team"] }),
            queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
            queryClient.invalidateQueries({ queryKey: ["connections"] }),
          ]);
          // Soft reload so connection-scoped pages pick up the new workspace
          window.location.reload();
        }
      } catch {
        // leave user as-is if switch fails
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, pathname, data, queryClient]);

  return null;
}
