import { Navigate } from "react-router-dom";

/**
 * Old /dashboard/teams. The team list now lives in Settings → Members
 * (personal), next to "Create team". Kept as a redirect so links still work.
 */
export function TeamsPage() {
  return <Navigate to="/dashboard/settings/members" replace />;
}
