import { Navigate, useLocation, useParams } from "react-router-dom";
import { useDashboardPath } from "@/lib/dashboard-base-path";

/**
 * Redirect an old dashboard URL to its new home, staying in the current
 * workspace (personal or team) and keeping the old query string, e.g.
 * /posts/drafts?platform=x → /posts?tab=drafts&platform=x.
 */
export function DashboardRedirect({ to }: { to: string }) {
  const dash = useDashboardPath();
  const { search, hash } = useLocation();
  const target = new URL(dash(to), "http://local");
  const old = new URLSearchParams(search);
  for (const [k, v] of old) {
    if (!target.searchParams.has(k)) target.searchParams.set(k, v);
  }
  const qs = target.searchParams.toString();
  return (
    <Navigate
      to={`${target.pathname}${qs ? `?${qs}` : ""}${hash}`}
      replace
    />
  );
}

/** Query params the OAuth connect callbacks add to their redirect. */
const CONNECT_RESULT_PARAMS = ["error", "connected", "reauth"] as const;

/**
 * Workspace index (`/dashboard`, `/dashboard/teams/:teamId`) → Home. Many
 * OAuth callback errors still redirect to `/dashboard?error=…&platform=…`;
 * those go to Accounts, which explains each code and offers the fix.
 */
export function DashboardIndexRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const connectResult = CONNECT_RESULT_PARAMS.some((k) => params.has(k));
  return <DashboardRedirect to={connectResult ? "connections" : "home"} />;
}

/**
 * Old `/posts/:id/edit` (the edit page is gone): bookmarks open the post's
 * detail page, whose Edit action picks the right composer mode from the
 * post's status (draft → `?draft=`, scheduled → `?scheduled=`, published →
 * `?edit=`). Sending every id to `new?edit=` would copy a scheduled post
 * into a second one instead of editing it.
 */
export function EditPostRedirect() {
  const { id = "" } = useParams();
  return <DashboardRedirect to={id ? `posts/${encodeURIComponent(id)}` : "posts"} />;
}
