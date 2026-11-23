import { useLocation, useParams } from "react-router-dom";
import { getTeamIdFromPathname } from "@/lib/dashboard-base-path";

/**
 * Team-aware link helpers. Implementation lives in
 * `@/lib/dashboard-base-path` (shared with the shell); re-exported here so
 * pages import everything from `@/components/app`.
 *
 *   const dash = useDashboardPath();
 *   dash("/posts")          // "/dashboard/posts" or "/dashboard/teams/:teamId/posts"
 *   dash("posts?tab=failed")
 *   dash()                  // workspace home
 */
export {
  useDashboardPath,
  useDashboardBasePath,
  dashboardPathFor,
  getDashboardRelativePath,
} from "@/lib/dashboard-base-path";

/** Team id when the current route is inside `/dashboard/teams/:teamId/*`, else null. */
export function useTeamId(): string | null {
  const params = useParams<{ teamId?: string }>();
  const { pathname } = useLocation();
  if (params.teamId && params.teamId !== "create") return params.teamId;
  return getTeamIdFromPathname(pathname);
}
