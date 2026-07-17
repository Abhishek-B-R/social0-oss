import { useLocation, useParams } from "react-router-dom";

/** Paths that live only under personal /dashboard (not mirrored into team URLs). */
const PERSONAL_ONLY_SUFFIXES = new Set([
  "billing",
  "api-keys",
  "feedback",
  "workspaces",
  "teams",
  "more",
  "settings",
]);

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

export function isTeamAppPath(pathname: string): boolean {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return false;
  const rest = pathname
    .slice(`/dashboard/teams/${teamId}`.length)
    .replace(/^\//, "");
  // Settings is team management, not the team app shell
  if (!rest || rest === "settings" || rest.startsWith("settings/")) {
    return false;
  }
  return true;
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
    return rest || "composer";
  }
  const rest = pathname.replace(/^\/dashboard\/?/, "");
  return rest || "composer";
}

export function useDashboardBasePath(): string {
  const { pathname } = useLocation();
  const params = useParams<{ teamId?: string }>();
  const fromParams =
    params.teamId && params.teamId !== "create" ? params.teamId : null;
  const fromPath = getTeamIdFromPathname(pathname);
  const teamId = fromParams ?? fromPath;
  if (teamId && isTeamAppPath(pathname)) {
    return `/dashboard/teams/${teamId}`;
  }
  return "/dashboard";
}

export function useDashboardPath() {
  const base = useDashboardBasePath();
  return (suffix = "") => {
    const clean = suffix.replace(/^\//, "");
    if (!clean) return `${base}/composer`;
    const first = clean.split("/")[0] ?? "";
    if (PERSONAL_ONLY_SUFFIXES.has(first)) {
      return `/dashboard/${clean}`;
    }
    return `${base}/${clean}`;
  };
}

/** Remap current relative page onto a new base (personal ↔ team). */
export function mapPathToBase(pathname: string, base: string): string {
  const relative = getDashboardRelativePath(pathname);
  const first = relative.split("/")[0] ?? "";
  if (PERSONAL_ONLY_SUFFIXES.has(first)) {
    return `/dashboard/${relative}`;
  }
  // Team settings only exists under team management URL
  if (relative === "settings" || relative.startsWith("settings/")) {
    if (base === "/dashboard") return "/dashboard/composer";
    // Don't map into /teams/:id/settings from relative "settings" when leaving team app —
    // personal queue settings stay at /dashboard/settings (PERSONAL_ONLY).
  }
  return `${base}/${relative}`;
}

export const PERSONAL_WORKSPACE_LS_KEY = "social0.personalWorkspaceId";

export function teamWorkspaceLsKey(teamId: string) {
  return `social0.teamWorkspaceId:${teamId}`;
}

export function readPersonalWorkspaceId(): string | null {
  try {
    const raw = localStorage.getItem(PERSONAL_WORKSPACE_LS_KEY);
    if (raw === null || raw === "" || raw === "null") return null;
    return raw;
  } catch {
    return null;
  }
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
