import { useEffect, useRef, useState } from "react";
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
import { IconLoader2 } from "@tabler/icons-react";

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

/**
 * Gate for /dashboard/teams/:teamId/* — ensures membership and activates
 * the team's default (or last-used) workspace.
 */
export function TeamAppLayout() {
  const { teamId } = useParams<{ teamId: string }>();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootstrappedFor = useRef<string | null>(null);

  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: !!teamId,
  });

  useEffect(() => {
    if (!teamId || !data) return;
    if (bootstrappedFor.current === teamId && ready) return;

    let cancelled = false;

    (async () => {
      setReady(false);
      setError(null);

      const team: TeamListItem | undefined = data.teams.find(
        (t) => t.id === teamId,
      );
      if (!team) {
        if (!cancelled) {
          setError("Team not found or you no longer have access.");
          setReady(false);
        }
        return;
      }

      // Joined-team URL mode only — owners use personal /dashboard paths.
      if (team.kind === "owned") {
        if (!cancelled) {
          setError("owned-redirect");
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
          setError("This team has no workspaces yet.");
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
          bootstrappedFor.current = teamId;
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to open team workspace",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, data, queryClient, ready]);

  if (!teamId) {
    return <Navigate to="/dashboard/teams" replace />;
  }

  if (error === "owned-redirect") {
    return <Navigate to="/dashboard/composer" replace />;
  }

  if (isLoading || (!ready && !error && !isError)) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 py-20 text-sm text-text-muted">
        <IconLoader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
        Opening team workspace…
      </div>
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

  return <Outlet />;
}
