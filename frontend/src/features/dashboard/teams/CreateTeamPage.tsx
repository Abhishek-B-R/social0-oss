import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import { IconArrowLeft, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { createTeam, listWorkspaces } from "@/api/team";
import { Button } from "@/components/ui/button";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";

export function CreateTeamPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
  });

  const canCreate = !!workspacesQuery.data?.canCreateTeam;
  const atCap =
    (workspacesQuery.data?.ownedTeamCount ?? 0) >=
    (workspacesQuery.data?.maxOwnedTeams ?? 5);

  const trimmedTeam = teamName.trim();
  const defaultWorkspacePreview = trimmedTeam
    ? `${trimmedTeam}'s default workspace`
    : "Your team's default workspace";

  const handleCreate = async () => {
    const name = trimmedTeam;
    if (!name) {
      toast.error("Enter a team name");
      return;
    }
    setCreating(true);
    try {
      const { teamId } = await createTeam(name);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["team"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
        queryClient.invalidateQueries({ queryKey: ["connections"] }),
      ]);
      toast.success("Team created");
      navigate(`/dashboard/teams/${teamId}/settings`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create team");
      setCreating(false);
    }
  };

  if (workspacesQuery.isLoading) {
    return <DashboardPageSkeleton message="Loading..." />;
  }

  if (workspacesQuery.isError) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/teams"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <IconArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Back to teams
        </Link>
        <div className="rounded-xl border border-border bg-bg-elevated p-6 text-sm text-text">
          {workspacesQuery.error instanceof Error
            ? workspacesQuery.error.message
            : "Couldn’t load team limits. Try again."}
          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => void workspacesQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/teams"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <IconArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Back to teams
        </Link>
        <div className="rounded-xl border border-border bg-bg-elevated p-6 text-sm text-text">
          {atCap
            ? `You've reached the limit of ${workspacesQuery.data?.maxOwnedTeams ?? 5} teams.`
            : "Creating teams requires Pro."}
          <div className="mt-4">
            <Link href={atCap ? "/dashboard/teams" : "/dashboard/billing"}>
              <Button variant="outline">{atCap ? "Back" : "Upgrade to Pro"}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/dashboard/teams"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
      >
        <IconArrowLeft className="h-4 w-4" strokeWidth={1.5} />
        Back to teams
      </Link>

      <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight text-foreground landing sm:text-3xl">
        Create new team
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        Create a team with a default workspace. You can add more workspaces
        later.
      </p>

      <div className="mt-6 space-y-5 rounded-xl border border-border bg-bg-elevated p-5 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="team-name">Team name</Label>
          <Input
            id="team-name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="e.g. Marketing"
            maxLength={80}
            autoFocus
            disabled={creating}
          />
        </div>

        <div className="rounded-xl border border-border bg-bg px-3 py-2.5">
          <p className="text-xs text-text-muted">Default workspace</p>
          <p className="mt-1 text-sm text-text">{defaultWorkspacePreview}</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={creating}
            onClick={() => navigate("/dashboard/teams")}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={creating || !trimmedTeam}
            onClick={() => void handleCreate()}
          >
            {creating ? (
              <IconLoader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : null}
            Create team
          </Button>
        </div>
      </div>
    </div>
  );
}
