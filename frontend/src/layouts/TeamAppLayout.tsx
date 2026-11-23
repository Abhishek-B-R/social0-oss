import { Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listWorkspaces,
  switchWorkspace,
  type TeamListItem,
  type WorkspacesListResponse,
} from "@/api/team";
import {
  readTeamWorkspaceId,
  writeTeamWorkspaceId,
} from "@/lib/dashboard-base-path";
import {
  resetWorkspaceDataQueries,
  WORKSPACES_QUERY_KEY,
} from "@/lib/team-query-keys";
import {
  hasTeamBootstrap,
  markTeamBootstrapped,
  unmarkTeamBootstrapped,
} from "@/layouts/team-bootstrap";
import { Button } from "@/components/ui/button";

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
 * The gate may skip the loader only when this team was already bootstrapped
 * AND (as far as the cached workspace list knows) the server's active
 * workspace still belongs to it. A marker alone can be stale after a soft
 * switch to another team, which would render this team's pages over that
 * team's workspace data.
 */
function teamGateOpen(
  teamId: string,
  data: WorkspacesListResponse | undefined,
): boolean {
  if (!hasTeamBootstrap(teamId)) return false;
  const active = data?.workspaces.find((w) => w.isActive);
  return !active || active.teamId === teamId;
}

/**
 * Gate for /dashboard/teams/:teamId/* — ensures membership and activates
 * the team's default (or last-used) workspace. Runs once per teamId;
 * subsequent navigations within the team tree only render the Outlet.
 *
 * React Router reuses this route element when only :teamId changes, so the
 * gate is keyed by team: moving from team B's tree to team A's starts A's
 * gate from scratch instead of inheriting B's `ready`.
 */
export function TeamAppLayout() {
  const { teamId } = useParams<{ teamId: string }>();
  if (!teamId) {
    return <Navigate to="/dashboard/teams" replace />;
  }
  return <TeamAppGate key={teamId} teamId={teamId} />;
}

function TeamAppGate({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(() =>
    teamGateOpen(
      teamId,
      queryClient.getQueryData<WorkspacesListResponse>(WORKSPACES_QUERY_KEY),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  // Bumped by Retry so the gate re-runs even when the refetched list is
  // structurally identical (React Query then keeps the same `data` object).
  const [attempt, setAttempt] = useState(0);
  const inFlightFor = useRef<string | null>(null);

  const {
    data,
    isError,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
  });

  useEffect(() => {
    if (!data) return;
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
        if (!active || active.teamId === teamId) {
          setReady(true);
          setError(null);
          inFlightFor.current = null;
          return;
        }
        // The server's active workspace moved off this team (Main or another
        // team) without a full reload, so the marker is stale: rendering now
        // would show this team's URLs over another workspace's data. Every
        // deliberate leave clears the marker before navigating, so this is a
        // soft switch elsewhere; re-gate and switch back below.
        unmarkTeamBootstrapped(teamId);
        setReady(false);
      }

      setError(null);
      try {
        if (!alreadyActive) {
          await switchWorkspace(targetId);
          writeTeamWorkspaceId(teamId, targetId);
          // Mark bootstrapped before invalidate so a refetch can't re-enter
          // the switch path.
          markTeamBootstrapped(teamId);
          // Drop (not just invalidate) every workspace-scoped cache, including
          // pages whose keys carry no team id (posts-page, dashboard-home,
          // queue…): an invalidated inactive query still renders its old
          // rows on mount, so a soft navigation into the team would show
          // Main's cached posts until the refetch landed.
          await resetWorkspaceDataQueries(queryClient, teamId);
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
  }, [teamId, data, queryClient, attempt]);

  const retry = () => {
    setError(null);
    inFlightFor.current = null;
    setAttempt((n) => n + 1);
    void refetch();
  };

  // The workspace list only decides the first entry into a team. Once the
  // gate is open, a failed background refetch (React Query v5 keeps the old
  // data and flips `isError`) must not tear down the page underneath — only
  // the gate's own failure, or a list that never loaded, shows the card.
  const listFailed = !ready && isError && !data && !isFetching;

  if (error || listFailed) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-bg-elevated p-6 text-center">
        <p className="text-sm text-text">
          {error ??
            (queryError instanceof Error
              ? queryError.message
              : "Could not open this team.")}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="outline" onClick={retry}>
            Retry
          </Button>
          <a
            href="/dashboard/teams"
            className="inline-flex h-9 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Back to teams
          </a>
        </div>
      </div>
    );
  }

  // Only block the first entry into a team — never on in-team page changes.
  if (!ready) return <WorkspaceLoading />;

  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <Outlet />
    </Suspense>
  );
}
