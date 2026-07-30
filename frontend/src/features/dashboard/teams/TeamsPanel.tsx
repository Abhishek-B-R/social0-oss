import { useQuery } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import {
  Plus,
  UsersThree,
} from "@/icons/phosphor";
import { listWorkspaces, type TeamListItem } from "@/api/team";
import DocsInfoIcon from "@/components/info-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { TeamsPageSkeleton } from "@/components/ui/page-skeletons";
import { cn } from "@/lib/utils";
import { DOCS_TEAMS_URL } from "@/lib/docs-url";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";

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
    return <TeamsPageSkeleton />;
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
        <div className="mt-6 rounded-xl border border-border bg-bg-elevated p-8 text-center">
          <p className="text-sm text-text-muted">
            Invite teammates to a shared team. Included with Pro.
          </p>
          <Link
            href="/dashboard/billing"
            className={cn(buttonVariants({ size: "sm" }), "mt-4")}
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
              <Plus className="h-4 w-4" />
              Create team
            </Link>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-xs text-text-muted">
        {ownedTeamCount} / {maxOwnedTeams} teams created
      </p>

      <div className="mt-4">
        {teams.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center">
            <UsersThree
              className="mx-auto h-8 w-8 text-text-muted opacity-50"
            />
            <p className="mt-3 text-sm text-text-muted">
              No teams yet. Create one to invite people and share workspaces.
            </p>
            {canCreateTeam ? (
              <Link
                href="/dashboard/teams/create"
                className={cn(buttonVariants({ size: "sm" }), "mt-4")}
              >
                <Plus className="h-4 w-4" />
                Create team
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
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
        className="flex w-full items-center gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-muted"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{team.name}</p>
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
        Teams you own or have joined.
      </p>
    </div>
  );
}
