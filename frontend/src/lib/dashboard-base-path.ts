import { useCallback } from "react";
import { useLocation, useParams } from "react-router-dom";

/**
 * Paths that live only under personal /dashboard (not mirrored into team URLs).
 * `settings`, `more` and `agents` are mirrored: team settings live at
 * /dashboard/teams/:teamId/settings[/:section].
 */
const PERSONAL_ONLY_SUFFIXES = new Set([
  "billing",
  "api-keys",
  "feedback",
  "workspaces",
  "teams",
]);

/** Landing page of the dashboard (personal and team). */
export const DASHBOARD_HOME_SEGMENT = "home";

/**
 * Team app shell id from pathname.
 * Returns null for /dashboard/teams, /dashboard/teams/create, and non-team paths.
 */
export function getTeamIdFromPathname(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  // ["dashboard", "teams", ":teamId", ...]
  if (parts[0] !== "dashboard" || parts[1] !== "teams") return null;
  const id = parts[2];
  if (!id || id === "create") return null;
  return id;
}

/** `/dashboard/teams/:teamId/settings` — team management, not the app shell. */
export function isTeamSettingsPath(pathname: string): boolean {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return false;
  const rest = pathname
    .slice(`/dashboard/teams/${teamId}`.length)
    .replace(/^\//, "");
  return rest === "settings" || rest.startsWith("settings/");
}

export function isTeamAppPath(pathname: string): boolean {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return false;
  // Settings is team management, not the team app shell
  if (isTeamSettingsPath(pathname)) return false;
  return true;
}

/**
 * Pages that exist on both trees but, opened on the personal tree, must not
 * be bounced into the active team's tree by PersonalWorkspaceBoot (account
 * settings, the mobile More page, AI agents / API keys).
 */
const BOOT_EXEMPT_SUFFIXES = new Set(["settings", "more", "agents"]);

/** Account-level pages that should not live under a team URL tree. */
export function isPersonalOnlyDashboardPath(pathname: string): boolean {
  if (getTeamIdFromPathname(pathname)) return false;
  const relative = pathname.replace(/^\/dashboard\/?/, "");
  const first = relative.split("/")[0] ?? "";
  return PERSONAL_ONLY_SUFFIXES.has(first) || BOOT_EXEMPT_SUFFIXES.has(first);
}

/**
 * Relative path after the dashboard base.
 * /dashboard/posts/drafts → posts/drafts
 * /dashboard/teams/abc/create → create
 */
export function getDashboardRelativePath(pathname: string): string {
  const teamId = getTeamIdFromPathname(pathname);
  if (teamId) {
    const prefix = `/dashboard/teams/${teamId}`;
    const rest = pathname.slice(prefix.length).replace(/^\//, "");
    return rest || DASHBOARD_HOME_SEGMENT;
  }
  const rest = pathname.replace(/^\/dashboard\/?/, "");
  return rest || DASHBOARD_HOME_SEGMENT;
}

export function useDashboardBasePath(): string {
  const { pathname } = useLocation();
  const params = useParams<{ teamId?: string }>();
  const fromParams =
    params.teamId && params.teamId !== "create" ? params.teamId : null;
  const fromPath = getTeamIdFromPathname(pathname);
  const teamId = fromParams ?? fromPath;
  // Stay in the team URL tree for both the app shell and team settings.
  if (teamId && (isTeamAppPath(pathname) || isTeamSettingsPath(pathname))) {
    return `/dashboard/teams/${teamId}`;
  }
  return "/dashboard";
}

/** Pure version of `useDashboardPath` for code outside React. */
export function dashboardPathFor(base: string, suffix = ""): string {
  // Accept "posts", "/posts", "/dashboard/posts" and keep ?query / #hash.
  const clean = suffix.replace(/^\/+/, "").replace(/^dashboard(\/|$)/, "");
  if (!clean) return `${base}/${DASHBOARD_HOME_SEGMENT}`;
  const first = clean.split(/[/?#]/)[0] ?? "";
  if (PERSONAL_ONLY_SUFFIXES.has(first)) {
    return `/dashboard/${clean}`;
  }
  return `${base}/${clean}`;
}

/**
 * Team-aware link builder. `dash("/posts")` → `/dashboard/posts` on personal
 * routes and `/dashboard/teams/:teamId/posts` inside a team. Account-level
 * pages (billing, teams, workspaces, feedback) always resolve to personal.
 */
export function useDashboardPath() {
  const base = useDashboardBasePath();
  return useCallback((suffix = "") => dashboardPathFor(base, suffix), [base]);
}

/** Remap current relative page onto a new base (personal ↔ team). */
export function mapPathToBase(pathname: string, base: string): string {
  // Team settings stays on settings, but must remap :teamId when switching teams.
  if (isTeamSettingsPath(pathname)) {
    if (base.startsWith("/dashboard/teams/")) {
      const newTeamId = base.replace(/^\/dashboard\/teams\//, "").split("/")[0];
      if (newTeamId) return `/dashboard/teams/${newTeamId}/settings`;
    }
    return `/dashboard/${DASHBOARD_HOME_SEGMENT}`;
  }

  const relative = getDashboardRelativePath(pathname);
  const first = relative.split("/")[0] ?? "";
  if (PERSONAL_ONLY_SUFFIXES.has(first)) {
    return `/dashboard/${relative}`;
  }
  return `${base}/${relative}`;
}

export const PERSONAL_WORKSPACE_LS_KEY = "social0.personalWorkspaceId";

export function teamWorkspaceLsKey(teamId: string) {
  return `social0.teamWorkspaceId:${teamId}`;
}

export function writePersonalWorkspaceId(workspaceId: string | null) {
  try {
    if (workspaceId === null) {
      localStorage.setItem(PERSONAL_WORKSPACE_LS_KEY, "null");
    } else {
      localStorage.setItem(PERSONAL_WORKSPACE_LS_KEY, workspaceId);
    }
  } catch {
    // ignore
  }
}

export function readTeamWorkspaceId(teamId: string): string | null {
  try {
    return localStorage.getItem(teamWorkspaceLsKey(teamId));
  } catch {
    return null;
  }
}

export function writeTeamWorkspaceId(teamId: string, workspaceId: string) {
  try {
    localStorage.setItem(teamWorkspaceLsKey(teamId), workspaceId);
  } catch {
    // ignore
  }
}
