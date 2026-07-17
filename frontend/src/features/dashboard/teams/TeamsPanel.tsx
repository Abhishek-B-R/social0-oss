import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import {
  IconCheck,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  getTeam,
  listWorkspaces,
  switchWorkspace,
  type TeamListItem,
  type WorkspaceListItem,
} from "@/api/team";
import DocsInfoIcon from "@/components/info-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DOCS_TEAMS_URL } from "@/lib/docs-url";

const TEAM_QUERY_KEY = ["team"] as const;
const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

function UpgradeEmptyState() {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-bg-elevated px-6 py-12 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
        <IconUsers className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <h2 className="mt-4 font-serif text-xl font-semibold text-text">
        Collaborate with your team
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
        Invite teammates to a shared team. Each team can have multiple
        workspaces. Teams is included with Pro.
      </p>
      <Link
        href="/dashboard/billing"
        className="mt-6 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
      >
        Upgrade to Pro
      </Link>
    </div>
  );
}

export function TeamsPanel() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const workspacesQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
  });

  const teamQuery = useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: getTeam,
  });

  const teams = workspacesQuery.data?.teams ?? [];
  const ownedTeams = useMemo(
    () => teams.filter((t) => t.kind === "owned"),
    [teams],
  );
  const joinedTeams = useMemo(
    () => teams.filter((t) => t.kind === "joined"),
    [teams],
  );

  const canCreateTeam = !!workspacesQuery.data?.canCreateTeam;
  const ownedTeamCount =
    workspacesQuery.data?.ownedTeamCount ?? ownedTeams.length;
  const maxOwnedTeams = workspacesQuery.data?.maxOwnedTeams ?? 5;

  const activeWorkspace =
    workspacesQuery.data?.workspaces.find((w) => w.isActive) ??
    ({
      id: null,
      name: "Main",
      kind: "personal",
      teamId: null,
      teamName: null,
      role: null,
      isOwner: true,
      isActive: true,
      connectionCount: 0,
      memberCount: 1,
    } satisfies WorkspaceListItem);

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
    ]);
  };

  const switchTo = async (workspaceId: string | null, label: string) => {
    const key = workspaceId ?? "main";
    if (
      (workspaceId === null && activeWorkspace.id === null) ||
      workspaceId === activeWorkspace.id
    ) {
      return;
    }
    setBusyId(key);
    try {
      await switchWorkspace(workspaceId);
      await invalidateAll();
      toast.success(`Switched to ${label}`);
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to switch workspace",
      );
      setBusyId(null);
    }
  };

  const loading = workspacesQuery.isLoading || teamQuery.isLoading;

  if (loading) {
    return <TeamsPageSkeleton />;
  }

  if (teamQuery.isError || !teamQuery.data) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        {teamQuery.error instanceof Error
          ? teamQuery.error.message
          : "Could not load teams."}
        <div className="mt-4">
          <Button variant="outline" onClick={() => void teamQuery.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { upgradeRequired } = teamQuery.data;

  if (upgradeRequired && teams.length === 0) {
    return (
      <>
        <TeamsHeader />
        <UpgradeEmptyState />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <TeamsHeader />
        {canCreateTeam ? (
          <Link href="/dashboard/teams/create" className={cn(buttonVariants())}>
            <IconPlus className="h-4 w-4" strokeWidth={1.5} />
            Create team
          </Link>
        ) : null}
      </div>

      <div className="mt-6 space-y-6">
        <div className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-text">
            Current workspace: {activeWorkspace.name}
            {activeWorkspace.teamName
              ? ` · ${activeWorkspace.teamName}`
              : activeWorkspace.kind === "personal"
                ? " · Personal"
                : ""}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Each team can have multiple workspaces. Invited people get access to
            every workspace in that team.
          </p>
          <p className="mt-3 text-xs font-medium text-text-muted">
            {ownedTeamCount} / {maxOwnedTeams} teams created
          </p>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text">My teams</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={workspacesQuery.isFetching}
              onClick={() => void workspacesQuery.refetch()}
            >
              <IconRefresh
                className={`h-4 w-4 ${workspacesQuery.isFetching ? "animate-spin" : ""}`}
                strokeWidth={1.5}
              />
              Refresh
            </Button>
          </div>

          {ownedTeams.length === 0 ? (
            <div className="rounded-xl border border-border bg-bg-elevated px-6 py-12 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-muted text-text-muted">
                <IconUsers className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-text">
                No teams yet
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
                Create your first team to start collaborating.
              </p>
              {canCreateTeam ? (
                <Link
                  href="/dashboard/teams/create"
                  className={cn(buttonVariants(), "mt-6")}
                >
                  <IconPlus className="h-4 w-4" strokeWidth={1.5} />
                  Create your first team
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {ownedTeams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  busyId={busyId}
                  onSwitchWorkspace={(id, name) => void switchTo(id, name)}
                />
              ))}
            </div>
          )}
        </section>

        {joinedTeams.length > 0 ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-text">Joined teams</h2>
            <div className="space-y-3">
              {joinedTeams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  busyId={busyId}
                  onSwitchWorkspace={(id, name) => void switchTo(id, name)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">Personal</h2>
          <ul className="overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">
            <li
              className={`flex items-center justify-between gap-3 px-4 py-3 ${
                activeWorkspace.id === null ? "bg-sidebar-active/40" : ""
              }`}
            >
              <button
                type="button"
                disabled={busyId === "main" || activeWorkspace.id === null}
                onClick={() => void switchTo(null, "Main")}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    activeWorkspace.id === null
                      ? "border-accent bg-accent text-primary-foreground"
                      : "border-border bg-bg"
                  }`}
                >
                  {activeWorkspace.id === null ? (
                    <IconCheck className="h-3 w-3" strokeWidth={2.5} />
                  ) : null}
                </span>
                <span>
                  <span className="block text-sm font-medium text-text">Main</span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    Personal workspace
                  </span>
                </span>
              </button>
              {busyId === "main" ? (
                <IconLoader2
                  className="h-4 w-4 animate-spin text-text-muted"
                  strokeWidth={1.5}
                />
              ) : null}
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}

function TeamCard({
  team,
  busyId,
  onSwitchWorkspace,
}: {
  team: TeamListItem;
  busyId: string | null;
  onSwitchWorkspace: (id: string, name: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{team.name}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
            {team.kind === "joined"
              ? ` · ${team.role === "admin" ? "Admin" : "Member"}`
              : " · Owner"}
          </p>
        </div>
        <Link
          href={`/dashboard/teams/${team.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Manage access
        </Link>
      </div>
      <ul>
        {team.workspaces.map((ws) => {
          const busy = busyId === ws.id;
          return (
            <li
              key={ws.id}
              className={`flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0 ${
                ws.isActive ? "bg-sidebar-active/40" : ""
              }`}
            >
              <button
                type="button"
                disabled={busy || ws.isActive}
                onClick={() => onSwitchWorkspace(ws.id, ws.name)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:opacity-100"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    ws.isActive
                      ? "border-accent bg-accent text-primary-foreground"
                      : "border-border bg-bg"
                  }`}
                >
                  {ws.isActive ? (
                    <IconCheck className="h-3 w-3" strokeWidth={2.5} />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text">
                    {ws.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {ws.connectionCount} connected
                    {!ws.isActive ? " · Click to switch" : " · Active"}
                  </span>
                </span>
              </button>
              {busy ? (
                <IconLoader2
                  className="h-4 w-4 animate-spin text-text-muted"
                  strokeWidth={1.5}
                />
              ) : null}
            </li>
          );
        })}
        {team.workspaces.length === 0 ? (
          <li className="px-4 py-3 text-sm text-text-muted">No workspaces</li>
        ) : null}
      </ul>
    </div>
  );
}

function TeamsHeader() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="mb-2 flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight text-foreground landing sm:text-3xl">
          Teams
        </h1>
        <DocsInfoIcon url={DOCS_TEAMS_URL} />
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Invite teammates and manage access.{" "}
        <Link href="/dashboard/workspaces" className="text-accent hover:underline">
          Manage workspaces
        </Link>
      </p>
    </div>
  );
}

function TeamsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-md bg-bg-muted" />
          <div className="h-4 w-72 max-w-full rounded bg-bg-muted/70" />
        </div>
        <div className="h-9 w-28 rounded-md bg-bg-muted" />
      </div>
      <div className="h-24 rounded-xl border border-border bg-bg-elevated" />
      <div className="h-40 rounded-xl border border-border bg-bg-elevated" />
    </div>
  );
}
