import { Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listWorkspaces,
  switchWorkspace,
  type TeamListItem,
} from "@/api/team";
import {
  readTeamWorkspaceId,
  writeTeamWorkspaceId,
} from "@/lib/dashboard-base-path";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";

/** Survives layout remounts so in-team navigations don't flash the gate. */
const bootstrappedTeams = new Set<string>();

/** Call when deliberately leaving a team URL tree (e.g. switcher → Main). */
export function clearTeamBootstrap(teamId?: string | null) {
  if (teamId) {
    bootstrappedTeams.delete(teamId);
    return;
  }
  bootstrappedTeams.clear();
}

/**
 * Gate for /dashboard/teams/:teamId/* — ensures membership and activates
 * the team's default (or last-used) workspace. Runs once per teamId;
 * subsequent navigations within the team tree only render the Outlet.
 */
export function TeamAppLayout() {
  const { teamId } = useParams<{ teamId: string }>();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(
    () => !!teamId && bootstrappedTeams.has(teamId),
  );
  const [error, setError] = useState<string | null>(null);
  const inFlightFor = useRef<string | null>(null);

  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: !!teamId,
  });

  useEffect(() => {
    if (!teamId || !data) return;
    if (inFlightFor.current === teamId) return;

    const team: TeamListItem | undefined = data.teams.find(
      (t) => t.id === teamId,
    );
    if (!team) {
      bootstrappedTeams.delete(teamId);
      setError("Team not found or you no longer have access.");
      setReady(false);
      return;
    }

    const stored = readTeamWorkspaceId(teamId);
    const storedValid =
      stored && team.workspaces.some((w) => w.id === stored) ? stored : null;
    const targetId =
      storedValid ??
      team.defaultWorkspaceId ??
      team.workspaces[0]?.id ??
      null;

    if (!targetId) {
      bootstrappedTeams.delete(teamId);
      setError("This team has no workspaces yet.");
      setReady(false);
      return;
    }

    const active = data.workspaces.find((w) => w.isActive);
    const alreadyActive = data.workspaces.some(
      (w) => w.id === targetId && w.isActive,
    );

    // Already gated for this team — never switchWorkspace again from a
    // query refetch (that caused infinite switch → invalidate → switch loops).
    if (bootstrappedTeams.has(teamId)) {
      // Mid-leave: active workspace is no longer this team's (Main or another
      // team). Don't yank it back — the switcher is navigating away.
      if (active && active.teamId !== teamId) {
        setReady(true);
        setError(null);
        return;
      }
      setReady(true);
      setError(null);
      return;
    }

    let cancelled = false;
    inFlightFor.current = teamId;

    (async () => {
      setError(null);
      try {
        if (!alreadyActive) {
          await switchWorkspace(targetId);
          writeTeamWorkspaceId(teamId, targetId);
          // Mark bootstrapped before invalidate so a refetch can't re-enter
          // the switch path.
          bootstrappedTeams.add(teamId);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
            queryClient.invalidateQueries({ queryKey: ["team"] }),
            queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
            queryClient.invalidateQueries({ queryKey: ["connections"] }),
          ]);
        } else {
          writeTeamWorkspaceId(teamId, targetId);
          bootstrappedTeams.add(teamId);
        }
        if (!cancelled) {
          inFlightFor.current = null;
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          bootstrappedTeams.delete(teamId);
          inFlightFor.current = null;
          setError(
            err instanceof Error
              ? err.message
              : "Failed to open team workspace",
          );
          setReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (inFlightFor.current === teamId) {
        inFlightFor.current = null;
      }
    };
  }, [teamId, data, queryClient]);

  if (!teamId) {
    return <Navigate to="/dashboard/teams" replace />;
  }

  // Only block the first entry into a team — never on in-team page changes.
  if (!ready && (isLoading || (!error && !isError))) {
    return (
      <DashboardPageSkeleton message="Opening team workspace..." />
    );
  }

  if (isError || error) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-bg-elevated p-6 text-center">
        <p className="text-sm text-text">
          {error ??
            (queryError instanceof Error
              ? queryError.message
              : "Could not open this team.")}
        </p>
        <a
          href="/dashboard/teams"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Back to teams
        </a>
      </div>
    );
  }

  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading..." />}>
      <Outlet />
    </Suspense>
  );
}
