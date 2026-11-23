import { createContext, useContext } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  TeamGetResponse,
  TeamListItem,
  WorkspacesListResponse,
} from "@/api/team";

/**
 * Which workspace the settings page is about. Personal = /dashboard/settings
 * (Main). Team = /dashboard/teams/:teamId/settings (a shared team, or a solo
 * workspace that lives in its own team container).
 */
export type SettingsScope = {
  teamId: string | null;
  /** `/api/team/:id` for team scope. */
  teamQuery: UseQueryResult<TeamGetResponse> | null;
  /** `/api/team/workspaces`, used for names, the active workspace and limits. */
  workspacesQuery: UseQueryResult<WorkspacesListResponse>;
  /** The team row from the workspaces list (has `isCollaborative`). */
  teamListItem: TeamListItem | null;
  /** True for a solo workspace container (no members, no invites). */
  isSolo: boolean;
  /** "Main", the team name, or the solo workspace name. */
  workspaceName: string;
  /** Base for settings links: "/dashboard/settings" or "/dashboard/teams/:id/settings". */
  settingsBase: string;
};

export const SettingsScopeContext = createContext<SettingsScope | null>(null);

export function useSettingsScope(): SettingsScope {
  const ctx = useContext(SettingsScopeContext);
  if (!ctx) throw new Error("useSettingsScope must be used inside SettingsShell");
  return ctx;
}
