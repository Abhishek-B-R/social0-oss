import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import { ErrorState, PageContainer, PageHeader, SkeletonCard } from "@/components/app";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createTeam, listWorkspaces } from "@/api/team";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { cn } from "@/lib/utils";
import { FieldError, settingsInputClass } from "@/features/dashboard/settings/settings-ui";
import { useLimitModal } from "@/components/billing/use-limit-modal";

const BACK_HREF = "/dashboard/settings/members";

/** Page header with the way back to Settings → Members. */
function Header() {
  return (
    <PageHeader
      title="Create a team"
      breadcrumb={
        <Link href={BACK_HREF} className="inline-flex items-center gap-1.5 hover:text-text">
          <ArrowLeft className="size-3.5" aria-hidden />
          Settings
        </Link>
      }
    />
  );
}

/** /dashboard/teams/create. After creating, opens the new team's Members to invite people. */
export function CreateTeamPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { openLimit, limitModal } = useLimitModal();

  const workspacesQuery = useQuery({ queryKey: WORKSPACES_QUERY_KEY, queryFn: listWorkspaces });
  const data = workspacesQuery.data;
  const maxTeams = data?.maxOwnedTeams ?? 5;
  const atCap = (data?.ownedTeamCount ?? 0) >= maxTeams;
  const trimmed = teamName.trim();

  const handleCreate = async () => {
    if (!trimmed) {
      setError("Give the team a name.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const { teamId } = await createTeam(trimmed);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["team"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] }),
        queryClient.invalidateQueries({ queryKey: ["connections"] }),
      ]);
      toast.success(`Created ${trimmed}`, { description: "Invite people to get started." });
      navigate(`/dashboard/teams/${teamId}/settings/members?invite=1`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the team. Try again.");
      setCreating(false);
    }
  };

  if (workspacesQuery.isPending) {
    return (
      <PageContainer>
        <Header />
        <div className="max-w-xl">
          <SkeletonCard lines={3} />
        </div>
      </PageContainer>
    );
  }

  if (workspacesQuery.isError) {
    return (
      <PageContainer>
        <Header />
        <div className="max-w-xl">
          <ErrorState
            message="Couldn't check your team limits."
            detail={workspacesQuery.error instanceof Error ? workspacesQuery.error.message : undefined}
            onRetry={() => void workspacesQuery.refetch()}
            retrying={workspacesQuery.isFetching}
          />
        </div>
      </PageContainer>
    );
  }

  if (!data?.canCreateTeam) {
    return (
      <PageContainer>
        <Header />
        <div className="max-w-xl rounded-xl border border-border bg-bg-elevated p-5">
          <p className="text-sm text-text">
            {atCap
              ? `You already own ${maxTeams} teams, the most you can have. Delete one to make another.`
              : "Teams come with Pro and Max. Upgrade to invite people and share workspaces."}
          </p>
          <div className="mt-4">
            {atCap ? (
              <Link
                href={BACK_HREF}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Back to settings
              </Link>
            ) : (
              <Button size="sm" onClick={() => openLimit("teams")}>
                See plans
              </Button>
            )}
          </div>
        </div>
        {limitModal}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Header />
      <form
        className="max-w-xl space-y-4 rounded-xl border border-border bg-bg-elevated p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void handleCreate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="create-team-name">Team name</Label>
          <input
            id="create-team-name"
            value={teamName}
            onChange={(e) => {
              setTeamName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Acme Agency"
            maxLength={80}
            autoFocus
            disabled={creating}
            aria-invalid={error ? true : undefined}
            className={settingsInputClass}
          />
          <p className="text-xs text-text-muted">
            A team gets its own members, roles and a first workspace
            {trimmed ? ` (${trimmed}'s default)` : ""}. You can add more workspaces later.{" "}
            {data.ownedTeamCount} of {maxTeams} teams created.
          </p>
          <FieldError>{error}</FieldError>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={creating} onClick={() => navigate(BACK_HREF)}>
            Cancel
          </Button>
          <Button type="submit" disabled={creating || !trimmed}>
            {creating ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {creating ? "Creating…" : "Create team"}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
