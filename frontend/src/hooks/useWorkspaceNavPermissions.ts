import { useQuery } from "@tanstack/react-query";
import { loadDashboardLayoutData } from "@/api/dashboard-data";
import { useSession } from "@/lib/auth-client";

/** Workspace role gates. Deny until layout loads; deny on error (no optimistic allow). */
export function useWorkspaceNavPermissions() {
  const { data: session } = useSession();
  const query = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    enabled: !!session,
    staleTime: 60_000,
  });

  const ready = query.isSuccess;

  return {
    ready,
    canCreatePosts: ready ? (query.data?.canCreatePosts ?? false) : false,
    canViewAnalytics: ready ? (query.data?.canViewAnalytics ?? false) : false,
    canViewInbox: ready ? (query.data?.canViewInbox ?? false) : false,
    canReplyComments: ready ? (query.data?.canReplyComments ?? false) : false,
    canReplyDms: ready ? (query.data?.canReplyDms ?? false) : false,
  };
}
