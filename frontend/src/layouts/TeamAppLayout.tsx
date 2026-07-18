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

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

/** Survives layout remounts so in-team navigations don't flash the gate. */
const bootstrappedTeams = new Set<string>();

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
    if (!teamId) return;

    // Already gated this team in this session — stay ready, sync quietly.
    if (bootstrappedTeams.has(teamId)) {
      setReady(true);
      setError(null);
      return;
    }

    if (!data) return;
    if (inFlightFor.current === teamId) return;

    let cancelled = false;
    inFlightFor.current = teamId;

    (async () => {
      setError(null);

      const team: TeamListItem | undefined = data.teams.find(
        (t) => t.id === teamId,
      );
      if (!team) {
        if (!cancelled) {
          inFlightFor.current = null;
          setError("Team not found or you no longer have access.");
          setReady(false);
        }
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
        if (!cancelled) {
          inFlightFor.current = null;
          setError("This team has no workspaces yet.");
          setReady(false);
        }
        return;
      }

      const alreadyActive = data.workspaces.some(
        (w) => w.id === targetId && w.isActive,
      );

      try {
        if (!alreadyActive) {
          await switchWorkspace(targetId);
          writeTeamWorkspaceId(teamId, targetId);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
            queryClient.invalidateQueries({ queryKey: ["team"] }),
            queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
            queryClient.invalidateQueries({ queryKey: ["connections"] }),
          ]);
        } else {
          writeTeamWorkspaceId(teamId, targetId);
        }
        if (!cancelled) {
          bootstrappedTeams.add(teamId);
          inFlightFor.current = null;
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
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
          className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
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
