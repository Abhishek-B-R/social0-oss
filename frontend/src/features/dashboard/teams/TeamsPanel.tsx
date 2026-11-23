import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import Link from "@/components/AppLink";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/app";
import { buttonVariants } from "@/components/ui/button";
import { listWorkspaces, type TeamListItem } from "@/api/team";
import { workspaceRoleLabel } from "@/lib/workspace-roles";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { cn } from "@/lib/utils";
import { useLimitModal } from "@/components/billing/use-limit-modal";
import { SettingsCard } from "@/features/dashboard/settings/settings-ui";

/**
 * Personal-scope Members: Main is just you, so this lists the teams you own
 * or joined (each links to its Members page) and offers "Create team".
 * Replaces the old /dashboard/teams page.
 */
export function TeamsPanel() {
  const query = useQuery({ queryKey: WORKSPACES_QUERY_KEY, queryFn: listWorkspaces });
  const { openLimit, limitModal } = useLimitModal();

  if (query.isPending) return <SkeletonRows rows={3} />;
  if (query.isError) {
    return (
      <ErrorState
        message="Couldn't load your teams."
        detail={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const data = query.data;
  // Solo containers are workspaces, not teams.
  const teams = data.teams.filter((t) => t.kind === "joined" || t.isCollaborative !== false);
  const canCreateTeam = !!data.canCreateTeam;
  const atCap = data.ownedTeamCount >= data.maxOwnedTeams;

  const createAction = canCreateTeam ? (
    <Link href="/dashboard/teams/create" className={cn(buttonVariants({ size: "sm" }))}>
      <Plus aria-hidden />
      Create team
    </Link>
  ) : null;

  return (
    <div className="space-y-10">
      <SettingsCard
        title="Main is just you"
        description="To post with other people, create a team. A team has its own workspaces, members and roles, and switches from the sidebar."
        actions={createAction}
      >
        {!canCreateTeam ? (
          <p className="text-sm text-text-muted">
            {atCap ? (
              `You've created ${data.maxOwnedTeams} teams, the most you can own.`
            ) : (
              <>
                Teams come with Pro and Max.{" "}
                <button
                  type="button"
                  onClick={() => openLimit("teams")}
                  className="font-medium text-accent hover:underline"
                >
                  See plans
                </button>
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            {data.ownedTeamCount} of {data.maxOwnedTeams} teams created.
          </p>
        )}
      </SettingsCard>

      {teams.length === 0 ? (
        <EmptyState
          compact
          title="No teams yet"
          description="Teams you create or get invited to show up here."
        />
      ) : (
        <section aria-labelledby="settings-your-teams">
          <h2 id="settings-your-teams" className="pb-3 text-[15px] font-semibold text-text">
            Your teams
          </h2>
          <ul className="divide-y divide-border border-t border-border">
            {teams.map((team) => (
              <TeamRow key={team.id} team={team} />
            ))}
          </ul>
        </section>
      )}
      {limitModal}
    </div>
  );
}

function TeamRow({ team }: { team: TeamListItem }) {
  return (
    <li>
      <Link
        href={`/dashboard/teams/${team.id}/settings/members`}
        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-sm font-semibold text-text-muted"
        >
          {team.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">{team.name}</span>
          <span className="block text-[13px] text-text-muted">
            {team.memberCount} {team.memberCount === 1 ? "member" : "members"} ·{" "}
            {team.workspaces.length} {team.workspaces.length === 1 ? "workspace" : "workspaces"} ·{" "}
            {team.kind === "joined" ? workspaceRoleLabel(team.role) : "Owner"}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />
      </Link>
    </li>
  );
}
