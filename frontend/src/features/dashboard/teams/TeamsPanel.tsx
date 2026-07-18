import { useQuery } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import { IconPlus, IconUsers } from "@tabler/icons-react";
import { listWorkspaces, type TeamListItem } from "@/api/team";
import DocsInfoIcon from "@/components/info-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";
import { cn } from "@/lib/utils";
import { DOCS_TEAMS_URL } from "@/lib/docs-url";

const WORKSPACES_QUERY_KEY = ["workspaces"] as const;

export function TeamsPanel() {
  const workspacesQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
  });

  const teams = (workspacesQuery.data?.teams ?? []).filter(
    (t) => t.kind === "joined" || t.isCollaborative !== false,
  );
  const canCreateTeam = !!workspacesQuery.data?.canCreateTeam;
  const ownedTeamCount = workspacesQuery.data?.ownedTeamCount ?? 0;
  const maxOwnedTeams = workspacesQuery.data?.maxOwnedTeams ?? 5;

  if (workspacesQuery.isLoading) {
    return <DashboardPageSkeleton message="Loading teams..." />;
  }

  if (workspacesQuery.isError) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-bg-elevated p-6 text-sm text-text">
        {workspacesQuery.error instanceof Error
          ? workspacesQuery.error.message
          : "Could not load teams."}
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => void workspacesQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!canCreateTeam && teams.length === 0) {
    return (
      <>
        <TeamsHeader />
        <div className="mt-6 rounded-2xl border border-border bg-bg-elevated px-6 py-12 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <IconUsers className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h2 className="mt-4 font-serif text-xl font-semibold text-text">
            Collaborate with your team
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
            Invite teammates to a shared team. Teams is included with Pro.
          </p>
          <Link
            href="/dashboard/billing"
            className={cn(buttonVariants(), "mt-6")}
          >
            Upgrade to Pro
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <TeamsHeader />
        <div className="flex flex-wrap gap-2">
          {canCreateTeam ? (
            <Link
              href="/dashboard/teams/create"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <IconPlus className="h-4 w-4" strokeWidth={1.5} />
              Create team
            </Link>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-xs font-medium text-text-muted">
        {ownedTeamCount} / {maxOwnedTeams} teams created
      </p>

      <div className="mt-4">
        {teams.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-elevated px-6 py-12 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-muted text-text-muted">
              <IconUsers className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-text">
              No teams yet
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
              Create a team to invite people and share workspaces.
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
          <ul className="overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">
            {teams.map((team) => (
              <TeamRow key={team.id} team={team} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function TeamRow({ team }: { team: TeamListItem }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={`/dashboard/teams/${team.id}/settings`}
        className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-sidebar-active/40"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{team.name}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
            {" · "}
            {team.workspaces.length}{" "}
            {team.workspaces.length === 1 ? "workspace" : "workspaces"}
            {" · "}
            {team.kind === "joined"
              ? team.role === "admin"
                ? "Admin"
                : "Member"
              : "Owner"}
          </p>
        </div>
      </Link>
    </li>
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
        All teams you own or have joined.
      </p>
    </div>
  );
}
