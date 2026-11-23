import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadSettingsPageData, type SettingsSnapshot } from "@/api/settings";
import { useSession } from "@/lib/auth-client";

export const SETTINGS_QUERY_KEY = ["settings-page"] as const;

export type SettingsPageData = Awaited<ReturnType<typeof loadSettingsPageData>>;

/** Profile + user settings (timezone, formats, email prefs). */
export function useSettingsData() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: loadSettingsPageData,
    enabled: !!session,
    staleTime: 30_000,
  });
}

/**
 * After a confirmed save: patch the settings cache in place (no refetch
 * fighting the field) and mark every other query stale so pages that show
 * times or names pick the change up the next time they mount.
 */
export function useApplySettingsPatch() {
  const queryClient = useQueryClient();
  return useCallback(
    (patch: Partial<SettingsSnapshot> & { displayName?: string; email?: string; image?: string | null }) => {
      const { displayName, email, image, ...settings } = patch;
      queryClient.setQueryData<SettingsPageData>(SETTINGS_QUERY_KEY, (prev) =>
        prev
          ? {
              ...prev,
              ...(displayName !== undefined ? { displayName } : {}),
              ...(email !== undefined ? { email } : {}),
              ...(image !== undefined ? { image } : {}),
              settings: { ...prev.settings, ...settings },
            }
          : prev,
      );
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== SETTINGS_QUERY_KEY[0],
        refetchType: "none",
      });
      if (displayName !== undefined || image !== undefined) {
        // Sidebar avatar/name.
        void queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] });
      }
    },
    [queryClient],
  );
}
