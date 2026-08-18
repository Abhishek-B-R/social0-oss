import { useQuery } from "@tanstack/react-query";
import { loadDashboardLayoutData } from "@/api/dashboard-data";
import { useSession } from "@/lib/auth-client";

/** Defaults to full access until layout loads so personal dashboards do not flicker. */
export function useWorkspaceNavPermissions() {
  const { data: session } = useSession();
  const { data } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: loadDashboardLayoutData,
    enabled: !!session,
    staleTime: 60_000,
  });

  return {
    canCreatePosts: data?.canCreatePosts ?? true,
    canViewAnalytics: data?.canViewAnalytics ?? true,
    canViewInbox: data?.canViewInbox ?? true,
    canReplyComments: data?.canReplyComments ?? true,
    canReplyDms: data?.canReplyDms ?? true,
  };
}
