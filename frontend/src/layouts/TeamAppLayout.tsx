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
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import {
  hasTeamBootstrap,
  markTeamBootstrapped,
  unmarkTeamBootstrapped,
} from "@/layouts/team-bootstrap";

/** Same vibe as /auth/continue — spinner + short line, no fake page chrome. */
function WorkspaceLoading({
  label = "Loading workspace…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-5"
      aria-busy="true"
      aria-live="polite"
    >
      <svg
        className="h-8 w-8 animate-spin text-accent"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
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
    () => !!teamId && hasTeamBootstrap(teamId),
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

    let cancelled = false;
    inFlightFor.current = teamId;

    void (async () => {
      // Yield so status updates aren't synchronous setState-in-effect.
      await Promise.resolve();
      if (cancelled) return;

      const team: TeamListItem | undefined = data.teams.find(
        (t) => t.id === teamId,
      );
      if (!team) {
        unmarkTeamBootstrapped(teamId);
        setError("Team not found or you no longer have access.");
        setReady(false);
        inFlightFor.current = null;
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
        unmarkTeamBootstrapped(teamId);
        setError("This team has no workspaces yet.");
        setReady(false);
        inFlightFor.current = null;
        return;
      }

      const active = data.workspaces.find((w) => w.isActive);
      const alreadyActive = data.workspaces.some(
        (w) => w.id === targetId && w.isActive,
      );

      // Already gated for this team — never switchWorkspace again from a
      // query refetch (that caused infinite switch → invalidate → switch loops).
      if (hasTeamBootstrap(teamId)) {
        // Mid-leave: active workspace is no longer this team's (Main or another
        // team). Don't yank it back — the switcher is navigating away.
        if (active && active.teamId !== teamId) {
          setReady(true);
          setError(null);
          inFlightFor.current = null;
          return;
        }
        setReady(true);
        setError(null);
        inFlightFor.current = null;
        return;
      }

      setError(null);
      try {
        if (!alreadyActive) {
          await switchWorkspace(targetId);
          writeTeamWorkspaceId(teamId, targetId);
          // Mark bootstrapped before invalidate so a refetch can't re-enter
          // the switch path.
          markTeamBootstrapped(teamId);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
            queryClient.invalidateQueries({ queryKey: ["team"] }),
            queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
            queryClient.invalidateQueries({ queryKey: ["connections"] }),
            queryClient.invalidateQueries({ queryKey: ["analytics-overview"] }),
            queryClient.invalidateQueries({ queryKey: ["analytics-accounts"] }),
            queryClient.invalidateQueries({ queryKey: ["inbox-comments"] }),
            queryClient.invalidateQueries({ queryKey: ["inbox-dms"] }),
            queryClient.invalidateQueries({ queryKey: ["inbox-accounts"] }),
            queryClient.invalidateQueries({ queryKey: ["inbox-dm-thread"] }),
          ]);
        } else {
          writeTeamWorkspaceId(teamId, targetId);
          markTeamBootstrapped(teamId);
        }
        if (!cancelled) {
          inFlightFor.current = null;
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          unmarkTeamBootstrapped(teamId);
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
    return <WorkspaceLoading />;
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
    <Suspense fallback={<WorkspaceLoading />}>
      <Outlet />
    </Suspense>
  );
}
