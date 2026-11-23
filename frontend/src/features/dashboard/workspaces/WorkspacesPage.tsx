import { Navigate } from "react-router-dom";

/**
 * Old /dashboard/workspaces. Workspace management now lives in
 * Settings → All workspaces (`WorkspacesBoard`). Kept as a redirect so the
 * switcher's "Manage" link, the More page and bookmarks keep working.
 */
export function WorkspacesPage() {
  return <Navigate to="/dashboard/settings/workspaces" replace />;
}
